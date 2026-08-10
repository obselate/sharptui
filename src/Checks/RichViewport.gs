package SharpTui

import System.Collections.Generic

internal class RichViewportCheck {
  shared {
    internal func Run() int32 {
      var failed = 0
      let runs = List[TextRun]()
      runs.Add(TextRun("old 0\nold 1\nold 2\nold 3\nold 4\n", Style()))
      let rich = RichTextBlock{
        Runs: runs,
        Width: CellLength.Cells(12),
        Height: CellLength.Cells(2),
      }
      let screen = Screen(12, 2)
      rich.Draw(screen)
      rich.ScrollToLine(2)
      rich.Draw(screen)

      let earlier = List[TextRun]()
      earlier.Add(TextRun("new 0\nnew 1\n", Style()))
      rich.PrependRuns(earlier)
      rich.Draw(screen)
      failed = failed + Checks.Expect(rich.FirstVisibleLine == 4
          && screen.Probe(0, 0) == "o",
        "RichTextBlock prepend keeps the prior top line visible")

      rich.ScrollToEnd()
      rich.Draw(screen)
      runs.Add(TextRun("old 5\n", Style()))
      rich.Draw(screen)
      failed = failed + Checks.Expect(rich.FirstVisibleLine == rich.LineCount() - 2,
        "RichTextBlock ScrollToEnd follows later content")

      rich.ScrollToLine(0)
      runs.Add(TextRun("old 6\n", Style()))
      rich.Draw(screen)
      failed = failed + Checks.Expect(rich.FirstVisibleLine == 0,
        "RichTextBlock explicit scrolling stops end following")

      let red = Style{ Foreground: Color.Rgb("D65D0E") }
      let blue = Style{ Foreground: Color.Rgb("458588"), Attributes: TextAttributes.Bold }
      let streamedRuns = List[TextRun]{ TextRun("ab cd", red) }
      let streamed = RichTextBlock{
        Runs: streamedRuns,
        Width: CellLength.Cells(4),
        Height: CellLength.Cells(8),
      }
      let streamedScreen = Screen(4, 8)
      streamed.Draw(streamedScreen)
      streamedRuns.Add(TextRun(" efghij", blue))
      streamed.Draw(streamedScreen)
      let appended = WrapTextRuns(streamedRuns, 4)
      failed = failed + Checks.Expect(streamed.LineCount() == appended.Count
          && matches(streamedScreen, appended),
        "RichTextBlock appends styled wrapped runs without changing rows")
      streamedRuns.RemoveAt(streamedRuns.Count - 1)
      streamed.Draw(streamedScreen)
      let restored = WrapTextRuns(streamedRuns, 4)
      failed = failed + Checks.Expect(streamed.LineCount() == restored.Count
          && matches(streamedScreen, restored),
        "RichTextBlock removes a trailing run without changing rows")

      let boundaryRuns = List[TextRun]{ TextRun("one two three four", red) }
      let boundary = RichTextBlock{
        Runs: boundaryRuns,
        Width: CellLength.Cells(7),
        Height: CellLength.Cells(1),
      }
      let boundaryScreen = Screen(7, 1)
      boundary.Draw(boundaryScreen)
      let oldLineCount = boundary.LineCount()
      boundary.ScrollToLine(1)
      boundary.Draw(boundaryScreen)
      let oldTop = boundaryScreen.Probe(0, 0)
      boundary.PrependRuns(List[TextRun]{ TextRun("x", blue) })
      boundary.Draw(boundaryScreen)
      let boundaryExpected = WrapTextRuns(boundaryRuns, 7)
      failed = failed + Checks.Expect(boundary.FirstVisibleLine == 1 + boundaryExpected.Count - oldLineCount
          && boundaryScreen.Probe(0, 0) == oldTop,
        "RichTextBlock rewraps a non-newline prepend and preserves the old viewport")

      let scrollbarRuns = List[TextRun]{ TextRun("abcdefghijklmnopqrst", Style()) }
      let scrollbar = RichTextBlock{
        Runs: scrollbarRuns,
        Width: CellLength.Cells(8),
        Height: CellLength.Cells(2),
        ShowScrollbar: true,
      }
      let narrowScreen = Screen(8, 2)
      scrollbar.Draw(narrowScreen)
      let narrow = scrollbar.ContentBounds.WidthCells == 7
        && narrowScreen.Probe(0, 0) == "a" && narrowScreen.Probe(6, 0) == "g"
        && narrowScreen.Probe(0, 1) == "h" && narrowScreen.Probe(6, 1) == "n"
        && narrowScreen.Probe(7, 0) == "█"
      scrollbar.Width = CellLength.Cells(10)
      let wideScreen = Screen(10, 2)
      scrollbar.Draw(wideScreen)
      failed = failed + Checks.Expect(narrow && scrollbar.ContentBounds.WidthCells == 9
          && wideScreen.Probe(0, 0) == "a" && wideScreen.Probe(8, 0) == "i"
          && wideScreen.Probe(0, 1) == "j" && wideScreen.Probe(8, 1) == "r"
          && wideScreen.Probe(9, 0) == "█",
        "RichTextBlock reserves the scrollbar column while rewrapping across widths")

      return failed
    }

    private func matches(screen Screen, lines List[List[TextRun]]) bool {
      var row = 0
      while row < lines.Count {
        var column = 0
        for run in lines[row] {
          for glyph in Glyph.Elements(run.Text) {
            if screen.Probe(column, row) != glyph { return false }
            column = column + Glyph.Of(glyph)
          }
        }
        row = row + 1
      }
      return true
    }
  }
}
