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
      failed = failed + Checks.Expect(rejectsRgb("6CBC5") && rejectsRgb("6CBC5FG") && rejectsRgb("6CBC5X"),
        "Color.Rgb rejects malformed RGB hex")
      failed = failed + Checks.Expect(rejectsRgbChannels(256, 0, 0),
        "Color.Rgb rejects channels outside the byte range")

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
