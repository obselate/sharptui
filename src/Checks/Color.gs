package SharpTui

import SharpTui

import System

internal class ColorCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      let green = Color.Rgb("6cBc5F")
      let surface = Color.Rgb("0E1117")
      failed = failed + Checks.Expect(green == Color.Rgb("6CBC5F"),
        "Color.Rgb accepts case-insensitive RGB hex")
      failed = failed + Checks.Expect(green == Color.Rgb(108, 188, 95),
        "Color.Rgb accepts computed channel values")
      failed = failed + Checks.Expect(Color.Inherit.IsInherited && !Color.Inherit.IsTerminalDefault,
        "Color.Inherit is distinct from the terminal default")
      failed = failed + Checks.Expect(Color.TerminalDefault.IsTerminalDefault && !Color.TerminalDefault.IsInherited,
        "Color.TerminalDefault is a named terminal color")
      failed = failed + Checks.Expect(Color.Indexed(42).IsIndexed && Color.Indexed(42).IndexedValue == 42
        && Color.Ansi(AnsiColor.BrightGreen).IndexedValue == 10,
        "Color preserves indexed and named ANSI palette colors")
      failed = failed + Checks.Expect(rejectsRgb("6CBC5") && rejectsRgb("6CBC5FG") && rejectsRgb("6CBC5X"),
        "Color.Rgb rejects malformed RGB hex")
      failed = failed + Checks.Expect(rejectsRgbChannels(256, 0, 0),
        "Color.Rgb rejects channels outside the byte range")
      failed = failed + Checks.Expect(rejectsIndex(256),
        "Color.Indexed rejects palette indexes outside the byte range")

      let style = Style{
        Foreground: green,
        Background: Color.Inherit,
        Attributes: TextAttributes.Bold,
      }
      let emphasized = style.WithAttributes(TextAttributes.Italic)
      failed = failed + Checks.Expect(style.Foreground == green && style.Background.IsInherited,
        "Style exposes named foreground and background colors")
      failed = failed + Checks.Expect(int32(emphasized.Attributes)
        == (int32(TextAttributes.Bold) | int32(TextAttributes.Italic)),
        "Style.WithAttributes preserves existing attribute flags")
      failed = failed + Checks.Expect(style.Inverted().Foreground.IsInherited
        && style.Inverted().Background == green,
        "Style.Inverted swaps typed colors")

      let direct = Screen(1, 1)
      direct.DefaultStyle = Style{ Foreground: green, Background: Color.TerminalDefault }
      direct.Write(0, 0, "x", Style{ Foreground: Color.Inherit, Background: Color.Inherit })
      failed = failed + Checks.Expect(direct.Flush().Contains("[38;2;108;188;95m"),
        "Screen resolves direct inherited colors before serialization")

      let palette = Screen(2, 1)
      palette.ColorMode = TerminalColorMode.Palette256
      palette.Write(0, 0, "x", Style{ Foreground: Color.Indexed(42) })
      failed = failed + Checks.Expect(palette.Flush().Contains("[38;5;42m"),
        "Palette256 emits indexed SGR colors")

      let lowColor = Screen(2, 1)
      lowColor.ColorMode = TerminalColorMode.Palette16
      lowColor.Write(0, 0, "x", Style{ Foreground: Color.Ansi(AnsiColor.BrightGreen) })
      failed = failed + Checks.Expect(lowColor.Flush().Contains("[92m"),
        "Palette16 emits base ANSI SGR colors")

      let noColor = Screen(2, 1)
      noColor.ColorMode = TerminalColorMode.NoColor
      noColor.Write(0, 0, "x", Style{ Foreground: Color.Rgb("D1A047"), Background: Color.Indexed(42), Attributes: TextAttributes.Bold })
      let plain = noColor.Flush()
      failed = failed + Checks.Expect(plain.Contains("[1m") && !plain.Contains("38;") && !plain.Contains("48;"),
        "NoColor emits attributes without SGR colors")

      let child = Label{
        Text: "x",
        Style: Style{ Foreground: Color.Inherit, Background: Color.Inherit },
      }
      let root = Box{
        Style: Style{ Foreground: green, Background: surface },
        Children: { child },
      }
      let inherited = Screen(2, 1)
      root.Draw(inherited)
      failed = failed + Checks.Expect(inherited.Flush().Contains("[38;2;108;188;95m"),
        "Color.Inherit resolves before terminal serialization")

      child.Style = Style{ Foreground: Color.TerminalDefault, Background: Color.Inherit }
      root.Draw(inherited)
      failed = failed + Checks.Expect(!inherited.Flush().Contains("[38;2;108;188;95m"),
        "Color.TerminalDefault does not inherit the parent color")

      let borderInk = Color.Rgb("D1A047")
      let borderFill = Color.Rgb("263344")
      let framed = Box{
        ShowBorder: true,
        Title: "标题",
        RightTitle: "右",
        BottomTitle: "底",
        Style: Style{ Foreground: green, Background: surface },
        BorderStyle: Style{ Foreground: borderInk, Background: borderFill },
        Children: { Label{ Text: "中文" } },
      }
      let framedScreen = Screen(40, 12)
      framed.Draw(framedScreen)
      let framedOutput = framedScreen.Flush()
      failed = failed + Checks.Expect(framedOutput.Contains(Ansi.Style(green.Packed, surface.Packed, 0) + "中文")
        && framedOutput.Contains("[38;2;209;160;71m")
        && framedScreen.BackgroundAt(0, 0) == borderFill.Packed
        && framedScreen.BackgroundAt(2, 0) == borderFill.Packed
        && framedScreen.BackgroundAt(35, 0) == borderFill.Packed
        && framedScreen.BackgroundAt(35, 11) == borderFill.Packed
        && framedScreen.BackgroundAt(1, 1) == surface.Packed
        && framedScreen.BackgroundAt(20, 5) == surface.Packed,
        "BorderStyle colors the border and its titles without changing content or child style")
      framedScreen.ColorMode = TerminalColorMode.NoColor
      framedScreen.Invalidate()
      framed.Draw(framedScreen)
      let framedPlain = framedScreen.Flush()
      failed = failed + Checks.Expect(framedPlain.Contains("中文")
        && !framedPlain.Contains("38;") && !framedPlain.Contains("48;"),
        "BorderStyle respects NoColor")
      framed.CanFocus = true
      framed.FocusedStyle = Style{ Background: green }
      framed.Focus(framed)
      framed.Draw(framedScreen)
      failed = failed + Checks.Expect(framedScreen.BackgroundAt(0, 0) == green.Packed
        && framedScreen.BackgroundAt(1, 1) == surface.Packed,
        "FocusedStyle overrides BorderStyle without changing the child style")
      framed.BorderStyle = Style()
      framed.ClearFocus()
      framed.Draw(framedScreen)
      failed = failed + Checks.Expect(framedScreen.BackgroundAt(0, 0) == surface.Packed,
        "an unset BorderStyle keeps the box style on the border")
      framed.BorderStyle = Style{ Foreground: borderInk, Background: borderFill }
      for i in 0 ... 64 { framed.Draw(framedScreen) }
      let before = GC.GetAllocatedBytesForCurrentThread()
      for i in 0 ... 100 { framed.Draw(framedScreen) }
      let allocated = GC.GetAllocatedBytesForCurrentThread() - before
      failed = failed + Checks.Expect(allocated == 0, "BorderStyle paint allocates no bytes")
      return failed
    }
  }
}

private func rejectsRgb(value string) bool {
  try {
    Color.Rgb(value)
    return false
  } catch (error ArgumentException) {
    return error.Message.Contains("six hexadecimal digits")
  }
}

private func rejectsRgbChannels(red int32, green int32, blue int32) bool {
  try {
    Color.Rgb(red, green, blue)
    return false
  } catch (error ArgumentOutOfRangeException) {
    return true
  }
}

private func rejectsIndex(index int32) bool {
  try {
    Color.Indexed(index)
    return false
  } catch (error ArgumentOutOfRangeException) {
    return true
  }
}
