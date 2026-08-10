package SharpTui

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import System.Threading
import Microsoft.Win32.SafeHandles

@StructLayout(LayoutKind.Sequential)
internal struct LinuxWinSize {
  var Rows uint16
  var Columns uint16
  var PixelWidth uint16
  var PixelHeight uint16
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct LinuxTermios {
  var InputFlags uint32
  var OutputFlags uint32
  var ControlFlags uint32
  var LocalFlags uint32
  var Line uint8
  fixed ControlCharacters [32]uint8
  var InputSpeed uint32
  var OutputSpeed uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct LinuxPollPair {
  var InputDescriptor int32
  var InputEvents int16
  var InputReturnedEvents int16
  var WakeDescriptor int32
  var WakeEvents int16
  var WakeReturnedEvents int16
}

internal class LinuxTerminalNative {
  shared {
    internal let TioGetWindowSize nuint = nuint(0x5413)
    internal let PollInput int16 = int16(0x0001)
    internal let EventFdNonBlock int32 = 0x00000800
    internal let EventFdCloseOnExec int32 = 0x00080000
    internal let InputFlagsRaw uint32 = uint32(0x0001 | 0x0002 | 0x0008 | 0x0020 | 0x0040 | 0x0080 | 0x0100 | 0x0400)
    internal let OutputFlagsRaw uint32 = uint32(0x0001)
    internal let ControlFlagsClear uint32 = uint32(0x0030 | 0x0100)
    internal let ControlFlagsSet uint32 = uint32(0x0030)
    internal let LocalFlagsRaw uint32 = uint32(0x0001 | 0x0002 | 0x0008 | 0x0040 | 0x8000)
    internal let Vtime int32 = 5
    internal let Vmin int32 = 6

    @DllImport("libc", SetLastError: true)
    public func isatty(descriptor int32) int32;

    @DllImport("libc", SetLastError: true)
    public func dup(descriptor int32) int32;

    @DllImport("libc", SetLastError: true)
    public func ioctl(descriptor int32, request nuint, out size LinuxWinSize) int32;

    @DllImport("libc", SetLastError: true)
    public func tcgetattr(descriptor int32, out value LinuxTermios) int32;

    @DllImport("libc", SetLastError: true)
    public func tcsetattr(descriptor int32, action int32, ref value LinuxTermios) int32;

    @DllImport("libc", SetLastError: true)
    public func poll(ref descriptors LinuxPollPair, count nuint, timeout int32) int32;

    @DllImport("libc", SetLastError: true)
    public func eventfd(initial uint32, flags int32) int32;

    @DllImport("libc", SetLastError: true)
    public func read(descriptor int32, ref value uint64, count nuint) nint;

    @DllImport("libc", SetLastError: true)
    public func write(descriptor int32, ref value uint64, count nuint) nint;
  }
}

internal class LinuxTerminalModePolicy {
  shared {
    internal func InputFlags(value uint32) uint32 {
      return value & (uint32(0xFFFFFFFF) ^ LinuxTerminalNative.InputFlagsRaw)
    }

    internal func OutputFlags(value uint32) uint32 {
      return value & (uint32(0xFFFFFFFF) ^ LinuxTerminalNative.OutputFlagsRaw)
    }

    internal func ControlFlags(value uint32) uint32 {
      return (value & (uint32(0xFFFFFFFF) ^ LinuxTerminalNative.ControlFlagsClear))
        | LinuxTerminalNative.ControlFlagsSet
    }

    internal func LocalFlags(value uint32) uint32 {
      return value & (uint32(0xFFFFFFFF) ^ LinuxTerminalNative.LocalFlagsRaw)
    }

    internal func HasReaderWake(descriptor int32) bool {
      return descriptor >= 0
    }
  }
}

internal class LinuxTerminalHost : TerminalHost {
  private var input Stream
  private var inputAvailable bool
  private var output Stream
  private var saved LinuxTermios
  private var haveSaved bool
  private var entered bool
  private var wake AutoResetEvent
  private var signals List[PosixSignalRegistration]
  private var resized int32
  private var exitRequested int32
  private var readerWakeDescriptor int32

  internal init(wakeup AutoResetEvent) {
    input = Stream.Null
    inputAvailable = false
    let inputDescriptor = LinuxTerminalNative.dup(0)
    if inputDescriptor >= 0 {
      input = FileStream(SafeFileHandle(IntPtr(inputDescriptor), true), FileAccess.Read)
      inputAvailable = true
    }
    output = Console.OpenStandardOutput()
    saved = LinuxTermios{}
    haveSaved = false
    entered = false
    wake = wakeup
    signals = List[PosixSignalRegistration]()
    resized = 0
    exitRequested = 0
    readerWakeDescriptor = LinuxTerminalNative.eventfd(uint32(0),
      LinuxTerminalNative.EventFdNonBlock | LinuxTerminalNative.EventFdCloseOnExec)
  }

  public func IsTty() bool {
    return LinuxTerminalNative.isatty(0) == 1 && LinuxTerminalNative.isatty(1) == 1
  }

  public func Enter() bool {
    if entered { return true }
    if !inputAvailable { return false }
    if !IsTty() { return false }
    if !LinuxTerminalModePolicy.HasReaderWake(readerWakeDescriptor) { return false }
    if LinuxTerminalNative.tcgetattr(0, out saved) != 0 { return false }
    haveSaved = true
    var raw = saved
    raw.InputFlags = LinuxTerminalModePolicy.InputFlags(raw.InputFlags)
    raw.OutputFlags = LinuxTerminalModePolicy.OutputFlags(raw.OutputFlags)
    raw.ControlFlags = LinuxTerminalModePolicy.ControlFlags(raw.ControlFlags)
    raw.LocalFlags = LinuxTerminalModePolicy.LocalFlags(raw.LocalFlags)
    raw.ControlCharacters[LinuxTerminalNative.Vtime] = uint8(0)
    raw.ControlCharacters[LinuxTerminalNative.Vmin] = uint8(1)
    if LinuxTerminalNative.tcsetattr(0, 0, ref raw) != 0 {
      haveSaved = false
      return false
    }
    entered = true
    registerSignals()
    return true
  }

  public func Restore() {
    if !entered { return }
    entered = false
    for signal in signals { signal.Dispose() }
    signals.Clear()
    if haveSaved {
      LinuxTerminalNative.tcsetattr(0, 0, ref saved)
      haveSaved = false
    }
  }

  public func Columns() int32 {
    var size = LinuxWinSize{}
    if LinuxTerminalNative.ioctl(1, LinuxTerminalNative.TioGetWindowSize, out size) == 0 && size.Columns > uint16(0) {
      return int32(size.Columns)
    }
    return 80
  }

  public func Rows() int32 {
    var size = LinuxWinSize{}
    if LinuxTerminalNative.ioctl(1, LinuxTerminalNative.TioGetWindowSize, out size) == 0 && size.Rows > uint16(0) {
      return int32(size.Rows)
    }
    return 24
  }

  public func ConsumeResize() bool {
    return Interlocked.Exchange(ref resized, 0) != 0
  }

  public func ConsumeExit() bool {
    return Interlocked.Exchange(ref exitRequested, 0) != 0
  }

  public func WakeReader() {
    if readerWakeDescriptor < 0 { return }
    var value uint64 = 1
    LinuxTerminalNative.write(readerWakeDescriptor, ref value, 8)
  }

  public func Read(buffer []uint8, timeoutMilliseconds int32) int32 {
    var descriptors = LinuxPollPair{
      InputDescriptor: 0,
      InputEvents: LinuxTerminalNative.PollInput,
      WakeDescriptor: readerWakeDescriptor,
      WakeEvents: LinuxTerminalNative.PollInput,
    }
    let ready = LinuxTerminalNative.poll(ref descriptors, 2, timeoutMilliseconds)
    if ready <= 0 { return 0 }
    if (descriptors.WakeReturnedEvents & LinuxTerminalNative.PollInput) != 0 {
      var value uint64 = 0
      LinuxTerminalNative.read(readerWakeDescriptor, ref value, 8)
      return 0
    }
    let count = input.Read(buffer, 0, buffer.Length)
    return count <= 0 ? -1 : count
  }

  public func Output() Stream {
    return output
  }

  private func registerSignals() {
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

  private func exitSignal(signal PosixSignal) PosixSignalRegistration {
    return PosixSignalRegistration.Create(signal, func(context PosixSignalContext) {
      context.Cancel = true
      Interlocked.Exchange(ref exitRequested, 1)
      wake.Set()
    })
  }
}
