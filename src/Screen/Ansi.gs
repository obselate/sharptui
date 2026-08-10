package SharpTui

import System
import System.Text

internal class Ansi {
  shared {
    /// The raw ESC control character as a one-character string.
    public let Esc string = char(27).ToString()
    /// ESC followed by '[', the prefix of every CSI escape sequence.
    public let Csi string = char(27).ToString() + "["

    /// Switches to the terminal's alternate screen buffer.
    public let AltScreenOn string = Csi + "?1049h"
    /// Switches back to the terminal's primary screen buffer.
    public let AltScreenOff string = Csi + "?1049l"
    /// Hides the terminal cursor.
    public let CursorHide string = Csi + "?25l"
    /// Shows the terminal cursor.
    public let CursorShow string = Csi + "?25h"
    /// Clears the entire screen.
    public let ClearScreen string = Csi + "2J"
    /// Resets all SGR text attributes and colors to the terminal's default.
    public let Reset string = Csi + "0m"

    /// Begins a DEC 2026 synchronized update, so the terminal buffers changes
    /// instead of showing a partial repaint.
    public let SyncOn string = Csi + "?2026h"
    /// Ends a DEC 2026 synchronized update, flushing the buffered frame to the
    /// display atomically.
    public let SyncOff string = Csi + "?2026l"

    /// Disables every mouse tracking mode and SGR mouse encoding.
    public let MouseOff string = Csi + "?1006l" + Csi + "?1003l" + Csi + "?1002l" + Csi + "?1000l"
    /// Enables bracketed paste mode.
    public let BracketedPasteOn string = Csi + "?2004h"
    /// Disables bracketed paste mode.
    public let BracketedPasteOff string = Csi + "?2004l"

    /// The Kitty query is harmless on terminals that do not implement it.
    public let KittyKeyboardQuery string = Csi + "?u"
    /// Pushes the full set of Kitty keyboard protocol enhancement flags (all
    /// bits set) onto the terminal's flag stack.
    public let KittyKeyboardEnable string = Csi + ">31u"
    /// Pops the Kitty keyboard protocol enhancement flags pushed by
    /// KittyKeyboardEnable.
    public let KittyKeyboardDisable string = Csi + "<u"

    /// Returns the escape sequence enabling the given mouse tracking mode with
    /// SGR encoding, or an empty string when tracking is disabled.
    public func MouseOn(tracking MouseTracking) string {
      if tracking == MouseTracking.Disabled { return "" }
      if tracking == MouseTracking.Click { return Csi + "?1000h" + Csi + "?1006h" }
      if tracking == MouseTracking.Drag { return Csi + "?1002h" + Csi + "?1006h" }
      return Csi + "?1003h" + Csi + "?1006h"
    }

    /// OSC 11: sets the terminal's own default background. Worth doing when an
    /// app paints a background of its own on resize the terminal clears the
    /// newly exposed area to *its* default before the app can repaint, and if
    /// the two differ that clear is a visible flash of the wrong color.
    public func SetBackground(rgb int32) string {
      return Esc + "]11;#" + rgb.ToString("x6") + Esc + "\\"
    }

    /// OSC 111: restores the terminal's configured background.
    public let ResetBackground string = char(27).ToString() + "]111" + char(27).ToString() + "\\"

    /// Absolute cursor move. Column and row are zero-based here, one-based on the wire.
    public func MoveTo(x int32, y int32) string {
      return Ansi.Csi + (y + 1).ToString() + ";" + (x + 1).ToString() + "H"
    }

    /// Truecolor plus attributes. A negative channel means "terminal default".
    public func Style(fg int32, bg int32, attr int32) string {
      let sb = StringBuilder()
      Ansi.AppendStyle(sb, fg, bg, attr)
      return sb.ToString()
    }

    /// Appends truecolor and attributes without creating intermediate strings.
    public func AppendStyle(sb StringBuilder, fg int32, bg int32, attr int32) {
      sb.Append(Ansi.Reset)
      if (attr & int32(TextAttributes.Bold)) != 0 {
        sb.Append(Ansi.Csi)
        sb.Append("1m")
      }
      if (attr & int32(TextAttributes.Dim)) != 0 {
        sb.Append(Ansi.Csi)
        sb.Append("2m")
      }
      if (attr & int32(TextAttributes.Italic)) != 0 {
        sb.Append(Ansi.Csi)
        sb.Append("3m")
      }
      if (attr & int32(TextAttributes.Underline)) != 0 {
        sb.Append(Ansi.Csi)
        sb.Append("4m")
      }
      if (attr & int32(TextAttributes.Reverse)) != 0 {
        sb.Append(Ansi.Csi)
        sb.Append("7m")
      }
      if (attr & int32(TextAttributes.Strikethrough)) != 0 {
        sb.Append(Ansi.Csi)
        sb.Append("9m")
      }
      if fg >= 0 { Ansi.appendColor(sb, "38;2;", fg) }
      if bg >= 0 { Ansi.appendColor(sb, "48;2;", bg) }
    }

    internal func AppendSyncOn(output TerminalBuffer) {
      output.AppendByte(uint8(27))
      output.AppendAscii("[?2026h")
    }

    internal func AppendSyncOff(output TerminalBuffer) {
      output.AppendByte(uint8(27))
      output.AppendAscii("[?2026l")
    }

    internal func AppendReset(output TerminalBuffer) {
      output.AppendByte(uint8(27))
      output.AppendAscii("[0m")
    }

    internal func AppendMoveTo(output TerminalBuffer, x int32, y int32) {
      output.AppendByte(uint8(27))
      output.AppendByte(uint8(91))
      output.AppendInt(y + 1)
      output.AppendByte(uint8(59))
      output.AppendInt(x + 1)
      output.AppendByte(uint8(72))
    }

    internal func AppendStyle(output TerminalBuffer, fg int32, bg int32, attr int32) {
      Ansi.AppendReset(output)
      if (attr & int32(TextAttributes.Bold)) != 0 { appendSgr(output, "1m") }
      if (attr & int32(TextAttributes.Dim)) != 0 { appendSgr(output, "2m") }
      if (attr & int32(TextAttributes.Italic)) != 0 { appendSgr(output, "3m") }
      if (attr & int32(TextAttributes.Underline)) != 0 { appendSgr(output, "4m") }
      if (attr & int32(TextAttributes.Reverse)) != 0 { appendSgr(output, "7m") }
      if (attr & int32(TextAttributes.Strikethrough)) != 0 { appendSgr(output, "9m") }
      if fg >= 0 { appendColor(output, "38;2;", fg) }
      if bg >= 0 { appendColor(output, "48;2;", bg) }
    }

    private func appendColor(sb StringBuilder, prefix string, rgb int32) {
      let r = (rgb >> 16) & 255
      let g = (rgb >> 8) & 255
      let b = rgb & 255
      sb.Append(Ansi.Csi)
      sb.Append(prefix)
      sb.Append(r)
      sb.Append(";")
      sb.Append(g)
      sb.Append(";")
      sb.Append(b)
      sb.Append("m")
    }

    private func appendSgr(output TerminalBuffer, body string) {
      output.AppendByte(uint8(27))
      output.AppendByte(uint8(91))
      output.AppendAscii(body)
    }

    private func appendColor(output TerminalBuffer, prefix string, rgb int32) {
      let r = (rgb >> 16) & 255
      let g = (rgb >> 8) & 255
      let b = rgb & 255
      output.AppendByte(uint8(27))
      output.AppendByte(uint8(91))
      output.AppendAscii(prefix)
      output.AppendInt(r)
      output.AppendByte(uint8(59))
      output.AppendInt(g)
      output.AppendByte(uint8(59))
      output.AppendInt(b)
      output.AppendByte(uint8(109))
    }
  }
}
