package SharpTui

import System
import System.Collections.Generic

/// A scrolling markdown view that owns parsing and layout.
public open class MarkdownView : Box {
  private var source string
  private var markdownTheme MarkdownTheme
  private var maximumLineWidth CellLength
  private var firstVisibleLine int32
  private var blocks List[Block]

  private var cache List[List[TextRun]]
  private var cachedWidth int32
  private var hasCachedWidth bool
  private var dirty bool
  private var cachedThemeBody Style
  private var cachedThemeHeading Style
  private var cachedThemeCode Style
  private var cachedThemeQuote Style
  private var cachedThemeLink Style
  private var cachedThemeMarker Style

  /// The raw markdown text. Setting it invalidates the parsed and laid-out cache.
  public prop Source string {
    get { return source }
    set {
      source = value
      dirty = true
    }
  }

  /// The styles applied to parsed markdown elements. Setting it invalidates the cache.
  public prop Theme MarkdownTheme {
    get { return markdownTheme }
    set {
      markdownTheme = value
      dirty = true
    }
  }

  /// The maximum width a wrapped line may occupy before centering; Auto uses the full available width.
  public prop MaximumLineWidth CellLength {
    get { return maximumLineWidth }
    set {
      maximumLineWidth = value
      dirty = true
    }
  }

  /// The index of the topmost visible wrapped line. Negative values clamp to zero.
  public prop FirstVisibleLine int32 {
    get { return firstVisibleLine }
    private set { firstVisibleLine = value < 0 ? 0 : value }
  }

  /// Creates an empty, focusable markdown view with the default theme.
  public init() {
    source = ""
    markdownTheme = MarkdownTheme()
    maximumLineWidth = CellLength.Auto
    firstVisibleLine = 0
    blocks = List[Block]()
    cache = List[List[TextRun]]()
    cachedWidth = 0
    hasCachedWidth = false
    dirty = true
    cachedThemeBody = Style()
    cachedThemeHeading = Style()
    cachedThemeCode = Style()
    cachedThemeQuote = Style()
    cachedThemeLink = Style()
    cachedThemeMarker = Style()
    CanFocus = true
    GrowWeight = 1
  }

  /// Wrapped line count at the last painted width.
  /// @returns The wrapped line count.
  public func LineCount() int32 {
    return cache.Count
  }

  /// Scrolls so that the given wrapped line index becomes the topmost visible line.
  /// @param line The wrapped line index to scroll to.
  public func ScrollToLine(line int32) {
    FirstVisibleLine = line
  }

  /// Returns the total number of wrapped lines.
  /// @returns The wrapped line count.
  protected override func ScrollExtentRows() int32 {
    return cache.Count
  }

  /// Returns FirstVisibleLine as the current scroll offset.
  /// @returns The topmost visible wrapped line index.
  protected override func ScrollOffsetRows() int32 {
    return FirstVisibleLine
  }

  /// Reparses Source when it or Theme changed, relays out the cache if the width changed, and paints the visible lines centered within r.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    let textWidth = constrainedWidth(r.WidthCells)
    if dirty || themeChanged() {
      blocks = ParseMarkdown(Source, Theme)
      snapshotTheme()
      dirty = true
    }
    if dirty || !hasCachedWidth || textWidth != cachedWidth {
      cache = layout(textWidth)
      cachedWidth = textWidth
      hasCachedWidth = true
      dirty = false
    }
    FirstVisibleLine = clamp(FirstVisibleLine, r.HeightRows)
    let xOffset = (r.WidthCells - textWidth) / 2

    var i = FirstVisibleLine
    while i < cache.Count {
      let row = i - FirstVisibleLine
      if row >= r.HeightRows { break }
      var x = xOffset
      let line = cache[i]
      var part = 0
      while part < line.Count {
        let run = line[part]
        let style = resolvedStyle(run.Style, ink)
        screen.WriteClipped(r, x, row, run.Text, style)
        x = x + Glyph.WidthOf(run.Text)
        part = part + 1
      }
      i = i + 1
    }
  }

  /// Handles keyboard and mouse-wheel scrolling within the content bounds.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    let bounds = ContentBounds
    if bounds.HeightRows <= 0 { return EventResult.Continue }

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down { return result(moveBy(1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up { return result(moveBy(-1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown { return result(moveBy(bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp { return result(moveBy(-bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home { return result(moveBy(-cache.Count, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End { return result(moveBy(cache.Count, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Mouse && bounds.Contains(ev.Position) {
      if ev.Mouse == MouseKind.ScrollUp { return result(moveBy(-3, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(moveBy(3, bounds.HeightRows)) }
    }
    return EventResult.Continue
  }

  private func moveBy(delta int32, height int32) bool {
    let want = clamp(FirstVisibleLine + delta, height)
    if want == FirstVisibleLine { return false }
    FirstVisibleLine = want
    return true
  }

  private func clamp(s int32, height int32) int32 {
    var max = cache.Count - height
    if max < 0 { max = 0 }
    if s > max { return max }
    if s < 0 { return 0 }
    return s
  }

  private func constrainedWidth(available int32) int32 {
    if !MaximumLineWidth.IsAuto && MaximumLineWidth.CellCount < available {
      return MaximumLineWidth.CellCount
    }
    return available
  }

  private func themeChanged() bool {
    return !sameStyle(Theme.Body, cachedThemeBody)
      || !sameStyle(Theme.Heading, cachedThemeHeading)
      || !sameStyle(Theme.Code, cachedThemeCode)
      || !sameStyle(Theme.Quote, cachedThemeQuote)
      || !sameStyle(Theme.Link, cachedThemeLink)
      || !sameStyle(Theme.Marker, cachedThemeMarker)
  }

  private func snapshotTheme() {
    cachedThemeBody = Theme.Body
    cachedThemeHeading = Theme.Heading
    cachedThemeCode = Theme.Code
    cachedThemeQuote = Theme.Quote
    cachedThemeLink = Theme.Link
    cachedThemeMarker = Theme.Marker
  }

  private func sameStyle(left Style, right Style) bool {
    return left.Foreground == right.Foreground && left.Background == right.Background
      && left.Attributes == right.Attributes
  }

  private func layout(width int32) List[List[TextRun]] {
    let lines = List[List[TextRun]]()
    if width <= 0 { return lines }

    for b in blocks {
      if b.Kind == BlockKind.Head1 || b.Kind == BlockKind.Head2 || b.Kind == BlockKind.Head3 || b.Kind == BlockKind.Para {
        for wrapped in WrapTextRuns(b.Runs, width) { lines.Add(wrapped) }
        lines.Add(List[TextRun]())
        continue
      }
      if b.Kind == BlockKind.Bullet || b.Kind == BlockKind.Number {
        addList(lines, b, width)
        continue
      }
      if b.Kind == BlockKind.Quote {
        addQuote(lines, b, width)
        continue
      }
      if b.Kind == BlockKind.Table {
        addTable(lines, b, width)
        continue
      }
      if b.Kind == BlockKind.Code {
        var textWidth = width - 2
        if textWidth < 1 { textWidth = 1 }
        let parts = WrapTextRuns(b.Runs, textWidth)
        if parts.Count == 0 { lines.Add(List[TextRun]()) }
        for wrapped in parts {
          let line = List[TextRun]()
          line.Add(TextRun("  ", Style()))
          for s in wrapped { line.Add(s) }
          lines.Add(line)
        }
        continue
      }
      if b.Kind == BlockKind.Rule {
        let line = List[TextRun]()
        line.Add(TextRun("".PadRight(width, char(0x2500)), Style()))
        lines.Add(line)
        continue
      }
      if lines.Count == 0 || lines[lines.Count - 1].Count == 0 { continue }
      lines.Add(List[TextRun]())
    }
    return lines
  }

  private func addList(lines List[List[TextRun]], b Block, width int32) {
    let indent = b.Depth * 2
    let prefixWidth = Glyph.WidthOf(b.Marker) + 1
    var textWidth = width - indent - prefixWidth
    if textWidth < 1 { textWidth = 1 }

    var i = 0
    for w in WrapTextRuns(b.Runs, textWidth) {
      let line = List[TextRun]()
      if i == 0 {
        line.Add(TextRun("".PadRight(indent) + b.Marker + " ", Style()))
      } else {
        line.Add(TextRun("".PadRight(indent + prefixWidth), Style()))
      }
      for s in w { line.Add(s) }
      lines.Add(line)
      i = i + 1
    }
  }

  private func addTable(lines List[List[TextRun]], b Block, width int32) {
    let cols = b.Marker.Length
    if cols <= 0 || b.Cells.Count < cols { return }
    let rows = b.Cells.Count / cols
    let widths = tableWidths(b, cols, rows, width)
    let dim = Style()

    var r = 0
    while r < rows {
      let wrapped = List[List[List[TextRun]]]()
      var tall = 1
      var c = 0
      while c < cols {
        let parts = WrapTextRuns(b.Cells[r * cols + c], widths[c])
        wrapped.Add(parts)
        if parts.Count > tall { tall = parts.Count }
        c = c + 1
      }

      var k = 0
      while k < tall {
        let line = List[TextRun]()
        c = 0
        while c < cols {
          if c > 0 { line.Add(TextRun(" " + char(0x2502).ToString() + " ", dim)) }
          let part = k < wrapped[c].Count ? wrapped[c][k] : List[TextRun]()
          cellInto(line, part, widths[c], b.Marker[c])
          c = c + 1
        }
        lines.Add(line)
        k = k + 1
      }
      if r == 0 { lines.Add(ruleRow(widths, cols, dim)) }
      r = r + 1
    }
    lines.Add(List[TextRun]())
  }

  private func ruleRow(widths List[int32], cols int32, dim Style) List[TextRun] {
    var text = ""
    for i in 0 ... cols {
      if i > 0 { text = text + char(0x2500).ToString() + char(0x253C).ToString() + char(0x2500).ToString() }
      text = text + "".PadRight(widths[i], char(0x2500))
    }
    let line = List[TextRun]()
    line.Add(TextRun(text, dim))
    return line
  }

  private func tableWidths(b Block, cols int32, rows int32, width int32) List[int32] {
    let out = List[int32]()
    var total = 3 * (cols - 1)
    for c in 0 ... cols {
      var w = 1
      var r = 0
      while r < rows {
        let cw = TextRunWidth(b.Cells[r * cols + c])
        if cw > w { w = cw }
        r = r + 1
      }
      out.Add(w)
      total = total + w
    }

    while total > width {
      var widest = 0
      for i in 0 ... cols {
        if out[i] > out[widest] { widest = i }
      }
      if out[widest] <= 1 { break }
      out[widest] = out[widest] - 1
      total = total - 1
    }
    return out
  }

  private func cellInto(line List[TextRun], cell List[TextRun], w int32, align char) {
    let used = TextRunWidth(cell)
    var lead = 0
    if used < w {
      if align == 'r' { lead = w - used }
      if align == 'c' { lead = (w - used) / 2 }
    }
    if lead > 0 { line.Add(TextRun("".PadRight(lead), Style())) }

    var room = w - lead
    for s in cell {
      if room <= 0 { break }
      let sw = Glyph.WidthOf(s.Text)
      if sw <= room {
        line.Add(s)
        room = room - sw
      } else {
        let cut = CellText.Clip(s.Text, room)
        if cut != "" { line.Add(TextRun(cut, s.Style)) }
        room = 0
      }
    }

    let tail = w - lead - (used < w ? used : w - lead)
    if tail > 0 { line.Add(TextRun("".PadRight(tail), Style())) }
  }

  private func addQuote(lines List[List[TextRun]], b Block, width int32) {
    var bar = ""
    for i in 0 ... b.Depth + 1 { bar = bar + char(0x2502).ToString() + " " }
    var textWidth = width - Glyph.WidthOf(bar)
    if textWidth < 1 { textWidth = 1 }

    for w in WrapTextRuns(b.Runs, textWidth) {
      let line = List[TextRun]()
      line.Add(TextRun(bar, Style()))
      for s in w { line.Add(s) }
      lines.Add(line)
    }
  }

  private func resolvedStyle(own Style, inherited Style) Style {
    return Style{
      Foreground: own.Foreground.IsInherited ? inherited.Foreground : own.Foreground,
      Background: own.Background.IsInherited ? inherited.Background : own.Background,
      Attributes: TextAttributes(int32(inherited.Attributes) | int32(own.Attributes)),
    }
  }

  private func result(handled bool) EventResult {
    return handled ? EventResult.Handled : EventResult.Continue
  }
}
