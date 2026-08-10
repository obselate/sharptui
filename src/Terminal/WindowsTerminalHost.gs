package SharpTui

import System
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Threading

@StructLayout(LayoutKind.Sequential)
internal struct WindowsCoord {
  var X int16
  var Y int16
}

@StructLayout(LayoutKind.Sequential)
internal struct WindowsSmallRect {
  var Left int16
  var Top int16
  var Right int16
  var Bottom int16
}

@StructLayout(LayoutKind.Sequential)
internal struct WindowsConsoleBufferInfo {
  var Size WindowsCoord
  var Cursor WindowsCoord
  var Attributes uint16
  var Window WindowsSmallRect
  var MaximumWindow WindowsCoord
}

@StructLayout(LayoutKind.Explicit)
internal struct WindowsInputRecord {
  @FieldOffset(0)
  var EventType uint16
  @FieldOffset(19)
  var Tail uint8
}

@StructLayout(LayoutKind.Sequential)
internal struct WindowsWaitSet {
  var Input IntPtr
  var Wake IntPtr
}

internal class WindowsConsoleNative {
  shared {
    internal let StandardInput int32 = -10
    internal let StandardOutput int32 = -11
    internal let VirtualTerminalProcessing uint32 = uint32(0x0004)
    internal let VirtualTerminalInput uint32 = uint32(0x0200)
    internal let ProcessedInput uint32 = uint32(0x0001)
    internal let LineInput uint32 = uint32(0x0002)
    internal let EchoInput uint32 = uint32(0x0004)
    internal let WindowInput uint32 = uint32(0x0008)
    internal let QuickEditMode uint32 = uint32(0x0040)
    internal let ExtendedFlags uint32 = uint32(0x0080)
    internal let Utf8CodePage uint32 = uint32(65001)
    internal let WindowBufferSizeEvent uint16 = uint16(0x0004)
    internal let WaitObjectZero uint32 = uint32(0)
    internal let WaitTimeout uint32 = uint32(258)
    internal let Infinite uint32 = uint32(0xFFFFFFFF)

    @DllImport("kernel32.dll", SetLastError: true)
    public func GetStdHandle(kind int32) IntPtr;

    @DllImport("kernel32.dll", SetLastError: true)
    public func GetConsoleMode(handle IntPtr, out mode uint32) bool;

    @DllImport("kernel32.dll", SetLastError: true)
    public func SetConsoleMode(handle IntPtr, mode uint32) bool;

    @DllImport("kernel32.dll", SetLastError: true)
    public func GetConsoleScreenBufferInfo(handle IntPtr, out info WindowsConsoleBufferInfo) bool;

    @DllImport("kernel32.dll", SetLastError: true)
    public func CreateEvent(security IntPtr, manualReset bool, initialState bool, name IntPtr) IntPtr;

    @DllImport("kernel32.dll", SetLastError: true)
    public func SetEvent(handle IntPtr) bool;

    @DllImport("kernel32.dll", SetLastError: true)
    public func WaitForMultipleObjects(count uint32, ref handles WindowsWaitSet, waitAll bool,
      timeout uint32) uint32;

    @DllImport("kernel32.dll", SetLastError: true)
    public func PeekConsoleInput(handle IntPtr, out record WindowsInputRecord, length uint32,
      out read uint32) bool;

    @DllImport("kernel32.dll", SetLastError: true)
    public func ReadConsoleInput(handle IntPtr, out record WindowsInputRecord, length uint32,
      out read uint32) bool;

    @DllImport("kernel32.dll", SetLastError: true)
    public func GetConsoleCP() uint32;

    @DllImport("kernel32.dll", SetLastError: true)
    public func SetConsoleCP(codePage uint32) bool;

    @DllImport("kernel32.dll", SetLastError: true)
    public func GetConsoleOutputCP() uint32;

    @DllImport("kernel32.dll", SetLastError: true)
    public func SetConsoleOutputCP(codePage uint32) bool;
  }
}

internal class WindowsConsoleModePolicy {
  shared {
    internal func HasReaderWake(handle IntPtr) bool {
      return handle != IntPtr.Zero
    }

    internal func Input(original uint32) uint32 {
      let clear = WindowsConsoleNative.ProcessedInput | WindowsConsoleNative.LineInput
        | WindowsConsoleNative.EchoInput | WindowsConsoleNative.QuickEditMode
      return (original & (uint32(0xFFFFFFFF) ^ clear)) | WindowsConsoleNative.VirtualTerminalInput
        | WindowsConsoleNative.WindowInput | WindowsConsoleNative.ExtendedFlags
    }

    internal func Output(original uint32) uint32 {
      return original | WindowsConsoleNative.VirtualTerminalProcessing
    }
  }
}

internal class WindowsTerminalHost : TerminalHost {
  private var input Stream
  private var output Stream
  private var inputHandle IntPtr
  private var outputHandle IntPtr
  private var savedInputMode uint32
  private var savedOutputMode uint32
  private var savedInputCodePage uint32
  private var savedOutputCodePage uint32
  private var savedColumns int32
  private var savedRows int32
  private var entered bool
  private var wake AutoResetEvent
  private var exitRequested int32
  private var resized int32
  private var readerWakeHandle IntPtr

  internal init(wakeup AutoResetEvent) {
    input = Console.OpenStandardInput()
    output = Console.OpenStandardOutput()
    inputHandle = WindowsConsoleNative.GetStdHandle(WindowsConsoleNative.StandardInput)
    outputHandle = WindowsConsoleNative.GetStdHandle(WindowsConsoleNative.StandardOutput)
    savedInputMode = uint32(0)
    savedOutputMode = uint32(0)
    savedInputCodePage = uint32(0)
    savedOutputCodePage = uint32(0)
    savedColumns = 80
    savedRows = 24
    entered = false
    wake = wakeup
    exitRequested = 0
    resized = 0
    readerWakeHandle = WindowsConsoleNative.CreateEvent(IntPtr.Zero, false, false, IntPtr.Zero)
  }

  public func IsTty() bool {
    var inputMode uint32
    var outputMode uint32
    return WindowsConsoleNative.GetConsoleMode(inputHandle, out inputMode)
      && WindowsConsoleNative.GetConsoleMode(outputHandle, out outputMode)
  }

  public func Enter() bool {
    if entered { return true }
    if !WindowsConsoleModePolicy.HasReaderWake(readerWakeHandle) { return false }
    if !WindowsConsoleNative.GetConsoleMode(inputHandle, out savedInputMode)
        || !WindowsConsoleNative.GetConsoleMode(outputHandle, out savedOutputMode) {
      return false
    }
    savedInputCodePage = WindowsConsoleNative.GetConsoleCP()
    savedOutputCodePage = WindowsConsoleNative.GetConsoleOutputCP()
    if !WindowsConsoleNative.SetConsoleMode(inputHandle,
        WindowsConsoleModePolicy.Input(savedInputMode))
        || !WindowsConsoleNative.SetConsoleMode(outputHandle,
          WindowsConsoleModePolicy.Output(savedOutputMode))
        || !WindowsConsoleNative.SetConsoleCP(WindowsConsoleNative.Utf8CodePage)
        || !WindowsConsoleNative.SetConsoleOutputCP(WindowsConsoleNative.Utf8CodePage) {
      restoreModes()
      return false
    }
    entered = true
    savedColumns = Columns()
    savedRows = Rows()
    Console.CancelKeyPress += onCancel
    return true
  }

  public func Restore() {
    if !entered { return }
    entered = false
    Console.CancelKeyPress -= onCancel
    restoreModes()
  }

  public func Columns() int32 {
    let size = currentSize()
    return size.X > int16(0) ? int32(size.X) : 80
  }

  public func Rows() int32 {
    let size = currentSize()
    return size.Y > int16(0) ? int32(size.Y) : 24
  }

  public func ConsumeResize() bool {
    return Interlocked.Exchange(ref resized, 0) != 0
  }

  public func ConsumeExit() bool {
    return Interlocked.Exchange(ref exitRequested, 0) != 0
  }

  public func WakeReader() {
    if readerWakeHandle != IntPtr.Zero { WindowsConsoleNative.SetEvent(readerWakeHandle) }
  }

  public func Read(buffer []uint8, timeoutMilliseconds int32) int32 {
    var handles = WindowsWaitSet{ Input: inputHandle, Wake: readerWakeHandle }
    let timeout = timeoutMilliseconds < 0 ? WindowsConsoleNative.Infinite : uint32(timeoutMilliseconds)
    let waited = WindowsConsoleNative.WaitForMultipleObjects(2, ref handles, false, timeout)
    if waited == WindowsConsoleNative.WaitTimeout { return 0 }
    if waited == WindowsConsoleNative.WaitObjectZero + 1 { return 0 }
    if waited != WindowsConsoleNative.WaitObjectZero { return -1 }
    var record = WindowsInputRecord{}
    var found uint32
    if !WindowsConsoleNative.PeekConsoleInput(inputHandle, out record, 1, out found) { return -1 }
    if found > uint32(0) && record.EventType == WindowsConsoleNative.WindowBufferSizeEvent {
      WindowsConsoleNative.ReadConsoleInput(inputHandle, out record, 1, out found)
      observeResize()
      return 0
    }
    let read = input.Read(buffer, 0, buffer.Length)
    return read <= 0 ? -1 : read
  }

  public func Output() Stream {
    return output
  }

  private func currentSize() WindowsCoord {
    var info = WindowsConsoleBufferInfo{}
    if !WindowsConsoleNative.GetConsoleScreenBufferInfo(outputHandle, out info) { return WindowsCoord{} }
    return WindowsCoord{
      X: info.Window.Right - info.Window.Left + int16(1),
      Y: info.Window.Bottom - info.Window.Top + int16(1),
    }
  }

  private func onCancel(sender object, args ConsoleCancelEventArgs) {
    args.Cancel = true
    Interlocked.Exchange(ref exitRequested, 1)
    wake.Set()
  }

  private func observeResize() {
    let columns = Columns()
    let rows = Rows()
    if columns == savedColumns && rows == savedRows { return }
    savedColumns = columns
    savedRows = rows
    Interlocked.Exchange(ref resized, 1)
    wake.Set()
  }

  private func restoreModes() {
    WindowsConsoleNative.SetConsoleMode(inputHandle, savedInputMode)
    WindowsConsoleNative.SetConsoleMode(outputHandle, savedOutputMode)
    if savedInputCodePage != uint32(0) {
      WindowsConsoleNative.SetConsoleCP(savedInputCodePage)
    }
    if savedOutputCodePage != uint32(0) {
      WindowsConsoleNative.SetConsoleOutputCP(savedOutputCodePage)
    }
  }
}
