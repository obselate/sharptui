package SharpTui

import SharpTui

import System
import System.Collections.Generic

internal class ScreenTextCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      let canvas = Screen(8, 3)
      let base = Style{
        Foreground: Color.Rgb("C8CEDA"),
        Background: Color.Rgb("0E1117"),
      }
      let accent = base.WithForeground(Color.Rgb("6CBC5F"))
      canvas.DefaultStyle = base

      failed = failed + Checks.Expect(canvas.Size.WidthCells == 8 && canvas.Size.HeightRows == 3,
        "Screen exposes its terminal-cell size")
      canvas.WriteCell(0, 0, "x", accent)
      let afterWide = canvas.Write(1, 0, "日")
      failed = failed + Checks.Expect(afterWide == 3 && canvas.Probe(0, 0) == "x"
        && canvas.Probe(1, 0) == "日" && canvas.Probe(2, 0) == "",
        "Screen.WriteCell and Write stage terminal-cell glyphs")

      let clipped = CellRect{ Column: 0, Row: 1, WidthCells: 4, HeightRows: 1 }
      canvas.WriteClipped(clipped, 0, 0, "hello")
      failed = failed + Checks.Expect(canvas.Probe(3, 1) == "l" && canvas.Probe(4, 1) == " ",
        "Screen.WriteClipped stops at a CellRect edge")

      let border = CellRect{ Column: 4, Row: 1, WidthCells: 4, HeightRows: 2 }
      canvas.DrawBorder(border, accent)
      failed = failed + Checks.Expect(canvas.Probe(4, 1) == "┌" && canvas.Probe(7, 2) == "┘",
        "Screen.DrawBorder uses CellRect coordinates")

      canvas.Write(0, 2, "base")
      failed = failed + Checks.Expect(canvas.Flush().Contains("[38;2;200;206;218m"),
        "Screen.Write resolves DefaultStyle before UTF-8 serialization")

      let flag = char.ConvertFromUtf32(0x1F1EF) + char.ConvertFromUtf32(0x1F1F5)
      failed = failed + Checks.Expect(CellText.MeasureWidth("a日本é" + flag) == 8,
        "CellText.MeasureWidth uses terminal cell widths")
      failed = failed + Checks.Expect(CellText.Clip("é日x", 3) == "é日"
        && CellText.Clip("é日x", 2) == "é",
        "CellText.Clip preserves grapheme clusters")
      let wrapped = CellText.Wrap("hello world foo", 10)
      let wide = CellText.Wrap("日本語", 4)
      failed = failed + Checks.Expect(wrapped.Count == 2 && wrapped[0] == "hello"
        && wrapped[1] == "world foo" && wide[0] == "日本",
        "CellText.Wrap uses terminal-cell word wrapping")

      let run = TextRun{ Text: "styled", Style: accent }
      let styled = List[TextRun]{ TextRun("one ", base), TextRun("two", accent) }
      let flowed = WrapTextRuns(styled, 8)
      let second = flowed[0][1].Style
      failed = failed + Checks.Expect(run.Text == "styled" && run.Style.Foreground == Color.Rgb("6CBC5F")
        && flowed.Count == 1 && second.Foreground == accent.Foreground
        && second.Background == accent.Background && second.Attributes == accent.Attributes
        && TextRunWidth(flowed[0]) == 7,
        "TextRun is the styled text surface")
      return failed
    }
  }
}
