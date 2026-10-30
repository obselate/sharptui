package SharpTui

import System
import System.Collections.Generic
import System.Text

private struct RichGlyph {
  public var Text string
  public var Style Style
  public var Hyperlink string
  public var Position TextPosition

  public init(text string, style Style, hyperlink string, position TextPosition) {
    Text = text
    Style = style
    Hyperlink = hyperlink
    Position = position
  }
}

private struct RichWrapState {
  public var CacheCount int32
  public var OpenCount int32
  public var OpenStart int32
  public var WordAt int32
  public var Used int32
  public var WordWidth int32
  public var Line int32
  public var Grapheme int32
}

/// Word-wraps styled runs into packed TextRun lines. Shared by RichTextBlock's incremental cache
/// (via AttachOpen/DetachOpen/CaptureState/RestoreState) and one-shot prepend wrapping (via Complete).
private class RichRunWrapper {
  private var width int32
  private var lines List[List[TextRun]]
  private var pending List[RichGlyph]
  private var start int32
  private var wordAt int32
  private var used int32
  private var wordWidth int32
  private var line int32
  private var grapheme int32
  private var starts List[TextPosition]

  internal init(width int32) {
    this.width = width
    lines = List[List[TextRun]]()
    pending = List[RichGlyph]()
    start = 0
    wordAt = 0
    used = 0
    wordWidth = 0
    starts = List[TextPosition]()
  }

  /// The packed lines committed so far, including any attached open (trailing, still-open) line.
  internal prop Lines List[List[TextRun]] -> lines
  internal prop Starts List[TextPosition] -> starts

  internal func Append(run TextRun) {
    for cluster in Glyph.Elements(run.Text) { appendGlyph(cluster, run.Style, run.Hyperlink) }
  }

  /// Packs and appends the still-open trailing line, then returns Lines.
  internal func Complete() List[List[TextRun]] {
    AttachOpen()
    return lines
  }

  /// Packs and appends the still-open trailing line as a line of its own.
  internal func AttachOpen() {
    commit(start, pending.Count)
  }

  /// Removes the trailing open line previously added by AttachOpen, so appending can resume.
  internal func DetachOpen() {
    if lines.Count > 0 {
      lines.RemoveAt(lines.Count - 1)
      starts.RemoveAt(starts.Count - 1)
    }
  }

  /// Snapshots the wrap position so RestoreState can undo appends back to this point.
  internal func CaptureState() RichWrapState {
    return RichWrapState{
      CacheCount: lines.Count,
      OpenCount: pending.Count,
      OpenStart: start,
      WordAt: wordAt,
      Used: used,
      WordWidth: wordWidth,
      Line: line,
      Grapheme: grapheme,
    }
  }

  /// Truncates committed lines and pending glyphs back to a previously captured state.
  internal func RestoreState(state RichWrapState) {
    while lines.Count > state.CacheCount {
      lines.RemoveAt(lines.Count - 1)
      starts.RemoveAt(starts.Count - 1)
    }
    while pending.Count > state.OpenCount { pending.RemoveAt(pending.Count - 1) }
    start = state.OpenStart
    wordAt = state.WordAt
    used = state.Used
    wordWidth = state.WordWidth
    line = state.Line
    grapheme = state.Grapheme
  }

  private func appendGlyph(text string, style Style, hyperlink string) {
    if text == "\n" {
      commit(start, pending.Count)
      start = pending.Count
      wordAt = pending.Count
      used = 0
      wordWidth = 0
      line = line + 1
      grapheme = 0
      return
    }

    let glyphWidth = Glyph.Of(text)
    if text != " " {
      if wordWidth + glyphWidth > width {
        commit(start, pending.Count)
        start = pending.Count
        wordAt = pending.Count
        used = 0
        wordWidth = 0
      }
      if used + wordWidth + glyphWidth > width {
        commit(start, wordAt)
        start = wordAt
        used = 0
      }
    }

    pending.Add(RichGlyph(text, style, hyperlink,
      TextPosition{ LineIndex: line, GraphemeIndex: grapheme }))
    grapheme = grapheme + 1
    if text == " " {
      used = used + wordWidth + glyphWidth
      wordAt = pending.Count
      wordWidth = 0
    } else {
      wordWidth = wordWidth + glyphWidth
    }
  }

  private func commit(from int32, to int32) {
    lines.Add(pack(from, to))
    starts.Add(from < pending.Count ? pending[from].Position
      : TextPosition{ LineIndex: line, GraphemeIndex: grapheme })
  }

  private func pack(from int32, to int32) List[TextRun] {
    let line = List[TextRun]()
    var end = to
    while end > from && pending[end - 1].Text == " " { end = end - 1 }
    if end <= from { return line }

    var style = pending[from].Style
    var hyperlink = pending[from].Hyperlink
    let text = StringBuilder()
    var i = from
    while i < end {
      let glyph = pending[i]
      if !stylesEqual(style, glyph.Style) || hyperlink != glyph.Hyperlink {
        line.Add(TextRun(text.ToString(), style, hyperlink))
        text.Clear()
        style = glyph.Style
        hyperlink = glyph.Hyperlink
      }
      text.Append(glyph.Text)
      i = i + 1
    }
    if text.Length > 0 { line.Add(TextRun(text.ToString(), style, hyperlink)) }
    return line
  }
}

/// Styled, wrapped text with an explicit line viewport.
/// Read-only selection uses physical lines and grapheme indexes. Appends preserve selection.
/// Replacing, prepending, or removing content clears selection.
public open class RichTextBlock : Box {
  private var runs List[TextRun]
  private var lineSource RichLineSource?
  private var wrapping TextWrapping
  private var showLineNumbers bool
  private var gutterStyle Style
  private var firstVisibleLine int32
  private var horizontalCellOffset int32
  private var maximumUnwrappedWidth int32

  private var cache List[List[TextRun]]
  private var unwrappedLines List[List[TextRun]]
  private var wrapper RichRunWrapper
  private var cachedRunCount int32
  private var cachedWidth int32
  private var dirty bool
  private var states List[RichWrapState]
  private var canUndoTail bool
  private var followEnd bool
  private var preservePrepend bool
  private var prependLineCount int32
  private var prependFirstLine int32
  private var prependWidth int32
  private var cachedPrefixRunCount int32
  private var cachedPrefixLineCount int32
  private var anchor TextPosition
  private var selectionEnd TextPosition
  private var marked bool
  private var selectedTextStyle Style
  private var clipboard Clipboard?
  /// The styled runs to display. Setting it invalidates the display cache.
  /// Mutating the returned list in place does not invalidate the cache. Reassign Runs or use AppendRuns, PrependRuns, RemoveHeadRuns, RemoveTailRuns, or ClearRuns.
  public prop Runs List[TextRun] {
    get {
      return runs
    }
    set {
      runs = value
      lineSource = nil
      ClearSelection()
      cachedRunCount = -1
      dirty = true
      MarkMeasureDirty()
    }
  }

  /// An optional immutable physical-line source. Setting it selects unwrapped mode and clears Runs.
  public prop LineSource RichLineSource? {
    get -> lineSource
    set {
      if Object.ReferenceEquals(lineSource, value) { return }
      lineSource = value
      ClearSelection()
      if value != nil {
        runs.Clear()
        wrapping = TextWrapping.None
        horizontalCellOffset = 0
        maximumUnwrappedWidth = 0
      }
      cachedRunCount = -1
      dirty = true
    }
  }

  /// Whether rich text wraps at word boundaries or preserves physical lines.
  public prop Wrapping TextWrapping {
    get -> wrapping
    set {
      if wrapping == value { return }
      wrapping = value
      if value != TextWrapping.None && lineSource != nil {
        lineSource = nil
        ClearSelection()
      }
      cachedRunCount = -1
      dirty = true
  }
  }

  /// Whether unwrapped physical lines display a right-aligned line-number gutter.
  public prop ShowLineNumbers bool {
    get -> showLineNumbers
    set {
      if showLineNumbers == value { return }
      showLineNumbers = value
  }
  }

  /// The style applied to the line-number gutter in unwrapped mode.
  public prop GutterStyle Style {
    get -> gutterStyle
    set -> gutterStyle = value
  }

  /// The index of the topmost visible line. Negative values clamp to zero.
  public prop FirstVisibleLine int32 {
    get -> firstVisibleLine
    private set -> firstVisibleLine = value < 0 ? 0 : value
  }

  /// The number of content cells skipped from the left edge in unwrapped mode.
  /// Negative values clamp to zero.
  public prop HorizontalCellOffset int32 {
    get -> horizontalCellOffset
    set -> horizontalCellOffset = value < 0 ? 0 : value
  }

  /// The selected source-line and grapheme range, or nil when empty.
  public prop Selection TextSelection? {
    get {
      if !marked { return nil }
      return TextSelection{ Start: selectionStart(), End: selectionStop() }
    }
  }

  /// The selected plain text. Reading this property creates the copied string.
  public prop SelectedText string -> selectedText()

  /// The style applied over selected text. Defaults to reverse video.
  public prop SelectedTextStyle Style {
    get -> selectedTextStyle
    set -> selectedTextStyle = value
  }

  /// The clipboard used by CopySelection and Ctrl+C.
  /// Defaults to the app clipboard when attached, otherwise MemoryClipboard.Shared.
  public prop Clipboard Clipboard {
    get -> clipboard ?? TreeRoot().TreeClipboard ?? MemoryClipboard.Shared
    set {
      if value == nil { throw ArgumentNullException("Clipboard") }
      clipboard = value
    }
  }

  /// Selects all source text without moving the viewport.
  public func SelectAll() {
    ReleaseMouseCapture()
    anchor = TextPosition{ LineIndex: 0, GraphemeIndex: 0 }
    var row = 0
    var column = 0
    if let source = lineSource {
      row = source.Count() - 1
      if row < 0 { row = 0 }
      else {
        let line = source.ItemAt(row)
        var index = 0
        while index < line.Runs.Count {
          column = column + line.RunGraphemeCount(index)
          index = index + 1
        }
      }
    } else {
      for run in runs {
        for cluster in Glyph.Elements(run.Text) {
          if cluster == "\n" {
            row = row + 1
            column = 0
          } else { column = column + 1 }
        }
      }
    }
    selectionEnd = TextPosition{ LineIndex: row, GraphemeIndex: column }
    marked = row != 0 || column != 0
  }

  /// Clears the selection and ends any captured drag.
  public func ClearSelection() {
    marked = false
    ReleaseMouseCapture()
  }

  /// Copies selected plain text to Clipboard.
  /// @returns True when nonempty selected text was copied.
  public func CopySelection() bool {
    if !marked { return false }
    Clipboard.SetText(SelectedText)
    return true
  }
  /// Creates an empty, focusable rich text block.
  public init() {
    runs = List[TextRun]()
    lineSource = nil
    wrapping = TextWrapping.Word
    showLineNumbers = false
    gutterStyle = Style()
    firstVisibleLine = 0
    horizontalCellOffset = 0
    maximumUnwrappedWidth = 0
    wrapper = RichRunWrapper(0)
    cache = wrapper.Lines
    unwrappedLines = List[List[TextRun]]()
    cachedRunCount = -1
    cachedWidth = -1
    dirty = true
    states = List[RichWrapState]()
    canUndoTail = true
    followEnd = false
    preservePrepend = false
    prependLineCount = 0
    prependFirstLine = 0
    prependWidth = -1
    cachedPrefixRunCount = 0
    cachedPrefixLineCount = 0
    selectedTextStyle = Style{ Attributes: TextAttributes.Reverse }
    clipboard = nil
    CanFocus = true
    Grow = 1
  }

  /// Returns the number of active wrapped or physical lines.
  /// @returns The number of active lines.
  public func LineCount() int32 -> activeLineCount()

  /// Scrolls so that the given line index becomes the topmost visible line.
  /// @param line The line index to scroll to.
  public func ScrollToLine(line int32) {
    followEnd = false
    preservePrepend = false
    FirstVisibleLine = line
  }

  /// Keeps the viewport pinned to the final line across later updates.
  public func ScrollToEnd() {
    followEnd = true
    preservePrepend = false
  }

  /// Appends runs to the current content.
  /// @param added The runs to append.
  public func AppendRuns(added List[TextRun]) {
    if added.Count == 0 { return }
    useRunContent()
    if Object.ReferenceEquals(added, runs) {
      throw ArgumentException("added must not be Runs", "added")
    }

    let oldCount = runs.Count
    var i = 0
    while i < added.Count {
      runs.Add(added[i])
      i = i + 1
    }

    if wrapping == TextWrapping.None {
      rebuildUnwrapped()
      return
    }

    if !dirty && cachedWidth > 0 && canUndoTail && cachedRunCount == oldCount {
      appendRuns(oldCount)
      return
    }
    cachedRunCount = -1
    dirty = true
  }

  /// Inserts runs before the current content and keeps the same old line visible.
  /// @param added The runs to insert before the current content.
  public func PrependRuns(added List[TextRun]) {
    if added.Count == 0 { return }
    ClearSelection()
    useRunContent()
    if Object.ReferenceEquals(added, runs) {
      throw ArgumentException("added must not be Runs", "added")
    }

    if wrapping == TextWrapping.Word && !dirty && cachedWidth > 0 && endsWithNewline(added) {
      prependCached(added)
      return
    }

    if wrapping == TextWrapping.None && dirty {
      rebuildUnwrapped()
    }
    if !followEnd && !preservePrepend && (cachedWidth >= 0 || wrapping == TextWrapping.None) {
      preservePrepend = true
      prependLineCount = activeLineCount()
      prependFirstLine = FirstVisibleLine
      prependWidth = cachedWidth
    }

    var i = 0
    while i < added.Count {
      runs.Insert(i, added[i])
      i = i + 1
    }

    if wrapping == TextWrapping.None {
      rebuildUnwrapped()
      return
    }
    cachedRunCount = -1
    dirty = true
  }
  /// Removes runs from the start of a cached newline-delimited prepend.
  /// @param count The number of head runs to remove.
  public func RemoveHeadRuns(count int32) {
    if count <= 0 || runs.Count == 0 { return }
    ClearSelection()

    let oldCount = runs.Count
    let remove = count > oldCount ? oldCount : count
    if !dirty && cachedWidth > 0 && cachedPrefixRunCount > 0 && remove == cachedPrefixRunCount {
      let prefixPhysicalLines = wrapper.Starts[cachedPrefixLineCount].LineIndex
      var i = 0
      while i < remove {
        runs.RemoveAt(0)
        i = i + 1
      }
      i = 0
      while i < cachedPrefixLineCount {
        cache.RemoveAt(0)
        wrapper.Starts.RemoveAt(0)
        i = i + 1
      }
      var startIndex = 0
      while startIndex < wrapper.Starts.Count {
        let previous = wrapper.Starts[startIndex]
        wrapper.Starts[startIndex] = TextPosition{
          LineIndex: previous.LineIndex - prefixPhysicalLines,
          GraphemeIndex: previous.GraphemeIndex,
        }
        startIndex = startIndex + 1
      }
      if !followEnd { FirstVisibleLine = FirstVisibleLine - cachedPrefixLineCount }
      cachedPrefixRunCount = 0
      cachedPrefixLineCount = 0
      cachedRunCount = runs.Count
      canUndoTail = true
      return
    }

    var i = 0
    while i < remove {
      runs.RemoveAt(0)
      i = i + 1
    }
    cachedRunCount = -1
    dirty = true
  }

  /// Removes a number of runs from the end of the current content.
  /// @param count The number of tail runs to remove.
  public func RemoveTailRuns(count int32) {
    if count <= 0 || runs.Count == 0 { return }
    ClearSelection()

    let oldCount = runs.Count
    let remove = count > oldCount ? oldCount : count
    let target = oldCount - remove
    while runs.Count > target { runs.RemoveAt(runs.Count - 1) }

    if wrapping == TextWrapping.None {
      rebuildUnwrapped()
      return
    }

    if !dirty && cachedWidth > 0 && canUndoTail && cachedRunCount == oldCount {
      undoTail(target)
      return
    }
    cachedRunCount = -1
    dirty = true
  }

  /// Removes all runs from the current content.
  public func ClearRuns() {
    useRunContent()
    ClearSelection()
    if runs.Count == 0 {
      cachedRunCount = -1
      dirty = true
      return
    }
    runs.Clear()

    if wrapping == TextWrapping.None {
      rebuildUnwrapped()
      return
    }
    cachedRunCount = -1
    dirty = true
  }

  private func useRunContent() {
    if lineSource == nil { return }
    lineSource = nil
    ClearSelection()
    cachedRunCount = -1
    dirty = true
  }

  /// Refreshes the cache for the current width and paints only visible lines.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    refreshCache(r.WidthCells)
    let lineCount = activeLineCount()

    if followEnd {
      FirstVisibleLine = clamp(lineCount, r.HeightRows)
    } else if preservePrepend {
      if wrapping == TextWrapping.None || prependWidth == cachedWidth {
        let addedLines = lineCount - prependLineCount
        if addedLines > 0 { FirstVisibleLine = prependFirstLine + addedLines }
      }
      preservePrepend = false
    }
    FirstVisibleLine = clamp(FirstVisibleLine, r.HeightRows)

    if wrapping == TextWrapping.None {
      paintUnwrappedLines(screen, r, ink)
      return
    }
    paintWrappedLines(screen, r, ink)
  }

  /// Returns the total number of active lines.
  /// @returns The total number of active lines.
  protected override func ScrollExtentRows() int32 -> activeLineCount()

  /// Returns FirstVisibleLine as the current scroll offset.
  /// @returns The index of the topmost visible line.
  protected override func ScrollOffsetRows() int32 -> FirstVisibleLine

  /// Handles keyboard and mouse-wheel scrolling. End follows the final line.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Release && HasMouseCapture {
      ReleaseMouseCapture()
      return EventResult.Handled
    }
    if inputIsRelease(ev) { return EventResult.Continue }
    if inputHasWindowModifier(ev.Modifiers) { return EventResult.Continue }
    if wrapping == TextWrapping.None && dirty {
      if lineSource != nil {
        dirty = false
      } else {
        rebuildUnwrapped()
      }
    }
    let bounds = ContentBounds
    if ev.Kind == UiEventKind.Key {
      if ev.Key == Key.Character && (int32(ev.Modifiers) & int32(KeyModifiers.Ctrl)) != 0 {
        if ev.Text == "c" { return result(CopySelection()) }
        if ev.Text == "a" {
          SelectAll()
          return EventResult.Handled
        }
      }
      if ev.Key == Key.Escape && marked {
        ClearSelection()
        return EventResult.Handled
      }
    }
    if ev.Kind == UiEventKind.Mouse && bounds.HeightRows > 0 {
      if ev.Mouse == MouseKind.Move && HasMouseCapture {
        if ev.Position.Row < bounds.Row { moveBy(-1, bounds.HeightRows) }
        if ev.Position.Row >= bounds.Row + bounds.HeightRows { moveBy(1, bounds.HeightRows) }
        if wrapping == TextWrapping.None {
          if ev.Position.Column < bounds.Column { moveHorizontalBy(-1, bounds.WidthCells - lineNumberGutterWidth()) }
          if ev.Position.Column >= bounds.Column + bounds.WidthCells {
            moveHorizontalBy(1, bounds.WidthCells - lineNumberGutterWidth())
          }
        }
        selectionEnd = positionAt(ev.Position, bounds)
        marked = !samePosition(anchor, selectionEnd)
        return EventResult.Handled
      }
      if ev.Mouse == MouseKind.Press && ev.Button == MouseButton.Left && bounds.Contains(ev.Position) {
        refreshCache(bounds.WidthCells)
        if !CaptureMouse() { return EventResult.Continue }
        anchor = positionAt(ev.Position, bounds)
        selectionEnd = anchor
        marked = false
        followEnd = false
        return EventResult.Handled
      }
    }
    if ev.Kind == UiEventKind.Key && wrapping == TextWrapping.None {
      let gutterWidth = lineNumberGutterWidth()
      var visibleContentWidth = bounds.WidthCells - gutterWidth
      if visibleContentWidth < 0 { visibleContentWidth = 0 }
      if ev.Key == Key.Left {
        moveHorizontalBy(-4, visibleContentWidth)
        return EventResult.Handled
      }
      if ev.Key == Key.Right {
        let source = lineSource
        if source != nil { maximumUnwrappedWidth = source.MaximumLineWidth() }
        moveHorizontalBy(4, visibleContentWidth)
        return EventResult.Handled
      }
    }
    if bounds.HeightRows <= 0 { return EventResult.Continue }

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down { return result(moveBy(1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up { return result(moveBy(-1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown { return result(moveBy(bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp { return result(moveBy(-bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home { return result(moveBy(-activeLineCount(), bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End {
      ScrollToEnd()
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && bounds.Contains(ev.Position) {
      if ev.Mouse == MouseKind.ScrollUp { return result(moveBy(-SharpTui.Selection.WheelStep, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(moveBy(SharpTui.Selection.WheelStep, bounds.HeightRows)) }
    }
    return EventResult.Continue
  }

  private func moveHorizontalBy(delta int32, visibleContentWidth int32) bool {
    var maximumOffset = maximumUnwrappedWidth - visibleContentWidth
    if maximumOffset < 0 { maximumOffset = 0 }
    var want = HorizontalCellOffset + delta
    if want < 0 { want = 0 }
    if want > maximumOffset { want = maximumOffset }
    if want == HorizontalCellOffset { return false }
    HorizontalCellOffset = want
    return true
  }

  private func moveBy(delta int32, height int32) bool {
    let want = clamp(FirstVisibleLine + delta, height)
    if want == FirstVisibleLine { return false }
    FirstVisibleLine = want
    followEnd = want == clamp(activeLineCount(), height)
    preservePrepend = false
    return true
  }

  private func clamp(s int32, height int32) int32 -> SharpTui.Selection.ClampScroll(activeLineCount(), s, height)

  private func activeLines() List[List[TextRun]] {
    if wrapping == TextWrapping.None {
      if dirty { rebuildUnwrapped() }
      return unwrappedLines
    }
    return cache
  }

  private func activeLineCount() int32 {
    let source = lineSource
    if wrapping == TextWrapping.None && source != nil { return source.Count() }
    return activeLines().Count
  }

  private func refreshCache(width int32) {
    if wrapping == TextWrapping.None {
      if lineSource != nil {
        dirty = false
      } else if dirty {
        rebuildUnwrapped()
      }
      return
    }
    if dirty || width != cachedWidth { rebuildWord(width) }
  }

  private func rebuildWord(width int32) {
    wrapper = RichRunWrapper(width)
    cache = wrapper.Lines
    unwrappedLines.Clear()
    states.Clear()
    canUndoTail = true
    cachedWidth = width
    cachedRunCount = -1
    cachedPrefixRunCount = 0
    cachedPrefixLineCount = 0
    dirty = false
    if width <= 0 { return }

    states.Add(wrapper.CaptureState())
    for run in runs {
      wrapper.Append(run)
      states.Add(wrapper.CaptureState())
    }
    cachedRunCount = runs.Count
    wrapper.AttachOpen()
  }

  private func rebuildUnwrapped() {
    unwrappedLines.Clear()
    cachedPrefixRunCount = 0
    cachedPrefixLineCount = 0
    maximumUnwrappedWidth = 0
    var line = List[TextRun]()
    var lineWidth = 0
    var runIndex = 0

    while runIndex < runs.Count {
      let run = runs[runIndex]
      let text = run.Text
      var start = 0
      var segmentHasNonAscii = false
      var i = 0
      while i < text.Length {
        if text[i] == '\n' {
          if i > start {
            let segment = text.Substring(start, i - start)
            var segmentWidth = i - start
            if segmentHasNonAscii { segmentWidth = Glyph.WidthOf(segment) }
            line.Add(TextRun(segment, run.Style, run.Hyperlink))
            lineWidth = lineWidth + segmentWidth
          }
          if lineWidth > maximumUnwrappedWidth { maximumUnwrappedWidth = lineWidth }
          unwrappedLines.Add(line)
          line = List[TextRun]()
          lineWidth = 0
          segmentHasNonAscii = false
          start = i + 1
        } else if text[i] >= '\u0080' {
          segmentHasNonAscii = true
        }
        i = i + 1
      }
      if start < text.Length {
        let segment = text.Substring(start)
        var segmentWidth = text.Length - start
        if segmentHasNonAscii { segmentWidth = Glyph.WidthOf(segment) }
        line.Add(TextRun(segment, run.Style, run.Hyperlink))
        lineWidth = lineWidth + segmentWidth
      }
      runIndex = runIndex + 1
    }
    if lineWidth > maximumUnwrappedWidth { maximumUnwrappedWidth = lineWidth }
    unwrappedLines.Add(line)
    cache = unwrappedLines
    cachedRunCount = runs.Count
    dirty = false

  }

  private func appendRuns(from int32) {
    wrapper.DetachOpen()
    var i = from
    while i < runs.Count {
      wrapper.Append(runs[i])
      states.Add(wrapper.CaptureState())
      i = i + 1
    }
    cachedRunCount = runs.Count
    wrapper.AttachOpen()
  }

  private func undoTail(count int32) {
    wrapper.DetachOpen()
    wrapper.RestoreState(states[count])
    truncateStates(count + 1)
    cachedRunCount = count
    wrapper.AttachOpen()
  }

  private func prependCached(added List[TextRun]) {
    let prefixWrapper = RichRunWrapper(cachedWidth)
    for run in added { prefixWrapper.Append(run) }
    let prefix = prefixWrapper.Complete()
    let lines = prefix.Count - 1

    var i = 0
    while i < added.Count {
      runs.Insert(i, added[i])
      i = i + 1
    }
    let physicalLines = prefixWrapper.Starts[prefix.Count - 1].LineIndex
    i = 0
    while i < wrapper.Starts.Count {
      let previous = wrapper.Starts[i]
      wrapper.Starts[i] = TextPosition{
        LineIndex: previous.LineIndex + physicalLines,
        GraphemeIndex: previous.GraphemeIndex,
      }
      i = i + 1
    }
    i = 0
    while i < lines {
      cache.Insert(i, prefix[i])
      wrapper.Starts.Insert(i, prefixWrapper.Starts[i])
      i = i + 1
    }
    cachedRunCount = cachedRunCount + added.Count
    cachedPrefixRunCount = cachedPrefixRunCount + added.Count
    cachedPrefixLineCount = cachedPrefixLineCount + lines
    canUndoTail = false
    if !followEnd { FirstVisibleLine = FirstVisibleLine + lines }
  }

  private func paintUnwrappedLines(screen Screen, r CellRect, ink Style) {
    let source = lineSource
    var lineCount = unwrappedLines.Count
    if source != nil { lineCount = source.Count() }
    let gutterWidth = lineNumberGutterWidth()
    let gutterInk = gutterStyle.MergedOver(ink)
    var visibleContentWidth = r.WidthCells - gutterWidth
    if visibleContentWidth < 0 { visibleContentWidth = 0 }
    var maximumOffset = maximumUnwrappedWidth - visibleContentWidth
    if maximumOffset < 0 { maximumOffset = 0 }
    if HorizontalCellOffset > maximumOffset { HorizontalCellOffset = maximumOffset }

    var row = 0
    var index = FirstVisibleLine
    while row < r.HeightRows && index < lineCount {
      var x = 0
      if gutterWidth > 0 {
        paintLineNumber(screen, r, row, index + 1, gutterWidth, gutterInk)
        x = gutterWidth
      }
      if source != nil {
        paintSourceLine(screen, r, row, x, source.ItemAt(index), ink)
      } else {
        paintSelectionLine(screen, r, row, x, unwrappedLines[index],
          TextPosition{ LineIndex: index, GraphemeIndex: 0 }, HorizontalCellOffset, ink)
      }
      row = row + 1
      index = index + 1
    }

    if source != nil {
      var stop = index + r.HeightRows
      if stop > lineCount { stop = lineCount }
      while index < stop {
        source.ItemAt(index)
        index = index + 1
      }
    }
  }

  private func paintSourceLine(screen Screen, r CellRect, row int32, startX int32, line RichTextLine, ink Style) {
    if line.WidthCells > maximumUnwrappedWidth {
      maximumUnwrappedWidth = line.WidthCells
    }
    paintSelectionLine(screen, r, row, startX, line.Runs,
      TextPosition{ LineIndex: FirstVisibleLine + row, GraphemeIndex: 0 },
      HorizontalCellOffset, ink)
  }


  private func paintWrappedLines(screen Screen, r CellRect, ink Style) {
    var index = FirstVisibleLine
    while index < cache.Count && index - FirstVisibleLine < r.HeightRows {
      paintSelectionLine(screen, r, index - FirstVisibleLine, 0, cache[index],
        wrapper.Starts[index], 0, ink)
      index = index + 1
    }
  }

  private func paintSelectionLine(screen Screen, r CellRect, row int32, startX int32,
      line IReadOnlyList[TextRun], start TextPosition, skip int32, ink Style) {
    var x = startX - skip
    var index = 0
    var runIndex = 0
    while runIndex < line.Count && x < r.WidthCells {
      let run = line[runIndex]
      for glyph in Glyph.Elements(run.Text) {
        if x >= r.WidthCells { return }
        let width = Glyph.Of(glyph)
        var style = run.Style.MergedOver(ink)
        let position = TextPosition{
          LineIndex: start.LineIndex, GraphemeIndex: start.GraphemeIndex + index,
        }
        if isSelected(position) { style = selectedTextStyle.MergedOver(style) }
        if x >= startX {
          screen.WriteClipped(r, x, row, TextRun(glyph, style, run.Hyperlink))
        } else if x + width > startX {
          screen.WriteClipped(r, startX, row, " ", style)
        }
        x = x + width
        index = index + 1
      }
      runIndex = runIndex + 1
    }
  }

  private func positionAt(point CellPoint, bounds CellRect) TextPosition {
    let count = activeLineCount()
    if count <= 0 { return TextPosition{ LineIndex: 0, GraphemeIndex: 0 } }
    var row = point.Row - bounds.Row
    if row < 0 { row = 0 }
    if row >= bounds.HeightRows { row = bounds.HeightRows - 1 }
    var index = FirstVisibleLine + row
    if index >= count { index = count - 1 }
    var start = TextPosition{ LineIndex: index, GraphemeIndex: 0 }
    var line IReadOnlyList[TextRun]
    var x = point.Column - bounds.Column
    if wrapping == TextWrapping.None {
      x = x - lineNumberGutterWidth()
      if x < 0 { x = 0 }
      x = x + HorizontalCellOffset
      if let source = lineSource { line = source.ItemAt(index).Runs }
      else { line = unwrappedLines[index] }
    } else {
      start = wrapper.Starts[index]
      line = cache[index]
    }
    var column = 0
    var grapheme = start.GraphemeIndex
    var runIndex = 0
    while runIndex < line.Count {
      for glyph in Glyph.Elements(line[runIndex].Text) {
        let width = Glyph.Of(glyph)
        if x < column + width {
          return TextPosition{ LineIndex: start.LineIndex, GraphemeIndex: grapheme }
        }
        column = column + width
        grapheme = grapheme + 1
      }
      runIndex = runIndex + 1
    }
    return TextPosition{ LineIndex: start.LineIndex, GraphemeIndex: grapheme }
  }

  private func before(a TextPosition, b TextPosition) bool ->
    a.LineIndex < b.LineIndex || (a.LineIndex == b.LineIndex && a.GraphemeIndex < b.GraphemeIndex)

  private func samePosition(a TextPosition, b TextPosition) bool ->
    a.LineIndex == b.LineIndex && a.GraphemeIndex == b.GraphemeIndex

  private func selectionStart() TextPosition -> before(anchor, selectionEnd) ? anchor : selectionEnd
  private func selectionStop() TextPosition -> before(anchor, selectionEnd) ? selectionEnd : anchor

  private func isSelected(position TextPosition) bool ->
    marked && !before(position, selectionStart()) && before(position, selectionStop())

  private func selectedText() string {
    if !marked { return "" }
    let text = StringBuilder()
    let start = selectionStart()
    let stop = selectionStop()
    if let source = lineSource {
      var row = start.LineIndex
      while row <= stop.LineIndex && row < source.Count() {
        if row > start.LineIndex { text.Append("\n") }
        var column = 0
        for run in source.ItemAt(row).Runs {
          for glyph in Glyph.Elements(run.Text) {
            if isSelected(TextPosition{ LineIndex: row, GraphemeIndex: column }) { text.Append(glyph) }
            column = column + 1
          }
        }
        row = row + 1
      }
    } else {
      var row = 0
      var column = 0
      for run in runs {
        for cluster in Glyph.Elements(run.Text) {
          let position = TextPosition{ LineIndex: row, GraphemeIndex: column }
          if isSelected(position) { text.Append(cluster) }
          if cluster == "\n" {
            row = row + 1
            column = 0
          } else { column = column + 1 }
        }
      }
    }
    return text.ToString()
  }
  private func lineNumberGutterWidth() int32 {
    if !showLineNumbers { return 0 }
    var count = activeLineCount()
    if count <= 0 { return 0 }
    var width = 2
    while count >= 10 {
      width = width + 1
      count = count / 10
    }
    return width
  }

  private func paintLineNumber(screen Screen, r CellRect, row int32, number int32,
      width int32, ink Style) {
    var column = 0
    while column < width {
      screen.WriteClipped(r, column, row, " ", ink)
      column = column + 1
    }
    var value = number
    column = width - 2
    while value > 0 && column >= 0 {
      screen.WriteClipped(r, column, row, digitText(value % 10), ink)
      value = value / 10
      column = column - 1
    }
  }

  private func digitText(value int32) string {
    if value == 0 { return "0" }
    if value == 1 { return "1" }
    if value == 2 { return "2" }
    if value == 3 { return "3" }
    if value == 4 { return "4" }
    if value == 5 { return "5" }
    if value == 6 { return "6" }
    if value == 7 { return "7" }
    if value == 8 { return "8" }
    return "9"
  }

  private func endsWithNewline(added List[TextRun]) bool {
    var i = added.Count - 1
    while i >= 0 {
      let text = added[i].Text
      if text.Length > 0 { return text[text.Length - 1] == '\n' }
      i = i - 1
    }
    return false
  }

  private func truncateStates(count int32) {
    while states.Count > count { states.RemoveAt(states.Count - 1) }
  }
}
