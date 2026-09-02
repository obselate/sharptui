package SharpTui

import System
import System.Collections.Generic

/// A run of text with one style. Rich text is a list of these.
public struct TextRun {
  private var text string
  private var style Style
  private var hyperlink string

  /// The run's text content.
  public prop Text string {
    get -> text
    init -> text = value
  }

  /// The style applied to this run's text.
  public prop Style Style {
    get -> style
    init -> style = value
  }

  /// The OSC 8 hyperlink target carried by this run, or an empty string for plain text.
  public prop Hyperlink string {
    get -> hyperlink ?? ""
    init -> hyperlink = value ?? ""
  }

  /// Creates a text run with the given text and style.
  /// @param text The run's text content.
  /// @param style The style applied to the run's text.
  public init(text string, style Style) {
    this.text = text
    this.style = style
    hyperlink = ""
  }

  /// Creates a styled text run with a semantic hyperlink target.
  /// @param text The run's text content.
  /// @param style The style applied to this run's text.
  /// @param hyperlink The OSC 8 target URI, or an empty string for plain text.
  public init(text string, style Style, hyperlink string) {
    this.text = text
    this.style = style
    this.hyperlink = hyperlink ?? ""
  }
}

/// One immutable physical line supplied to a RichTextBlock.
public class RichTextLine {
  private var runs List[TextRun]
  private var runWidths List[int32]
  private var runGraphemes List[int32]
  private var widthCells int32

  /// The styled runs in this line.
  public prop Runs IReadOnlyList[TextRun] -> runs

  /// The total display width of the line.
  public prop WidthCells int32 -> widthCells

  /// Creates a physical line and caches its run widths.
  /// @param runs The styled runs, without newline characters.
  public init(runs List[TextRun]) {
    this.runs = List[TextRun]()
    runWidths = List[int32]()
    runGraphemes = List[int32]()
    widthCells = 0
    for run in runs {
      this.runs.Add(run)
      let width = fastTextWidth(run.Text)
      runWidths.Add(width)
      runGraphemes.Add(fastGraphemeCount(run.Text))
      widthCells = widthCells + width
    }
  }

  internal func RunWidth(index int32) int32 -> runWidths[index]
  internal func RunGraphemeCount(index int32) int32 -> runGraphemes[index]

  internal func Matches(text string) bool {
    var offset = 0
    var runIndex = 0
    while runIndex < runs.Count {
      let value = runs[runIndex].Text
      if offset + value.Length > text.Length { return false }
      if String.CompareOrdinal(text, offset, value, 0, value.Length) != 0 { return false }
      offset = offset + value.Length
      runIndex = runIndex + 1
    }
    return offset == text.Length
  }
}

/// Supplies immutable physical lines to a RichTextBlock on demand.
public interface RichLineSource {
  /// Returns the number of available physical lines.
  /// @returns The physical line count.
  func Count() int32;

  /// Returns one stable physical line. A block may request nearby lines for prefetching.
  /// @param index The zero-based physical line index.
  /// @returns The requested styled line.
  func ItemAt(index int32) RichTextLine;

  /// Returns the greatest display width of any physical line.
  /// @returns The maximum line width in terminal cells.
  func MaximumLineWidth() int32;
}

internal func fastTextWidth(text string) int32 {
  var i = 0
  while i < text.Length {
    if text[i] >= '\u0080' { return Glyph.WidthOf(text) }
    i = i + 1
  }
  return text.Length
}

internal func fastGraphemeCount(text string) int32 {
  var i = 0
  while i < text.Length {
    if text[i] >= '\u0080' {
      var count = 0
      for cluster in Glyph.Elements(text) { count = count + 1 }
      return count
    }
    i = i + 1
  }
  return text.Length
}

internal struct Span {
  private var text string
  private var ink Style
  private var hyperlink string

  public prop Text string {
    get -> text
    init -> text = value
  }
  public prop Ink Style {
    get -> ink
    init -> ink = value
  }
  public prop Hyperlink string {
    get -> hyperlink ?? ""
    init -> hyperlink = value ?? ""
  }

  public init(text string, ink Style) {
    this.text = text
    this.ink = ink
    hyperlink = ""
  }

  public init(text string, ink Style, hyperlink string) {
    this.text = text
    this.ink = ink
    this.hyperlink = hyperlink ?? ""
  }
}

/// Wraps styled text runs to a cell width, preserving every run's style.
internal func WrapTextRuns(runs List[TextRun], width int32) List[List[TextRun]] {
  let lines = List[List[TextRun]]()
  if width <= 0 { return lines }

  let text = List[string]()
  let styles = List[Style]()
  let links = List[string]()
  for run in runs {
    for cluster in Glyph.Elements(run.Text) {
      text.Add(cluster)
      styles.Add(run.Style)
      links.Add(run.Hyperlink)
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
      lines.Add(packRuns(text, styles, links, start, i))
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
      lines.Add(packRuns(text, styles, links, start, i))
      start = i
      used = 0
      wordAt = i
      wordWidth = 0
    }
    if used + wordWidth + w > width {
      lines.Add(packRuns(text, styles, links, start, wordAt))
      start = wordAt
      used = 0
    }
    wordWidth = wordWidth + w
    i = i + 1
  }

  lines.Add(packRuns(text, styles, links, start, text.Count))
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

internal func packRuns(text List[string], styles List[Style], links List[string],
    from int32, to int32) List[TextRun] {
  let out = List[TextRun]()
  var end = to
  while end > from && text[end - 1] == " " {
    end = end - 1
  }
  if end <= from { return out }

  var run = ""
  var runStyle = styles[from]
  var runLink = links[from]
  var i = from
  while i < end {
    if !stylesEqual(styles[i], runStyle) || links[i] != runLink {
      out.Add(TextRun(run, runStyle, runLink))
      run = ""
      runStyle = styles[i]
      runLink = links[i]
    }
    run = run + text[i]
    i = i + 1
  }
  if run != "" { out.Add(TextRun(run, runStyle, runLink)) }
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
      screen.WriteClipped(r, x, row, TextRun(run.Text, style, run.Hyperlink))
      x = x + Glyph.WidthOf(run.Text)
      part = part + 1
    }
    i = i + 1
  }
}
