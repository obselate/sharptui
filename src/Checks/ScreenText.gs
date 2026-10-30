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
      let leftClip = Screen(5, 1)
      leftClip.Write(0, 0, "xxxxx")
      leftClip.WriteClipped(CellRect{ Column: 2, WidthCells: 2, HeightRows: 1 }, -1, 0, "abc")
      failed = failed + Checks.Expect(leftClip.Probe(1, 0) == "x" && leftClip.Probe(2, 0) == "b"
        && leftClip.Probe(3, 0) == "c" && leftClip.Probe(4, 0) == "x",
        "Screen.WriteClipped clips both rectangle edges")

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

      let target = "https://example.com/docs"
      let linked = TextRun("open", accent, target)
      let linkScreen = Screen(8, 1)
      linkScreen.Write(0, 0, linked)
      let linkWire = linkScreen.Flush()
      failed = failed + Checks.Expect(linked.Hyperlink == target
        && linkWire.Contains("]8;id=sharptui-1;" + target)
        && linkWire.Contains("]8;;") && linkScreen.Flush() == "",
        "TextRun hyperlinks emit balanced OSC 8 transitions through the screen diff")

      let linkedWrapped = WrapTextRuns(List[TextRun]{ linked }, 2)
      failed = failed + Checks.Expect(linkedWrapped.Count == 2
        && linkedWrapped[0][0].Hyperlink == target && linkedWrapped[1][0].Hyperlink == target,
        "TextRun wrapping preserves hyperlink identity")

      failed = failed + Checks.Expect(rejectsHyperlinkControl(accent),
        "Screen rejects control characters in hyperlink targets")
      for i in 0 ... 100000 {
        let text = char.ConvertFromUtf32(0x10000 + i) + "x"
        GlyphCache.Intern(text, 0, text.Length - 1)
        if GlyphCache.InternedCount() > GlyphCache.ClusterLimit {
          failed = failed + Checks.Expect(false, "the grapheme cache stays within its limit")
          break
        }
      }
      let collisionA = GlyphCache.Intern("xĀa", 1, 2)
      let collisionB = GlyphCache.Intern("xāB", 1, 2)
      failed = failed + Checks.Expect(collisionA == "Āa" && collisionB == "āB"
        && Object.ReferenceEquals(collisionA, GlyphCache.Intern("Āay", 0, 2)),
        "grapheme interning compares contents and handles equal hashes")
      let text = "中文 👩‍💻 é "
      let table = TableView{
        Columns: { TableColumn{ Header: text, ColumnWidth: ColumnWidth.Cells(32) } },
        Rows: { TableRow{ Cells: { TableCell(text) } } },
      }
      let widgets = List[Box]{
        Label{ Text: text },
        TextBlock{ Text: text },
        RichTextBlock{ Runs: List[TextRun]{ TextRun(text, accent) } },
        table,
        TextInput{ Text: text },
        TextArea{ Text: text + "\n" + text, ShowLineNumbers: false },
        KeyHintBar{ Items: { KeyHint{ KeyText: text, Text: text } } },
        NumericDisplay{ Text: text },
        ChartView{ HorizontalTicks: { ChartTick{ Value: 0.0, Text: text } } },
      }
      for widget in widgets {
        widget.Width = CellLength.Cells(40)
        widget.Height = CellLength.Cells(4)
        let screen = Screen(40, 4)
        let output = TerminalBuffer(4096)
        widget.Focus(widget)
        for i in 0 ... 64 {
          screen.Clear()
          widget.Draw(screen)
          screen.Emit(output)
        }
        let before = GC.GetAllocatedBytesForCurrentThread()
        for i in 0 ... 128 {
          screen.Clear()
          widget.Draw(screen)
          screen.Emit(output)
        }
        let bytes = GC.GetAllocatedBytesForCurrentThread() - before
        failed = failed + Checks.Expect(bytes == 0,
          widget.GetType().Name + " repaints Chinese, emoji and combining text without allocations: " + bytes.ToString())
        var chinese = false
        var emoji = false
        var combining = false
        for row in 0 ... 4 {
          for column in 0 ... 40 {
            let glyph = screen.Probe(column, row)
            chinese = chinese || glyph == "中"
            emoji = emoji || glyph == "👩‍💻"
            combining = combining || glyph == "é"
          }
        }
        failed = failed + Checks.Expect(chinese && emoji && combining,
          widget.GetType().Name + " preserves Chinese, emoji and combining clusters")
      }
      return failed
    }
  }
}

private func rejectsHyperlinkControl(style Style) bool {
  try {
    let screen = Screen(2, 1)
    screen.Write(0, 0, TextRun("x", style, "https://example.com/" + char(7).ToString()))
    return false
  } catch (error ArgumentException) {
    return true
  }
}
