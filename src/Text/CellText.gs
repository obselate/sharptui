package SharpTui

import System
import System.Collections.Generic

/// Cell-aware text operations for terminal rendering and layout.
public class CellText {
  shared {
    /// Measures text in terminal display cells.
    /// @param text The text to measure.
    /// @returns The display width in terminal cells.
    public func MeasureWidth(text string) int32 {
      return Glyph.WidthOf(text)
    }

    /// Splits text into user-perceived grapheme clusters.
    /// @param text The text to split.
    /// @returns The grapheme clusters in order.
    public func Graphemes(text string) List[string] {
      let result = List[string]()
      for cluster in Glyph.Elements(text) {
        result.Add(cluster)
      }
      return result
    }

    /// Truncates text by display width without splitting a grapheme cluster.
    /// @param text The text to truncate.
    /// @param widthCells The maximum display width in terminal cells.
    /// @returns The longest prefix of text that fits within widthCells.
    public func Clip(text string, widthCells int32) string {
      if widthCells <= 0 { return "" }
      var out = ""
      var used = 0
      for cluster in Glyph.Elements(text) {
        let width = Glyph.Of(cluster)
        if used + width > widthCells { break }
        out = out + cluster
        used = used + width
      }
      return out
    }

    /// Splits text into lines that fit the requested terminal-cell width.
    /// @param text The text to wrap.
    /// @param widthCells The maximum line width in terminal cells.
    /// @returns The wrapped lines in order.
    public func Wrap(text string, widthCells int32) List[string] {
      let lines = List[string]()
      if widthCells <= 0 { return lines }

      let runs = List[TextRun]()
      runs.Add(TextRun(text, Style()))
      for line in WrapTextRuns(runs, widthCells) {
        var joined = ""
        for run in line { joined = joined + run.Text }
        lines.Add(joined)
      }
      return lines
    }
  }
}
