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
      negotiation.Begin()
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

      let fallbackInput = Input(AutoResetEvent(false))
      let fallback = TerminalNegotiation()
      fallback.Begin()
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
      partial.Begin()
      partial.Feed(partialInput, []uint8{ 113, 27, 91, 63, 49 }, 0, 5)
      partial.Expire()
      partial.Drain(partialInput)
      partialInput.FlushPending()
      let partialEvents = terminalEvents(partialInput)
      failed = failed + Checks.Expect(partialEvents.Count == 1 && partialEvents[0].Text == "q",
        "probe timeout flushes a partial candidate")

      let lateInput = Input(AutoResetEvent(false))
      let late = TerminalNegotiation()
      late.Begin()
      late.Expire()
      late.Feed(lateInput, []uint8{ 27, 91, 63, 48, 117, 120 }, 0, 6)
      let lateEvents = terminalEvents(lateInput)
      failed = failed + Checks.Expect(lateEvents.Count == 1 && lateEvents[0].Text == "x",
        "late Kitty replies remain outside application input")

      let steadyInput = Input(AutoResetEvent(false))
      let steady = TerminalNegotiation()
      steady.Begin()
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

      let allFlags = uint32(0xFFFFFFFF)
      failed = failed + Checks.Expect((LinuxTerminalModePolicy.InputFlags(allFlags)
          & LinuxTerminalNative.InputFlagsRaw) == uint32(0)
          && (LinuxTerminalModePolicy.OutputFlags(allFlags) & LinuxTerminalNative.OutputFlagsRaw) == uint32(0)
          && (LinuxTerminalModePolicy.LocalFlags(allFlags) & LinuxTerminalNative.LocalFlagsRaw) == uint32(0)
          && (LinuxTerminalModePolicy.ControlFlags(uint32(0)) & LinuxTerminalNative.ControlFlagsSet)
            == LinuxTerminalNative.ControlFlagsSet
          && LinuxTerminalModePolicy.HasReaderWake(0) && !LinuxTerminalModePolicy.HasReaderWake(-1)
          && Marshal.SizeOf(LinuxTermios{}) == 60 && Marshal.SizeOf(LinuxPollPair{}) == 16,
        "Linux raw mode policy is deterministic")

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

      let allMotionHost = TerminalHostFake()
      let allMotionTerminal = Terminal(AutoResetEvent(false), allMotionHost)
      allMotionTerminal.Enter(Input(AutoResetEvent(false)), MouseTracking.AllMotion)
      let allMotionEnter = allMotionHost.OutputText()
      allMotionTerminal.Restore()
      let allMotionRestore = allMotionHost.OutputText()
      failed = failed + Checks.Expect(allMotionEnter == Ansi.AltScreenOn + Ansi.CursorHide
          + Ansi.MouseOn(MouseTracking.AllMotion) + Ansi.BracketedPasteOn + Ansi.KittyKeyboardQuery
          && allMotionRestore == allMotionEnter + Ansi.BracketedPasteOff + Ansi.MouseOff
            + Ansi.CursorShow + Ansi.AltScreenOff,
        "terminal entry and restore use the configured all-motion policy")

      let eofWake = AutoResetEvent(false)
      let eofHost = TerminalHostFake()
      eofHost.EndOfFile = true
      let eofTerminal = Terminal(eofWake, eofHost)
      eofTerminal.Enter(Input(AutoResetEvent(false)))
      let eofSignaled = eofWake.WaitOne(1000)
      let eofExit = eofTerminal.ConsumeExit()
      eofTerminal.Restore()
      failed = failed + Checks.Expect(eofSignaled && eofExit,
        "terminal EOF wakes App and requests exit")
      return failed
    }
  }
}

internal class TerminalHostFake : TerminalHost {
  private var output MemoryStream
  private var readerWake AutoResetEvent
  internal var Entered int32
  internal var Restored int32
  internal var Woken int32
  internal var EndOfFile bool

  internal init() {
    output = MemoryStream()
    readerWake = AutoResetEvent(false)
    Entered = 0
    Restored = 0
    Woken = 0
    EndOfFile = false
  }

  public func IsTty() bool { return true }
  public func Enter() bool {
    Entered = Entered + 1
    return true
  }
  public func Restore() { Restored = Restored + 1 }
  public func Columns() int32 { return 80 }
  public func Rows() int32 { return 24 }
  public func ConsumeResize() bool { return false }
  public func ConsumeExit() bool { return false }
  public func WakeReader() {
    Woken = Woken + 1
    readerWake.Set()
  }
  public func Read(buffer []uint8, timeoutMilliseconds int32) int32 {
    if EndOfFile { return -1 }
    readerWake.WaitOne(timeoutMilliseconds)
    return 0
  }
  public func Output() Stream { return output }

  internal func OutputText() string {
    return Encoding.UTF8.GetString(output.ToArray())
  }
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
