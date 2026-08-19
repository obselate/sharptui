package SharpTui

import System
import System.Collections.Generic
import System.Text

private struct RichGlyph {
  public var Text string
  public var Style Style

  public init(text string, style Style) {
    Text = text
    Style = style
  }
}

private struct RichWrapState {
  public var CacheCount int32
  public var OpenCount int32
  public var OpenStart int32
  public var WordAt int32
  public var Used int32
  public var WordWidth int32
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

  internal init(width int32) {
    this.width = width
    lines = List[List[TextRun]]()
    pending = List[RichGlyph]()
    start = 0
    wordAt = 0
    used = 0
    wordWidth = 0
  }

  /// The packed lines committed so far, including any attached open (trailing, still-open) line.
  internal prop Lines List[List[TextRun]] { get { return lines } }

  internal func Append(run TextRun) {
    for cluster in Glyph.Elements(run.Text) { appendGlyph(cluster, run.Style) }
  }

  /// Packs and appends the still-open trailing line, then returns Lines.
  internal func Complete() List[List[TextRun]] {
    AttachOpen()
    return lines
  }

  /// Packs and appends the still-open trailing line as a line of its own.
  internal func AttachOpen() {
    lines.Add(pack(start, pending.Count))
  }

  /// Removes the trailing open line previously added by AttachOpen, so appending can resume.
  internal func DetachOpen() {
    if lines.Count > 0 { lines.RemoveAt(lines.Count - 1) }
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
    }
  }

  /// Truncates committed lines and pending glyphs back to a previously captured state.
  internal func RestoreState(state RichWrapState) {
    while lines.Count > state.CacheCount { lines.RemoveAt(lines.Count - 1) }
    while pending.Count > state.OpenCount { pending.RemoveAt(pending.Count - 1) }
    start = state.OpenStart
    wordAt = state.WordAt
    used = state.Used
    wordWidth = state.WordWidth
  }

  private func appendGlyph(text string, style Style) {
    if text == "\n" {
      commit(start, pending.Count)
      start = pending.Count
      wordAt = pending.Count
      used = 0
      wordWidth = 0
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

    pending.Add(RichGlyph(text, style))
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
  }

  private func pack(from int32, to int32) List[TextRun] {
    let line = List[TextRun]()
    var end = to
    while end > from && pending[end - 1].Text == " " { end = end - 1 }
    if end <= from { return line }

    var style = pending[from].Style
    let text = StringBuilder()
    var i = from
    while i < end {
      let glyph = pending[i]
      if !stylesEqual(style, glyph.Style) {
        line.Add(TextRun(text.ToString(), style))
        text.Clear()
        style = glyph.Style
      }
      text.Append(glyph.Text)
      i = i + 1
    }
    if text.Length > 0 { line.Add(TextRun(text.ToString(), style)) }
    return line
  }
}

/// Styled, wrapped text with an explicit line viewport.
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
  private var unwrappedRunWidths List[List[int32]]
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
  /// The styled runs to display. Setting it invalidates the display cache.
  /// Mutating the returned list in place does not invalidate the cache. Reassign Runs or use AppendRuns, PrependRuns, RemoveHeadRuns, RemoveTailRuns, or ClearRuns.
  public prop Runs List[TextRun] {
    get {
      return runs
    }
    set {
      runs = value
      lineSource = nil
      cachedRunCount = -1
      dirty = true
    }
  }

  /// An optional immutable physical-line source. Setting it selects unwrapped mode and clears Runs.
  public prop LineSource RichLineSource? {
    get { return lineSource }
    set {
      if Object.ReferenceEquals(lineSource, value) { return }
      lineSource = value
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
    get { return wrapping }
    set {
      if wrapping == value { return }
      wrapping = value
      if value != TextWrapping.None { lineSource = nil }
      cachedRunCount = -1
      dirty = true
  }
  }

  /// Whether unwrapped physical lines display a right-aligned line-number gutter.
  public prop ShowLineNumbers bool {
    get { return showLineNumbers }
    set {
      if showLineNumbers == value { return }
      showLineNumbers = value
  }
  }

  /// The style applied to the line-number gutter in unwrapped mode.
  public prop GutterStyle Style {
    get { return gutterStyle }
    set { gutterStyle = value }
  }

  /// The index of the topmost visible line. Negative values clamp to zero.
  public prop FirstVisibleLine int32 {
    get { return firstVisibleLine }
    private set { firstVisibleLine = value < 0 ? 0 : value }
  }

  /// The number of content cells skipped from the left edge in unwrapped mode.
  /// Negative values clamp to zero.
  public prop HorizontalCellOffset int32 {
    get { return horizontalCellOffset }
    set { horizontalCellOffset = value < 0 ? 0 : value }
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
    unwrappedRunWidths = List[List[int32]]()
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
    CanFocus = true
    GrowWeight = 1
  }

  /// Returns the number of active wrapped or physical lines.
  /// @returns The number of active lines.
  public func LineCount() int32 {
    return activeLineCount()
  }

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

    let oldCount = runs.Count
    let remove = count > oldCount ? oldCount : count
    if !dirty && cachedWidth > 0 && cachedPrefixRunCount > 0 && remove == cachedPrefixRunCount {
      var i = 0
      while i < remove {
        runs.RemoveAt(0)
        i = i + 1
      }
      i = 0
      while i < cachedPrefixLineCount {
        cache.RemoveAt(0)
        i = i + 1
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
    paintRunLines(screen, r, cache, FirstVisibleLine, 0, ink)
  }

  /// Returns the total number of active lines.
  /// @returns The total number of active lines.
  protected override func ScrollExtentRows() int32 {
    return activeLineCount()
  }

  /// Returns FirstVisibleLine as the current scroll offset.
  /// @returns The index of the topmost visible line.
  protected override func ScrollOffsetRows() int32 {
    return FirstVisibleLine
  }

  /// Handles keyboard and mouse-wheel scrolling. End follows the final line.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if wrapping == TextWrapping.None && dirty {
      if lineSource != nil {
        dirty = false
      } else {
        rebuildUnwrapped()
      }
    }
    let bounds = ContentBounds
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
      if ev.Mouse == MouseKind.ScrollUp { return result(moveBy(-Selection.WheelStep, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(moveBy(Selection.WheelStep, bounds.HeightRows)) }
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

  private func clamp(s int32, height int32) int32 {
    return Selection.ClampScroll(activeLineCount(), s, height)
  }

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
    unwrappedRunWidths.Clear()
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
    unwrappedRunWidths.Clear()
    cachedPrefixRunCount = 0
    cachedPrefixLineCount = 0
    maximumUnwrappedWidth = 0
    var line = List[TextRun]()
    var lineWidths = List[int32]()
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
            line.Add(TextRun(segment, run.Style))
            lineWidths.Add(segmentWidth)
            lineWidth = lineWidth + segmentWidth
          }
          if lineWidth > maximumUnwrappedWidth { maximumUnwrappedWidth = lineWidth }
          unwrappedLines.Add(line)
          unwrappedRunWidths.Add(lineWidths)
          line = List[TextRun]()
          lineWidths = List[int32]()
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
        line.Add(TextRun(segment, run.Style))
        lineWidths.Add(segmentWidth)
        lineWidth = lineWidth + segmentWidth
      }
      runIndex = runIndex + 1
    }
    if lineWidth > maximumUnwrappedWidth { maximumUnwrappedWidth = lineWidth }
    unwrappedLines.Add(line)
    unwrappedRunWidths.Add(lineWidths)
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
    i = 0
    while i < lines {
      cache.Insert(i, prefix[i])
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
        paintCachedLine(screen, r, row, x, unwrappedLines[index], unwrappedRunWidths[index], ink)
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
    var x = startX
    var skipCells = HorizontalCellOffset
    var runIndex = 0
    while runIndex < line.Runs.Count && x < r.WidthCells {
      let run = line.Runs[runIndex]
      let runWidth = line.RunWidth(runIndex)
      if skipCells >= runWidth {
        skipCells = skipCells - runWidth
        runIndex = runIndex + 1
        continue
      }
      screen.WriteClippedRange(r, x, row, run.Text, 0, -1, skipCells, run.Style.MergedOver(ink))
      x = x + runWidth - skipCells
      skipCells = 0
      runIndex = runIndex + 1
    }
  }

  private func paintCachedLine(screen Screen, r CellRect, row int32, startX int32,
      line List[TextRun], widths List[int32], ink Style) {
    var x = startX
    var skipCells = HorizontalCellOffset
    var runIndex = 0
    while runIndex < line.Count && x < r.WidthCells {
      let run = line[runIndex]
      let runWidth = widths[runIndex]
      if skipCells >= runWidth {
        skipCells = skipCells - runWidth
        runIndex = runIndex + 1
        continue
      }
      screen.WriteClippedRange(r, x, row, run.Text, 0, -1, skipCells, run.Style.MergedOver(ink))
      x = x + runWidth - skipCells
      skipCells = 0
      runIndex = runIndex + 1
    }
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
