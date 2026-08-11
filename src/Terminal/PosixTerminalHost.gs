package SharpTui

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import System.Threading
import Microsoft.Win32.SafeHandles

/// The native operations Linux and Darwin hosts implement differently: termios
/// layout, poll struct layout and the reader-wake descriptor plumbing.
internal interface PosixTerminalDriver {
  func Dup(descriptor int32) int32;
  func IsTty() bool;
  func HasReaderWake() bool;
  func Snapshot() bool;
  func ApplyRaw() bool;
  func RestoreAttr();
  func Columns() int32;
  func Rows() int32;
  func WakeReader();
  func PollReadable(timeoutMilliseconds int32) bool;
}

/// SIGWINCH/SIGINT/SIGTERM/SIGQUIT/SIGHUP wiring shared by every POSIX host.
/// Handlers only touch Interlocked flags and the wake event, keeping them
/// signal-safe.
internal class PosixSignalBridge {
  private var wake AutoResetEvent
  private var signals List[PosixSignalRegistration]
  private var resized int32
  private var exitRequested int32

  internal init(wakeup AutoResetEvent) {
    wake = wakeup
    signals = List[PosixSignalRegistration]()
    resized = 0
    exitRequested = 0
  }

  internal func Register() {
    signals.Add(PosixSignalRegistration.Create(PosixSignal.SIGWINCH, func(context PosixSignalContext) {
      context.Cancel = true
      Interlocked.Exchange(ref resized, 1)
      wake.Set()
    }))
    signals.Add(exitSignal(PosixSignal.SIGINT))
    signals.Add(exitSignal(PosixSignal.SIGTERM))
    signals.Add(exitSignal(PosixSignal.SIGQUIT))
    signals.Add(exitSignal(PosixSignal.SIGHUP))
  }

  internal func Unregister() {
    for signal in signals { signal.Dispose() }
    signals.Clear()
  }

  internal func ConsumeResize() bool {
    return Interlocked.Exchange(ref resized, 0) != 0
  }

  internal func ConsumeExit() bool {
    return Interlocked.Exchange(ref exitRequested, 0) != 0
  }

  private func exitSignal(signal PosixSignal) PosixSignalRegistration {
    return PosixSignalRegistration.Create(signal, func(context PosixSignalContext) {
      context.Cancel = true
      Interlocked.Exchange(ref exitRequested, 1)
      wake.Set()
    })
  }
}

/// Terminal host shared by every POSIX platform. All native specifics — the
/// termios struct layout, the poll struct layout, and the reader-wake
/// descriptor(s) — live behind the injected driver.
internal class PosixTerminalHost : TerminalHost {
  private var input Stream
  private var inputAvailable bool
  private var output Stream
  private var entered bool
  private var driver PosixTerminalDriver
  private var signals PosixSignalBridge

  internal init(wakeup AutoResetEvent, terminalDriver PosixTerminalDriver) {
    driver = terminalDriver
    input = Stream.Null
    inputAvailable = false
    let inputDescriptor = driver.Dup(0)
    if inputDescriptor >= 0 {
      input = FileStream(SafeFileHandle(IntPtr(inputDescriptor), true), FileAccess.Read)
      inputAvailable = true
    }
    output = Console.OpenStandardOutput()
    entered = false
    signals = PosixSignalBridge(wakeup)
  }

  public func IsTty() bool {
    return driver.IsTty()
  }

  public func Enter() bool {
    if entered { return true }
    if !inputAvailable { return false }
    if !IsTty() { return false }
    if !driver.HasReaderWake() { return false }
    if !driver.Snapshot() { return false }
    if !driver.ApplyRaw() { return false }
    entered = true
    signals.Register()
    return true
  }

  public func Restore() {
    if !entered { return }
    entered = false
    signals.Unregister()
    driver.RestoreAttr()
  }

  public func Columns() int32 {
    return driver.Columns()
  }

  public func Rows() int32 {
    return driver.Rows()
  }

  public func ConsumeResize() bool {
    return signals.ConsumeResize()
  }

  public func ConsumeExit() bool {
    return signals.ConsumeExit()
  }

  public func WakeReader() {
    driver.WakeReader()
  }

  public func Read(buffer []uint8, timeoutMilliseconds int32) int32 {
    if !driver.PollReadable(timeoutMilliseconds) { return 0 }
    let count = input.Read(buffer, 0, buffer.Length)
    return count <= 0 ? -1 : count
  }

  public func Output() Stream {
    return output
  }
}
