package SharpTui

import System
import System.Collections.Generic
import System.IO
import System.Text
import System.Runtime.InteropServices
import System.Threading

internal class TerminalHostCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      failed = failed + Checks.Expect(Ansi.KittyKeyboardQuery == Ansi.Csi + "?u"
          && Ansi.KittyKeyboardEnable == Ansi.Csi + ">31u"
          && Ansi.KittyKeyboardDisable == Ansi.Csi + "<u",
        "Kitty keyboard lifecycle bytes are exact")
      failed = failed + Checks.Expect(Ansi.DefaultBackgroundQuery
          == Ansi.Esc + "]11;?" + char(7).ToString()
          && Ansi.SetDefaultBackground("rgb:1234/ab/0F")
            == Ansi.Esc + "]11;rgb:1234/ab/0F" + Ansi.Esc + "\\",
        "OSC 11 query and literal set bytes are exact")

      failed = failed + Checks.Expect(Ansi.MouseOn(MouseTracking.Disabled) == ""
          && Ansi.MouseOn(MouseTracking.Click) == Ansi.Csi + "?1000h" + Ansi.Csi + "?1006h"
          && Ansi.MouseOn(MouseTracking.Drag) == Ansi.Csi + "?1002h" + Ansi.Csi + "?1006h"
          && Ansi.MouseOn(MouseTracking.AllMotion) == Ansi.Csi + "?1003h" + Ansi.Csi + "?1006h",
        "mouse tracking policies emit the exact DEC modes")
      failed = failed + Checks.Expect(Ansi.MouseOff == Ansi.Csi + "?1006l" + Ansi.Csi + "?1003l"
          + Ansi.Csi + "?1002l" + Ansi.Csi + "?1000l",
        "mouse restore disables every tracking mode")

      let probeInput = Input(AutoResetEvent(false))
      let negotiation = TerminalNegotiation()
      negotiation.Begin(false)
      negotiation.Feed(probeInput, []uint8{ 97, 27, 91, 63, 51 }, 0, 5)
      var event = UiEvent{}
      failed = failed + Checks.Expect(!probeInput.TryDequeue(out event),
        "probe-era input waits for capability resolution")
      negotiation.Feed(probeInput, []uint8{ 49, 117, 98 }, 0, 3)
      failed = failed + Checks.Expect(negotiation.TakeSupportChange() && negotiation.IsSupported(),
        "split Kitty reply enables the protocol")
      negotiation.Drain(probeInput)
      let supported = terminalEvents(probeInput)
      failed = failed + Checks.Expect(supported.Count == 2 && supported[0].Text == "a"
          && supported[1].Text == "b",
        "Kitty reply is quarantined and buffered input stays ordered")

      let backgroundInput = Input(AutoResetEvent(false))
      let background = TerminalNegotiation()
      background.Begin()
      background.Feed(backgroundInput, []uint8{ 97, 27, 93, 49, 49, 59, 114, 103 }, 0, 8)
      background.Feed(backgroundInput,
        []uint8{ 98, 58, 49, 50, 51, 52, 47, 97, 98, 47, 48, 70, 27 }, 0, 13)
      background.Feed(backgroundInput, []uint8{ 92, 99 }, 0, 2)
      var savedBackground string
      let gotBackground = background.TakeBackground(out savedBackground)
      failed = failed + Checks.Expect(!backgroundInput.TryDequeue(out event),
        "ordinary input stays quarantined until Kitty negotiation also resolves")
      background.Expire()
      background.Drain(backgroundInput)
      let backgroundEvents = terminalEvents(backgroundInput)
      failed = failed + Checks.Expect(gotBackground && savedBackground == "rgb:1234/ab/0F"
          && backgroundEvents.Count == 2 && backgroundEvents[0].Text == "a"
          && backgroundEvents[1].Text == "c"
          && !backgroundInput.TryDequeue(out event),
        "split ST OSC 11 replies are captured without leaking")

      let belInput = Input(AutoResetEvent(false))
      let bel = TerminalNegotiation()
      bel.Begin()
      bel.Feed(belInput, Encoding.ASCII.GetBytes("x\u001b]11;#123456\u0007y"), 0, 15)
      var belColor string
      let gotBel = bel.TakeBackground(out belColor)
      bel.Expire()
      bel.Drain(belInput)
      let belEvents = terminalEvents(belInput)
      failed = failed + Checks.Expect(gotBel && belColor == "#123456"
          && belEvents.Count == 2 && belEvents[0].Text == "x" && belEvents[1].Text == "y",
        "BEL OSC 11 replies are captured without leaking")

      let malformedInput = Input(AutoResetEvent(false))
      let malformed = TerminalNegotiation()
      malformed.Begin()
      let malformedBytes = Encoding.ASCII.GetBytes("m\u001b]11;rgb:12/zz/34\u0007n")
      malformed.Feed(malformedInput, malformedBytes, 0, malformedBytes.Length)
      var malformedColor string
      failed = failed + Checks.Expect(!malformed.TakeBackground(out malformedColor),
        "malformed OSC 11 replies are rejected")
      malformed.Expire()
      malformed.ExpireBackground()
      malformed.Drain(malformedInput)
      malformed.FlushPending(malformedInput)
      let malformedEvents = terminalEvents(malformedInput)
      failed = failed + Checks.Expect(malformedEvents.Count == 2
          && malformedEvents[0].Text == "m" && malformedEvents[1].Text == "n",
        "malformed OSC 11 replies do not leak into input")

      let truncatedInput = Input(AutoResetEvent(false))
      let truncated = TerminalNegotiation()
      truncated.Begin()
      let truncatedBytes = Encoding.ASCII.GetBytes("a\u001b]11;rgb:12/")
      truncated.Feed(truncatedInput, truncatedBytes, 0, truncatedBytes.Length)
      truncated.ExpireBackground()
      truncated.Expire()
      truncated.Drain(truncatedInput)
      truncated.FlushPending(truncatedInput)
      let truncatedEvents = terminalEvents(truncatedInput)
      failed = failed + Checks.Expect(truncatedEvents.Count == 1
          && truncatedEvents[0].Text == "a",
        "truncated OSC 11 replies do not leak after timeout")

      let oversizedText = StringBuilder("o\u001b]11;rgb:")
      for i in 0 ... 140 { oversizedText.Append(char(97)) }
      oversizedText.Append(char(7))
      oversizedText.Append(char(112))
      let oversizedInput = Input(AutoResetEvent(false))
      let oversized = TerminalNegotiation()
      oversized.Begin()
      let oversizedBytes = Encoding.ASCII.GetBytes(oversizedText.ToString())
      oversized.Feed(oversizedInput, oversizedBytes, 0, oversizedBytes.Length)
      oversized.ExpireBackground()
      oversized.Expire()
      oversized.Drain(oversizedInput)
      let oversizedEvents = terminalEvents(oversizedInput)
      failed = failed + Checks.Expect(oversizedEvents.Count == 2
          && oversizedEvents[0].Text == "o" && oversizedEvents[1].Text == "p",
        "oversized OSC 11 replies are discarded without leaking")

      let timeoutInput = Input(AutoResetEvent(false))
      let timeoutNegotiation = TerminalNegotiation()
      timeoutNegotiation.Begin()
      timeoutNegotiation.Feed(timeoutInput, []uint8{ 116 }, 0, 1)
      timeoutNegotiation.Expire()
      timeoutNegotiation.ExpireBackground()
      timeoutNegotiation.Drain(timeoutInput)
      let timeoutEvents = terminalEvents(timeoutInput)
      var timeoutColor string
      failed = failed + Checks.Expect(!timeoutNegotiation.TakeBackground(out timeoutColor)
          && timeoutEvents.Count == 1 && timeoutEvents[0].Text == "t",
        "OSC 11 timeout releases buffered input without setting a color")

      let steadyOscInput = Input(AutoResetEvent(false))
      let steadyOsc = TerminalNegotiation()
      steadyOsc.Begin()
      steadyOsc.Feed(steadyOscInput, []uint8{ 27, 91, 63, 48, 117 }, 0, 5)
      steadyOsc.TakeSupportChange()
      steadyOsc.Drain(steadyOscInput)
      steadyOsc.Feed(steadyOscInput, []uint8{ 112 }, 0, 1)
      steadyOsc.Drain(steadyOscInput)
      failed = failed + Checks.Expect(!steadyOscInput.TryDequeue(out event),
        "ordinary input stays quarantined until OSC 11 negotiation also resolves")
      steadyOsc.Feed(steadyOscInput,
        Encoding.ASCII.GetBytes("\u001b]11;#abcdef\u0007q"), 0, 14)
      var steadyColor string
      let steadyGot = steadyOsc.TakeBackground(out steadyColor)
      steadyOsc.Drain(steadyOscInput)
      let steadyOscEvents = terminalEvents(steadyOscInput)
      failed = failed + Checks.Expect(steadyGot && steadyColor == "#abcdef"
          && steadyOscEvents.Count == 2 && steadyOscEvents[0].Text == "p"
          && steadyOscEvents[1].Text == "q",
        "steady input consumes OSC 11 replies without allocation-era leakage")

      let fallbackInput = Input(AutoResetEvent(false))
      let fallback = TerminalNegotiation()
      fallback.Begin(false)
      fallback.Feed(fallbackInput, []uint8{ 27, 91, 65 }, 0, 3)
      fallback.Expire()
      fallbackInput.ConfigureTerminfo([]TerminfoKeySequence{
        TerminfoKeySequence{ Bytes: []uint8{ 27, 91, 65 }, Key: Key.Up, KeyCode: 65 },
      })
      fallback.Drain(fallbackInput)
      let fallbackEvents = terminalEvents(fallbackInput)
      failed = failed + Checks.Expect(fallbackEvents.Count == 1 && fallbackEvents[0].Key == Key.Up,
        "unsupported probe configures capabilities before buffered input")

      let partialInput = Input(AutoResetEvent(false))
      let partial = TerminalNegotiation()
      partial.Begin(false)
      partial.Feed(partialInput, []uint8{ 113, 27, 91, 63, 49 }, 0, 5)
      partial.Expire()
      partial.Drain(partialInput)
      partialInput.FlushPending()
      let partialEvents = terminalEvents(partialInput)
      failed = failed + Checks.Expect(partialEvents.Count == 1 && partialEvents[0].Text == "q",
        "probe timeout flushes a partial candidate")

      let lateInput = Input(AutoResetEvent(false))
      let late = TerminalNegotiation()
      late.Begin(false)
      late.Expire()
      late.Feed(lateInput, []uint8{ 27, 91, 63, 48, 117, 120 }, 0, 6)
      let lateEvents = terminalEvents(lateInput)
      failed = failed + Checks.Expect(lateEvents.Count == 1 && lateEvents[0].Text == "x",
        "late Kitty replies remain outside application input")

      let steadyInput = Input(AutoResetEvent(false))
      let steady = TerminalNegotiation()
      steady.Begin(false)
      steady.Feed(steadyInput, []uint8{ 27, 91, 63, 48, 117 }, 0, 5)
      steady.TakeSupportChange()
      steady.Drain(steadyInput)
      let byte = []uint8{ 97 }
      drainTerminalInput(steadyInput)
      let before = GC.GetAllocatedBytesForCurrentThread()
      for i in 0 ... 1000 {
        steady.Feed(steadyInput, byte, 0, 1)
        drainTerminalInput(steadyInput)
      }
      let after = GC.GetAllocatedBytesForCurrentThread()
      failed = failed + Checks.Expect(after == before,
        "steady Kitty input bypasses negotiation allocation")

      let originalInput = WindowsConsoleNative.ProcessedInput | WindowsConsoleNative.LineInput
        | WindowsConsoleNative.EchoInput | WindowsConsoleNative.QuickEditMode | uint32(0x0100)
      let originalOutput = uint32(0x0022)
      let windowsInput = WindowsConsoleModePolicy.Input(originalInput)
      failed = failed + Checks.Expect((windowsInput & (WindowsConsoleNative.ProcessedInput
          | WindowsConsoleNative.LineInput | WindowsConsoleNative.EchoInput
          | WindowsConsoleNative.QuickEditMode)) == uint32(0)
        && (windowsInput & WindowsConsoleNative.VirtualTerminalInput) != uint32(0)
        && (windowsInput & WindowsConsoleNative.WindowInput) != uint32(0)
        && (windowsInput & WindowsConsoleNative.ExtendedFlags) != uint32(0)
          && WindowsConsoleModePolicy.Output(originalOutput)
            == (originalOutput | WindowsConsoleNative.VirtualTerminalProcessing)
          && WindowsConsoleModePolicy.HasReaderWake(IntPtr(1))
          && !WindowsConsoleModePolicy.HasReaderWake(IntPtr.Zero),
        "Windows VT policy leaves Ctrl+C in terminal input")

      failed = failed + windowsInputChecks()

      let allFlags = uint32(0xFFFFFFFF)
      failed = failed + Checks.Expect((LinuxTerminalModePolicy.InputFlags(allFlags)
          & LinuxTerminalNative.InputFlagsRaw) == uint32(0)
          && (LinuxTerminalModePolicy.OutputFlags(allFlags) & LinuxTerminalNative.OutputFlagsRaw) == uint32(0)
          && (LinuxTerminalModePolicy.LocalFlags(allFlags) & LinuxTerminalNative.LocalFlagsRaw) == uint32(0)
          && (LinuxTerminalModePolicy.ControlFlags(uint32(0)) & LinuxTerminalNative.ControlFlagsSet)
            == LinuxTerminalNative.ControlFlagsSet
          && LinuxTerminalModePolicy.HasReaderWake(0) && !LinuxTerminalModePolicy.HasReaderWake(-1)
          && Marshal.SizeOf[LinuxTermios]() == 60 && Marshal.SizeOf[LinuxPollPair]() == 16,
        "Linux raw mode policy is deterministic")

      failed = failed + darwinChecks()

      let output = MemoryStream()
      let injected = Terminal(AutoResetEvent(false), TerminalStreamHost(output))
      injected.Write("host stream")
      failed = failed + Checks.Expect(Encoding.UTF8.GetString(output.ToArray()) == "host stream",
        "terminal output uses the injected host stream")

      let host = TerminalHostFake()
      let terminal = Terminal(AutoResetEvent(false), host)
      terminal.Enter(Input(AutoResetEvent(false)))
      terminal.Restore()
      terminal.Enter(Input(AutoResetEvent(false)))
      terminal.Restore()
      failed = failed + Checks.Expect(host.Entered == 2 && host.Restored == 2 && host.Woken == 2,
        "reader shutdown permits terminal re-entry")

      let faultHost = TerminalHostFake()
      let faultTerminal = Terminal(AutoResetEvent(false), faultHost)
      faultTerminal.Enter(Input(AutoResetEvent(false)))
      let faultHooked = faultTerminal.HasFaultHook()
      faultTerminal.RestoreOnFault()
      faultTerminal.RestoreOnFault()
      faultTerminal.Restore()
      failed = failed + Checks.Expect(faultHooked && !faultTerminal.HasFaultHook()
          && faultHost.Restored == 1
          && faultHost.OutputText().EndsWith(Ansi.BracketedPasteOff + Ansi.MouseOff
            + Ansi.CursorShow + Ansi.AltScreenOff + Ansi.Reset),
        "a dying process restores the terminal exactly once")

      let allMotionHost = TerminalHostFake()
      let allMotionTerminal = Terminal(AutoResetEvent(false), allMotionHost)
      allMotionTerminal.Enter(Input(AutoResetEvent(false)), MouseTracking.AllMotion)
      let allMotionEnter = allMotionHost.OutputText()
      allMotionTerminal.Restore()
      let allMotionRestore = allMotionHost.OutputText()
      failed = failed + Checks.Expect(allMotionEnter == Ansi.AltScreenOn + Ansi.CursorHide
          + Ansi.MouseOn(MouseTracking.AllMotion) + Ansi.BracketedPasteOn
            + Ansi.KittyKeyboardQuery + Terminal.GraphicsQuery
          && allMotionRestore == allMotionEnter + Terminal.GraphicsRestore + Ansi.BracketedPasteOff + Ansi.MouseOff
            + Ansi.CursorShow + Ansi.AltScreenOff + Ansi.Reset,
        "terminal entry and restore use the configured all-motion policy")

      let backgroundHost = TerminalHostFake()
      backgroundHost.ReadBytes = Encoding.ASCII.GetBytes("\u001b]11;rgb:0000/1111/2222\u0007")
      let backgroundTerminal = Terminal(AutoResetEvent(false), backgroundHost)
      backgroundTerminal.DesiredBackground = 0x071838
      backgroundTerminal.Enter(Input(AutoResetEvent(false)))
      backgroundHost.ReadProcessed.WaitOne(1000)
      backgroundTerminal.Restore()
      let expectedBackgroundOutput = Ansi.AltScreenOn + Ansi.CursorHide
        + Ansi.MouseOn(MouseTracking.Drag) + Ansi.BracketedPasteOn
        + Ansi.KittyKeyboardQuery + Ansi.DefaultBackgroundQuery + Terminal.GraphicsQuery
        + Ansi.SetDefaultBackground("#071838") + Terminal.GraphicsRestore + Ansi.BracketedPasteOff + Ansi.MouseOff
        + Ansi.CursorShow + Ansi.AltScreenOff + Ansi.Reset
        + Ansi.SetDefaultBackground("rgb:0000/1111/2222")
      failed = failed + Checks.Expect(backgroundHost.OutputText() == expectedBackgroundOutput,
        "valid OSC 11 reply enables and exactly restores the saved background")

      let faultBackgroundHost = TerminalHostFake()
      faultBackgroundHost.ReadBytes = Encoding.ASCII.GetBytes("\u001b]11;#123456\u0007")
      let faultBackgroundTerminal = Terminal(AutoResetEvent(false), faultBackgroundHost)
      faultBackgroundTerminal.DesiredBackground = 0x071838
      faultBackgroundTerminal.Enter(Input(AutoResetEvent(false)))
      faultBackgroundHost.ReadProcessed.WaitOne(1000)
      faultBackgroundTerminal.RestoreOnFault()
      faultBackgroundTerminal.RestoreOnFault()
      let expectedFaultBackgroundOutput = Ansi.AltScreenOn + Ansi.CursorHide
        + Ansi.MouseOn(MouseTracking.Drag) + Ansi.BracketedPasteOn
        + Ansi.KittyKeyboardQuery + Ansi.DefaultBackgroundQuery + Terminal.GraphicsQuery
        + Ansi.SetDefaultBackground("#071838") + Terminal.GraphicsRestore + Ansi.BracketedPasteOff + Ansi.MouseOff
        + Ansi.CursorShow + Ansi.AltScreenOff + Ansi.Reset
        + Ansi.SetDefaultBackground("#123456")
      failed = failed + Checks.Expect(faultBackgroundHost.OutputText()
          == expectedFaultBackgroundOutput,
        "fault cleanup restores a captured OSC 11 background exactly once")

      let eofWake = AutoResetEvent(false)
      let eofHost = TerminalHostFake()
      eofHost.EndOfFile = true
      let eofTerminal = Terminal(eofWake, eofHost)
      eofTerminal.Enter(Input(AutoResetEvent(false)))
      let eofSignaled = eofWake.WaitOne(1000)
      let eofExit = eofTerminal.ConsumeExit()
      let eofOutput = eofHost.OutputText()
      eofHost.OutputStream.RejectWrites = true
      let eofWrites = eofHost.OutputStream.WriteAttempts
      eofTerminal.Restore()
      failed = failed + Checks.Expect(eofSignaled && eofExit && eofTerminal.IsDisconnected
          && eofHost.OutputText() == eofOutput && eofHost.OutputStream.WriteAttempts == eofWrites
          && eofHost.Restored == 1 && !eofTerminal.HasFaultHook(),
        "terminal EOF remains visible after exit consumption and cleanup skips output but restores host state")
      eofHost.EndOfFile = false
      eofHost.OutputStream.RejectWrites = false
      eofTerminal.Enter(Input(AutoResetEvent(false)))
      failed += Checks.Expect(!eofTerminal.IsDisconnected, "terminal re-entry clears the disconnected state")
      eofTerminal.Restore()

      let writeHost = TerminalHostFake()
      let writeTerminal = Terminal(AutoResetEvent(false), writeHost)
      writeTerminal.Enter(Input(AutoResetEvent(false)))
      writeHost.OutputStream.RejectWrites = true
      let writeAttempts = writeHost.OutputStream.WriteAttempts
      writeTerminal.Restore()
      failed += Checks.Expect(writeTerminal.IsDisconnected && writeHost.Restored == 1
          && !writeTerminal.HasFaultHook() && writeHost.OutputStream.WriteAttempts == writeAttempts + 1,
        "a restore write failure ends terminal output and still releases host state and hooks")

      let writerWake = AutoResetEvent(false)
      let writerStream = TerminalOutputProbe{ RejectWrites: true }
      let writer = TerminalOutput(writerStream, writerWake, TerminalBuffer(64))
      writer.Control("lost terminal")
      let writerSignaled = writerWake.WaitOne(1000)
      writer.Control("discarded control")
      writer.Stop()
      failed += Checks.Expect(writerSignaled && writer.Error != nil && writerStream.WriteAttempts == 1,
        "an output fault wakes App and prevents later queued writes")
      failed += Checks.Expect(!App().IsTerminalDisconnected, "a new App has no terminal disconnect")
      return failed
    }
  }
}

internal class WindowsRecordScript {
  shared {
    internal func Key(unit uint16) WindowsInputRecord {
      return WindowsInputRecord{ EventType: WindowsConsoleNative.KeyEvent, KeyDown: 1,
        UnicodeChar: unit }
    }

    internal func Release(unit uint16) WindowsInputRecord {
      return WindowsInputRecord{ EventType: WindowsConsoleNative.KeyEvent, KeyDown: 0,
        UnicodeChar: unit }
    }

    internal func Other(kind uint16) WindowsInputRecord {
      return WindowsInputRecord{ EventType: kind, KeyDown: 1, UnicodeChar: uint16(65) }
    }

    /// Runs a record script through one translator and answers the bytes it produced.
    internal func Bytes(records []WindowsInputRecord) List[uint8] {
      let translator = WindowsInputTranslator()
      let buffer = [64]uint8{}
      var written = 0
      for i in 0 ... records.Length {
        written = written + translator.Translate(records[i], buffer, written)
      }
      let result = List[uint8]()
      var i = 0
      while i < written {
        result.Add(buffer[i])
        i = i + 1
      }
      return result
    }

    internal func Same(actual List[uint8], expected []uint8) bool {
      if actual.Count != expected.Length { return false }
      for i in 0 ... expected.Length {
        if actual[i] != expected[i] { return false }
      }
      return true
    }
  }
}

internal class TerminalHostFake : TerminalHost {
  internal var OutputStream TerminalOutputProbe
  private var readerWake AutoResetEvent
  internal var Entered int32
  internal var Restored int32
  internal var Woken int32
  internal var EndOfFile bool
  internal var ReadBytes []uint8
  internal var ReadOffset int32
  internal var ReadProcessed AutoResetEvent

  internal init() {
    OutputStream = TerminalOutputProbe()
    readerWake = AutoResetEvent(false)
    Entered = 0
    Restored = 0
    Woken = 0
    EndOfFile = false
    ReadBytes = []uint8{}
    ReadOffset = 0
    ReadProcessed = AutoResetEvent(false)
  }

  public func IsTty() bool -> true
  public func Enter() bool {
    Entered = Entered + 1
    return true
  }
  public func Restore() { Restored = Restored + 1 }
  public func Columns() int32 -> 80
  public func Rows() int32 -> 24
  public func ConsumeResize() bool -> false
  public func ConsumeExit() bool -> false
  public func IsDisconnected() bool -> false
  public func WakeReader() {
    Woken = Woken + 1
    readerWake.Set()
  }
  public func Read(buffer []uint8, timeoutMilliseconds int32) int32 {
    if ReadOffset < ReadBytes.Length {
      let remaining = ReadBytes.Length - ReadOffset
      let count = remaining < buffer.Length ? remaining : buffer.Length
      var i = 0
      while i < count {
        buffer[i] = ReadBytes[ReadOffset + i]
        i = i + 1
      }
      ReadOffset = ReadOffset + count
      return count
    }
    ReadProcessed.Set()
    if EndOfFile { return -1 }
    readerWake.WaitOne(timeoutMilliseconds)
    return 0
  }
  public func Output() Stream -> OutputStream

  internal func OutputText() string -> Encoding.UTF8.GetString(OutputStream.ToArray())
}

internal class TerminalOutputProbe : MemoryStream {
  internal prop RejectWrites bool { get; set; }
  internal prop WriteAttempts int32 { get; private set; }

  public override func Write(buffer []uint8, offset int32, count int32) {
    WriteAttempts = WriteAttempts + 1
    if RejectWrites { throw IOException("Terminal output is unavailable") }
    base.Write(buffer, offset, count)
  }
}

/// The Windows reader hands every record to this, so cover it on every platform.
private func windowsInputChecks() int32 {
  var failed = 0

  failed = failed + Checks.Expect(WindowsRecordScript.Same(
      WindowsRecordScript.Bytes([]WindowsInputRecord{
        WindowsRecordScript.Key(uint16(27)), WindowsRecordScript.Key(uint16(91)),
        WindowsRecordScript.Key(uint16(65)),
      }), []uint8{ 27, 91, 65 }),
    "key records rebuild an escape sequence byte for byte")

  failed = failed + Checks.Expect(WindowsRecordScript.Same(
      WindowsRecordScript.Bytes([]WindowsInputRecord{
        WindowsRecordScript.Release(uint16(97)),
        WindowsRecordScript.Key(uint16(0)),
        WindowsRecordScript.Other(WindowsConsoleNative.WindowBufferSizeEvent),
        WindowsRecordScript.Other(uint16(0x0002)),
        WindowsRecordScript.Other(uint16(0x0010)),
        WindowsRecordScript.Key(uint16(98)),
      }), []uint8{ 98 }),
    "releases, dead keys, resize, mouse and focus records yield no bytes")

  failed = failed + Checks.Expect(WindowsRecordScript.Same(
      WindowsRecordScript.Bytes([]WindowsInputRecord{
        WindowsRecordScript.Key(uint16(0xD83D)), WindowsRecordScript.Key(uint16(0xDE80)),
      }), []uint8{ 240, 159, 154, 128 }),
    "a surrogate pair spanning two records encodes one rocket")

  failed = failed + Checks.Expect(WindowsRecordScript.Same(
      WindowsRecordScript.Bytes([]WindowsInputRecord{
        WindowsRecordScript.Key(uint16(0xDE80)),
        WindowsRecordScript.Key(uint16(0xD83D)), WindowsRecordScript.Key(uint16(97)),
      }), []uint8{ 97 }),
    "orphan surrogates never reach the parser")

  failed = failed + Checks.Expect(WindowsRecordScript.Same(
      WindowsRecordScript.Bytes([]WindowsInputRecord{
        WindowsRecordScript.Key(uint16(0xE9)), WindowsRecordScript.Key(uint16(0x4E2D)),
      }), []uint8{ 195, 169, 228, 184, 173 }),
    "two and three byte code points encode as UTF-8")

  return failed
}

private func terminalEvents(input Input) List[UiEvent] {
  let result = List[UiEvent]()
  var event = UiEvent{}
  while input.TryDequeue(out event) { result.Add(event) }
  return result
}

private func drainTerminalInput(input Input) {
  var event = UiEvent{}
  while input.TryDequeue(out event) {}
}

/// macOS ships different termios values than Linux, so pin every one of them here.
private func darwinChecks() int32 {
  var failed = 0

  failed = failed + Checks.Expect(Marshal.SizeOf[DarwinTermios]() == DarwinTerminalNative.TermiosSize
      && DarwinTerminalNative.TermiosSize == 72
      && Marshal.SizeOf[DarwinPollPair]() == 16
      && Marshal.SizeOf[DarwinWinSize]() == 8
      && Marshal.SizeOf[DarwinPipePair]() == 8,
    "Darwin structs match the sizes libc writes")

  failed = failed + Checks.Expect(DarwinTerminalNative.TioGetWindowSize == nuint(0x40087468)
      && DarwinTerminalNative.InputFlagsRaw == uint64(0x03EB)
      && DarwinTerminalNative.OutputFlagsRaw == uint64(0x0001)
      && DarwinTerminalNative.ControlFlagsClear == uint64(0x1300)
      && DarwinTerminalNative.ControlFlagsSet == uint64(0x0300)
      && DarwinTerminalNative.LocalFlagsRaw == uint64(0x0598)
      && DarwinTerminalNative.Vmin == 16 && DarwinTerminalNative.Vtime == 17,
    "Darwin termios constants carry the Apple values")

  let allFlags = uint64(0xFFFFFFFFFFFFFFFF)
  failed = failed + Checks.Expect((DarwinTerminalModePolicy.InputFlags(allFlags)
      & DarwinTerminalNative.InputFlagsRaw) == uint64(0)
      && (DarwinTerminalModePolicy.OutputFlags(allFlags) & DarwinTerminalNative.OutputFlagsRaw) == uint64(0)
      && (DarwinTerminalModePolicy.LocalFlags(allFlags) & DarwinTerminalNative.LocalFlagsRaw) == uint64(0)
      && (DarwinTerminalModePolicy.ControlFlags(allFlags) & DarwinTerminalNative.ControlFlagsClear)
        == DarwinTerminalNative.ControlFlagsSet
      && (DarwinTerminalModePolicy.ControlFlags(uint64(0)) & DarwinTerminalNative.ControlFlagsSet)
        == DarwinTerminalNative.ControlFlagsSet
      && DarwinTerminalModePolicy.HasReaderWake(0) && !DarwinTerminalModePolicy.HasReaderWake(-1),
    "Darwin raw mode policy is deterministic")

  failed = failed + Checks.Expect(DarwinTerminalModePolicy.UsesStackedIoctl(Architecture.Arm64)
      && !DarwinTerminalModePolicy.UsesStackedIoctl(Architecture.X64),
    "only Apple silicon takes the stacked ioctl argument")

  return failed
}
