package SharpTui

import System
import System.IO
import System.Threading

internal interface TerminalHost {
  func IsTty() bool;
  func Enter() bool;
  func Restore();
  func Columns() int32;
  func Rows() int32;
  func ConsumeResize() bool;
  func ConsumeExit() bool;
  func IsDisconnected() bool;
  func WakeReader();
  func Read(buffer []uint8, timeoutMilliseconds int32) int32;
  func Output() Stream;
}

internal class TerminalHosts {
  shared {
    internal func Create(wakeup AutoResetEvent) TerminalHost {
      if OperatingSystem.IsWindows() { return WindowsTerminalHost(wakeup) }
      if OperatingSystem.IsLinux() { return PosixTerminalHost(wakeup, LinuxPosixDriver()) }
      if OperatingSystem.IsMacOS() { return PosixTerminalHost(wakeup, DarwinPosixDriver()) }
      throw PlatformNotSupportedException("SharpTUI terminal host requires Windows, Linux or macOS.")
    }
  }
}

internal class TerminalStreamHost : TerminalHost {
  private var stream Stream

  internal init(output Stream) {
    stream = output
  }

  public func IsTty() bool -> false
  public func Enter() bool -> false
  public func Restore() {}
  public func Columns() int32 -> 80
  public func Rows() int32 -> 24
  public func ConsumeResize() bool -> false
  public func ConsumeExit() bool -> false
  public func IsDisconnected() bool -> false
  public func WakeReader() {}
  public func Read(buffer []uint8, timeoutMilliseconds int32) int32 -> -1
  public func Output() Stream -> stream
}
