package SharpTui

import System
import System.Collections.Generic

/// A run of text with one style. Rich text is a list of these.
public struct TextRun {
  private var text string
  private var style Style

  /// The run's text content.
  public prop Text string {
    get { return text }
    init { text = value }
  }

  /// The style applied to this run's text.
  public prop Style Style {
    get { return style }
    init { style = value }
  }

  /// Creates a text run with the given text and style.
  /// @param text The run's text content.
  /// @param style The style applied to the run's text.
  public init(text string, style Style) {
    this.text = text
    this.style = style
  }
}

internal struct Span {
  private var text string
  private var ink Style

  public prop Text string {
    get { return text }
    init { text = value }
  }
  public prop Ink Style {
    get { return ink }
    init { ink = value }
  }

  public init(text string, ink Style) {
    this.text = text
    this.ink = ink
  }
}

/// Wraps styled text runs to a cell width, preserving every run's style.
internal func WrapTextRuns(runs List[TextRun], width int32) List[List[TextRun]] {
  let lines = List[List[TextRun]]()
  if width <= 0 { return lines }

  let text = List[string]()
  let styles = List[Style]()
  for run in runs {
    for cluster in Glyph.Elements(run.Text) {
      text.Add(cluster)
      styles.Add(run.Style)
    }
  }

  var start = 0
  var used = 0
  var wordAt = 0
  var wordWidth = 0
  var i = 0

  while i < text.Count {
    let cluster = text[i]
    let w = Glyph.Of(cluster)

    if cluster == "\n" {
      lines.Add(packRuns(text, styles, start, i))
      i = i + 1
      start = i
      used = 0
      wordAt = i
      wordWidth = 0
      continue
    }
    if cluster == " " {
      used = used + wordWidth + w
      i = i + 1
      wordAt = i
      wordWidth = 0
      continue
    }
    if wordWidth + w > width {
      lines.Add(packRuns(text, styles, start, i))
      start = i
      used = 0
      wordAt = i
      wordWidth = 0
    }
    if used + wordWidth + w > width {
      lines.Add(packRuns(text, styles, start, wordAt))
      start = wordAt
      used = 0
    }
    wordWidth = wordWidth + w
    i = i + 1
  }

  lines.Add(packRuns(text, styles, start, text.Count))
  return lines
}

/// Total display width of one text-run line.
internal func TextRunWidth(line List[TextRun]) int32 {
  var total = 0
  for run in line {
    total = total + Glyph.WidthOf(run.Text)
  }
  return total
}

internal func packRuns(text List[string], styles List[Style], from int32, to int32) List[TextRun] {
  let out = List[TextRun]()
  var end = to
  while end > from && text[end - 1] == " " {
    end = end - 1
  }
  if end <= from { return out }

  var run = ""
  var runStyle = styles[from]
  var i = from
  while i < end {
    if !stylesEqual(styles[i], runStyle) {
      out.Add(TextRun(run, runStyle))
      run = ""
      runStyle = styles[i]
    }
    run = run + text[i]
    i = i + 1
  }
  if run != "" { out.Add(TextRun(run, runStyle)) }
  return out
}

/// True when two styles match on every field that affects painting.
internal func stylesEqual(a Style, b Style) bool {
  return a.Foreground == b.Foreground && a.Background == b.Background && a.Attributes == b.Attributes
}

/// Paints wrapped run lines top-down from first, clipped to r, each line starting at x0.
internal func paintRunLines(screen Screen, r CellRect, lines List[List[TextRun]], first int32, x0 int32, ink Style) {
  var i = first
  while i < lines.Count {
    let row = i - first
    if row >= r.HeightRows { break }
    var x = x0
    let line = lines[i]
    var part = 0
    while part < line.Count {
      let run = line[part]
      let style = run.Style.MergedOver(ink)
      screen.WriteClipped(r, x, row, run.Text, style)
      x = x + Glyph.WidthOf(run.Text)
      part = part + 1
    }
    i = i + 1
  }
}
