package SharpTui

import System

internal class Checks {
  shared {
    internal func Widgets() int32 {
      var failed = 0
      failed = failed + MarkdownCheck.Run()
      failed = failed + WidgetCheck.Run()
      failed = failed + MoreCheck.Run()
      failed = failed + DataCheck.Run()
      failed = failed + ColorCheck.Run()
      failed = failed + LayoutCheck.Run()
      failed = failed + KeysCheck.Run()
      failed = failed + ScreenTextCheck.Run()
      failed = failed + InputDecoderCheck.Run()
      failed = failed + TerminalHostCheck.Run()
      failed = failed + OverlayCheck.Run()
      failed = failed + MouseCaptureCheck.Run()
      failed = failed + SplitterCheck.Run()
      failed = failed + RichViewportCheck.Run()
      return failed
    }

    internal func Expect(ok bool, what string) int32 {
      if ok { return 0 }
      Console.WriteLine("selfcheck FAILED: " + what)
      return 1
    }
  }
}
