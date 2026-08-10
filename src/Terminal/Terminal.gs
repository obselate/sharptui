package SharpTui

import System
import System.IO
import System.Text
import System.Threading

internal class Terminal {
  private var entered bool
  private var wake AutoResetEvent
  private var host TerminalHost
  private var frame TerminalBuffer
  private var outputGate Object
  private var input Input?
  private var negotiation TerminalNegotiation
  private var reader Thread?
  private var reading int32
  private var queryStarted int64
  private var flushStarted int64
  private var fallbackConfigured bool
  private var kittyEnabled bool
  private var readerFault int32

  /// Painted by the terminal itself when it clears on resize.
  public var Background int32

  /// Creates a terminal bound to the platform's native host, setting wakeup so
  /// App.Run's poll loop wakes when a background read or fault needs handling.
  public init(wakeup AutoResetEvent) {
    initialize(wakeup, TerminalHosts.Create(wakeup))
  }

  internal init(wakeup AutoResetEvent, stream Stream) {
    initialize(wakeup, TerminalStreamHost(stream))
  }

  internal init(wakeup AutoResetEvent, terminalHost TerminalHost) {
    initialize(wakeup, terminalHost)
  }

  private func initialize(wakeup AutoResetEvent, terminalHost TerminalHost) {
    entered = false
    wake = wakeup
    host = terminalHost
    frame = TerminalBuffer(4096)
    outputGate = Object()
    input = nil
    negotiation = TerminalNegotiation()
    reader = nil
    reading = 0
    queryStarted = 0
    flushStarted = 0
    fallbackConfigured = false
    kittyEnabled = false
    readerFault = 0
    Background = -1
  }

  /// Enters raw mode with MouseTracking.Drag; equivalent to calling the
  /// two-argument overload with that tracking mode.
  public func Enter(inputSource Input) {
    Enter(inputSource, MouseTracking.Drag)
  }

  /// Switches into the alternate screen, hides the cursor, enables the given
  /// mouse tracking mode and bracketed paste, then starts the background
  /// reader thread. Throws if standard input or output is not a terminal,
  /// unwinding any state already applied before re-throwing.
  public func Enter(inputSource Input, mouseTracking MouseTracking) {
    var failure Exception?
    lock outputGate {
      if entered { return }
      try {
        if !host.Enter() { throw InvalidOperationException("sharptui: standard input and output must be terminals") }
        entered = true
        input = inputSource
        kittyEnabled = false
        writeText(Ansi.AltScreenOn + Ansi.CursorHide + Ansi.MouseOn(mouseTracking) + Ansi.BracketedPasteOn)
        if Background >= 0 { writeText(Ansi.SetBackground(Background)) }
        negotiation.Begin()
        queryStarted = Environment.TickCount64
        flushStarted = 0
        fallbackConfigured = false
        Interlocked.Exchange(ref readerFault, 0)
        writeText(Ansi.KittyKeyboardQuery)
        Interlocked.Exchange(ref reading, 1)
        let nextReader = Thread(readLoop)
        nextReader.IsBackground = true
        reader = nextReader
        nextReader.Start()
      } catch (error Exception) {
        entered = false
        Interlocked.Exchange(ref reading, 0)
        reader = nil
        try {
          let kitty = kittyEnabled ? Ansi.KittyKeyboardDisable : ""
          writeText(kitty + Ansi.BracketedPasteOff + Ansi.MouseOff
            + Ansi.CursorShow + Ansi.AltScreenOff)
        } catch (ignored Exception) {}
        host.Restore()
        input = nil
        kittyEnabled = false
        failure = error
      }
    }
    if failure != nil { throw failure }
  }

  /// Restores platform state and every terminal mode changed by Enter.
  public func Restore() {
    var activeReader Thread?
    lock outputGate {
      if !entered { return }
      entered = false
      Interlocked.Exchange(ref reading, 0)
      host.WakeReader()
      activeReader = reader
      reader = nil
    }
    if activeReader != nil && activeReader.ManagedThreadId != Environment.CurrentManagedThreadId {
      activeReader.Join()
    }
    lock outputGate {
      try {
        if kittyEnabled { writeText(Ansi.KittyKeyboardDisable) }
        if Background >= 0 { writeText(Ansi.ResetBackground) }
        writeText(Ansi.BracketedPasteOff + Ansi.MouseOff + Ansi.CursorShow + Ansi.AltScreenOff)
      } finally {
        host.Restore()
        input = nil
        kittyEnabled = false
      }
    }
  }

  /// Writes text straight to the terminal output, bypassing the screen's cell
  /// diffing.
  public func Write(text string) {
    lock outputGate { writeText(text) }
  }

  /// Emits the screen's changed cells and returns how many cells were sent.
  /// Invalidates the screen so the next Present repaints fully if the write
  /// does not complete.
  public func Present(screen Screen) int32 {
    lock outputGate {
      var sent = false
      try {
        let count = screen.Emit(frame)
        if count == 0 {
          sent = true
          return 0
        }
        frame.WriteTo(host.Output())
        host.Output().Flush()
        sent = true
        return count
      } finally {
        if !sent { screen.Invalidate() }
      }
    }
  }

  /// Reports whether both standard input and output are attached to a
  /// terminal.
  public func IsTty() bool {
    return host.IsTty()
  }

  /// Returns the current terminal width in columns, read live from the host
  /// rather than a cached value.
  public func Columns() int32 {
    return host.Columns()
  }

  /// Returns the current terminal height in rows, read live from the host
  /// rather than a cached value.
  public func Rows() int32 {
    return host.Rows()
  }

  /// Reports whether a resize was observed since the last call, clearing the
  /// flag as it does.
  public func ConsumeResize() bool {
    return host.ConsumeResize()
  }

  /// Reports whether the host requested exit or the background reader thread
  /// faulted, clearing both flags as it does.
  public func ConsumeExit() bool {
    return host.ConsumeExit() || Interlocked.Exchange(ref readerFault, 0) != 0
  }

  private func readLoop() {
    try {
      readLoopCore()
    } catch (error Exception) {
      Interlocked.Exchange(ref readerFault, 1)
      wake.Set()
    }
  }

  private func readLoopCore() {
    let receiver = input
    if receiver == nil { return }
    let buffer = [1024]uint8{}
    while Interlocked.CompareExchange(ref reading, 0, 0) != 0 {
      let count = host.Read(buffer, readTimeout())
      if Interlocked.CompareExchange(ref reading, 0, 0) == 0 { return }
      if count < 0 {
        Interlocked.Exchange(ref readerFault, 1)
        receiver.Finish()
        wake.Set()
        return
      }
      if count == 0 {
        expirePending(receiver)
        continue
      }
      negotiation.Feed(receiver, buffer, 0, count)
      resolveNegotiation(receiver)
      flushStarted = receiver.HasPendingPrefix() || negotiation.HasPendingPrefix()
        ? Environment.TickCount64 : 0
    }
  }

  private func readTimeout() int32 {
    let now = Environment.TickCount64
    var timeout int64 = -1
    if negotiation.IsQuerying() {
      let left = 250 - (now - queryStarted)
      timeout = left > 0 ? left : 0
    }
    if flushStarted != 0 {
      let left = 25 - (now - flushStarted)
      if timeout < 0 || left < timeout { timeout = left > 0 ? left : 0 }
    }
    return timeout < 0 ? -1 : int32(timeout)
  }

  private func expirePending(input Input) {
    let now = Environment.TickCount64
    if negotiation.IsQuerying() && now - queryStarted >= 250 {
      negotiation.Expire()
      if !fallbackConfigured {
        fallbackConfigured = true
        var sequences []TerminfoKeySequence
        if TerminfoCapabilities.TryLoad(out sequences) { input.ConfigureTerminfo(sequences) }
      }
      negotiation.Drain(input)
      flushStarted = input.HasPendingPrefix() || negotiation.HasPendingPrefix() ? now : 0
    }
    if flushStarted != 0 && now - flushStarted >= 25 {
      negotiation.FlushPending(input)
      input.FlushPending()
      flushStarted = 0
    }
  }

  private func resolveNegotiation(input Input) {
    if !negotiation.TakeSupportChange() || !negotiation.IsSupported() { return }
    enableKittyIfSupported()
    negotiation.Drain(input)
  }

  private func enableKittyIfSupported() {
    lock outputGate {
      if !entered || kittyEnabled { return }
      writeText(Ansi.KittyKeyboardEnable)
      kittyEnabled = true
    }
  }

  private func writeText(text string) {
    if text.Length == 0 { return }
    let bytes = Encoding.UTF8.GetBytes(text)
    let output = host.Output()
    output.Write(bytes, 0, bytes.Length)
    output.Flush()
  }
}
