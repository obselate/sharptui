package SharpTui

import System.Runtime.InteropServices
import System.Threading

@StructLayout(LayoutKind.Sequential)
internal struct DarwinWinSize {
  var Rows uint16
  var Columns uint16
  var PixelWidth uint16
  var PixelHeight uint16
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct DarwinTermios {
  var InputFlags uint64
  var OutputFlags uint64
  var ControlFlags uint64
  var LocalFlags uint64
  fixed ControlCharacters [20]uint8
  var InputSpeed uint64
  var OutputSpeed uint64
}

@StructLayout(LayoutKind.Sequential)
internal struct DarwinPollPair {
  var InputDescriptor int32
  var InputEvents int16
  var InputReturnedEvents int16
  var WakeDescriptor int32
  var WakeEvents int16
  var WakeReturnedEvents int16
}

@StructLayout(LayoutKind.Sequential)
internal struct DarwinPipePair {
  var Read int32
  var Write int32
}

internal class DarwinTerminalNative {
  shared {
    internal let TioGetWindowSize nuint = nuint(0x40087468)
    internal let PollInput int16 = int16(0x0001)
    internal let TermiosSize int32 = 72
    internal let InputFlagsRaw uint64 = uint64(0x0001 | 0x0002 | 0x0008 | 0x0020 | 0x0040 | 0x0080 | 0x0100 | 0x0200)
    internal let OutputFlagsRaw uint64 = uint64(0x0001)
    internal let ControlFlagsClear uint64 = uint64(0x0300 | 0x1000)
    internal let ControlFlagsSet uint64 = uint64(0x0300)
    internal let LocalFlagsRaw uint64 = uint64(0x0008 | 0x0010 | 0x0080 | 0x0100 | 0x0400)
    internal let Vmin int32 = 16
    internal let Vtime int32 = 17

    @DllImport("libc", SetLastError: true)
    public func isatty(descriptor int32) int32;

    @DllImport("libc", SetLastError: true)
    public func dup(descriptor int32) int32;

    @DllImport("libc", SetLastError: true)
    public func ioctl(descriptor int32, request nuint, out size DarwinWinSize) int32;

    // Apple arm64 passes variadic arguments on the stack, so the six pads push
    // the winsize pointer out of the registers and into the slot ioctl reads.
    @DllImport("libc", EntryPoint: "ioctl", SetLastError: true)
    public func ioctlStacked(descriptor int32, request nuint, pad0 nuint, pad1 nuint, pad2 nuint,
      pad3 nuint, pad4 nuint, pad5 nuint, out size DarwinWinSize) int32;

    @DllImport("libc", SetLastError: true)
    public func tcgetattr(descriptor int32, out value DarwinTermios) int32;

    @DllImport("libc", SetLastError: true)
    public func tcsetattr(descriptor int32, action int32, ref value DarwinTermios) int32;

    @DllImport("libc", SetLastError: true)
    public func poll(ref descriptors DarwinPollPair, count uint32, timeout int32) int32;

    @DllImport("libc", SetLastError: true)
    public func pipe(out descriptors DarwinPipePair) int32;

    @DllImport("libc", SetLastError: true)
    public func read(descriptor int32, ref value uint8, count nuint) nint;

    @DllImport("libc", SetLastError: true)
    public func write(descriptor int32, ref value uint8, count nuint) nint;
  }
}

internal class DarwinTerminalModePolicy {
  shared {
    internal func InputFlags(value uint64) uint64 {
      return value & (uint64(0xFFFFFFFFFFFFFFFF) ^ DarwinTerminalNative.InputFlagsRaw)
    }

    internal func OutputFlags(value uint64) uint64 {
      return value & (uint64(0xFFFFFFFFFFFFFFFF) ^ DarwinTerminalNative.OutputFlagsRaw)
    }

    internal func ControlFlags(value uint64) uint64 {
      return (value & (uint64(0xFFFFFFFFFFFFFFFF) ^ DarwinTerminalNative.ControlFlagsClear))
        | DarwinTerminalNative.ControlFlagsSet
    }

    internal func LocalFlags(value uint64) uint64 {
      return value & (uint64(0xFFFFFFFFFFFFFFFF) ^ DarwinTerminalNative.LocalFlagsRaw)
    }

    internal func HasReaderWake(descriptor int32) bool {
      return descriptor >= 0
    }

    internal func UsesStackedIoctl(architecture Architecture) bool {
      return architecture == Architecture.Arm64
    }
  }
}

internal class DarwinPosixDriver : PosixTerminalDriver {
  private var saved DarwinTermios
  private var haveSaved bool
  private var readerWakeRead int32
  private var readerWakeWrite int32
  private var wakePending int32
  private var stackedIoctl bool

  internal init() {
    saved = DarwinTermios{}
    haveSaved = false
    wakePending = 0
    stackedIoctl = DarwinTerminalModePolicy.UsesStackedIoctl(RuntimeInformation.ProcessArchitecture)
    readerWakeRead = -1
    readerWakeWrite = -1
    var wakePipe = DarwinPipePair{}
    if DarwinTerminalNative.pipe(out wakePipe) == 0 {
      readerWakeRead = wakePipe.Read
      readerWakeWrite = wakePipe.Write
    }
  }

  public func Dup(descriptor int32) int32 {
    return DarwinTerminalNative.dup(descriptor)
  }

  public func IsTty() bool {
    return DarwinTerminalNative.isatty(0) == 1 && DarwinTerminalNative.isatty(1) == 1
  }

  public func HasReaderWake() bool {
    return DarwinTerminalModePolicy.HasReaderWake(readerWakeRead)
  }

  public func Snapshot() bool {
    if DarwinTerminalNative.tcgetattr(0, out saved) != 0 { return false }
    haveSaved = true
    return true
  }

  public func ApplyRaw() bool {
    var raw = saved
    raw.InputFlags = DarwinTerminalModePolicy.InputFlags(raw.InputFlags)
    raw.OutputFlags = DarwinTerminalModePolicy.OutputFlags(raw.OutputFlags)
    raw.ControlFlags = DarwinTerminalModePolicy.ControlFlags(raw.ControlFlags)
    raw.LocalFlags = DarwinTerminalModePolicy.LocalFlags(raw.LocalFlags)
    raw.ControlCharacters[DarwinTerminalNative.Vtime] = uint8(0)
    raw.ControlCharacters[DarwinTerminalNative.Vmin] = uint8(1)
    if DarwinTerminalNative.tcsetattr(0, 0, ref raw) != 0 {
      haveSaved = false
      return false
    }
    return true
  }

  public func RestoreAttr() {
    if haveSaved {
      DarwinTerminalNative.tcsetattr(0, 0, ref saved)
      haveSaved = false
    }
  }

  public func Columns() int32 {
    let size = currentSize()
    return size.Columns > uint16(0) ? int32(size.Columns) : 80
  }

  public func Rows() int32 {
    let size = currentSize()
    return size.Rows > uint16(0) ? int32(size.Rows) : 24
  }

  public func WakeReader() {
    if readerWakeWrite < 0 { return }
    if Interlocked.Exchange(ref wakePending, 1) != 0 { return }
    var value uint8 = 1
    DarwinTerminalNative.write(readerWakeWrite, ref value, 1)
  }

  public func PollReadable(timeoutMilliseconds int32) bool {
    var descriptors = DarwinPollPair{
      InputDescriptor: 0,
      InputEvents: DarwinTerminalNative.PollInput,
      WakeDescriptor: readerWakeRead,
      WakeEvents: DarwinTerminalNative.PollInput,
    }
    let ready = DarwinTerminalNative.poll(ref descriptors, uint32(2), timeoutMilliseconds)
    if ready <= 0 { return false }
    if (descriptors.WakeReturnedEvents & DarwinTerminalNative.PollInput) != 0 {
      Interlocked.Exchange(ref wakePending, 0)
      var value uint8 = 0
      DarwinTerminalNative.read(readerWakeRead, ref value, 1)
      return false
    }
    return true
  }

  private func currentSize() DarwinWinSize {
    var size = DarwinWinSize{}
    var failed = 0
    if stackedIoctl {
      failed = DarwinTerminalNative.ioctlStacked(1, DarwinTerminalNative.TioGetWindowSize,
        nuint(0), nuint(0), nuint(0), nuint(0), nuint(0), nuint(0), out size)
    } else {
      failed = DarwinTerminalNative.ioctl(1, DarwinTerminalNative.TioGetWindowSize, out size)
    }
    return failed == 0 ? size : DarwinWinSize{}
  }
}
