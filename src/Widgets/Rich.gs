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

  internal func Append(run TextRun) {
    for cluster in Glyph.Elements(run.Text) { appendGlyph(cluster, run.Style) }
  }

  internal func Complete() List[List[TextRun]] {
    lines.Add(pack(start, pending.Count))
    return lines
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
      if !richSameStyle(style, glyph.Style) {
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

private func richSameStyle(a Style, b Style) bool {
  return a.Foreground == b.Foreground && a.Background == b.Background && a.Attributes == b.Attributes
}

/// Styled, wrapped text with an explicit line viewport.
public open class RichTextBlock : Box {
  private var runs List[TextRun]
  private var firstVisibleLine int32

  private var cache List[List[TextRun]]
  private var cachedRuns List[TextRun]
  private var cachedWidth int32
  private var dirty bool
  private var pending List[RichGlyph]
  private var openStart int32
  private var wordAt int32
  private var used int32
  private var wordWidth int32
  private var states List[RichWrapState]
  private var frontRuns List[TextRun]
  private var frontLineCount int32
  private var canUndoTail bool
  private var followEnd bool
  private var preservePrepend bool
  private var prependLineCount int32
  private var prependFirstLine int32
  private var prependWidth int32

  /// The styled runs to display. Setting it invalidates the wrap cache; prefer PrependRuns for incremental prepends.
  public prop Runs List[TextRun] {
    get {
      return runs
    }
    set {
      runs = value
      dirty = true
    }
  }

  /// The index of the topmost visible wrapped line. Negative values clamp to zero.
  public prop FirstVisibleLine int32 {
    get { return firstVisibleLine }
    private set { firstVisibleLine = value < 0 ? 0 : value }
  }

  /// Creates an empty, focusable rich text block.
  public init() {
    runs = List[TextRun]()
    firstVisibleLine = 0
    cache = List[List[TextRun]]()
    cachedRuns = List[TextRun]()
    cachedWidth = -1
    dirty = true
    pending = List[RichGlyph]()
    openStart = 0
    wordAt = 0
    used = 0
    wordWidth = 0
    states = List[RichWrapState]()
    frontRuns = List[TextRun]()
    frontLineCount = 0
    canUndoTail = true
    followEnd = false
    preservePrepend = false
    prependLineCount = 0
    prependFirstLine = 0
    prependWidth = -1
    CanFocus = true
    GrowWeight = 1
  }

  /// Wrapped line count at the last painted width.
  /// @returns The number of wrapped lines.
  public func LineCount() int32 {
    return cache.Count
  }

  /// Scrolls so that the given wrapped line index becomes the topmost visible line, and stops following the end or a pending prepend.
  /// @param line The wrapped line index to scroll to.
  public func ScrollToLine(line int32) {
    followEnd = false
    preservePrepend = false
    FirstVisibleLine = line
  }

  /// Keeps the viewport pinned to the final wrapped line across later updates.
  public func ScrollToEnd() {
    followEnd = true
    preservePrepend = false
  }

  /// Inserts runs before the current content and keeps the same old line visible.
  /// @param added The runs to insert before the current content.
  public func PrependRuns(added List[TextRun]) {
    if added.Count == 0 { return }
    if Object.ReferenceEquals(added, runs) {
      throw ArgumentException("added must not be Runs", "added")
    }

    if !dirty && cachedWidth > 0 && !runsChanged() && endsWithNewline(added) {
      prependCached(added)
      return
    }

    if !followEnd && !preservePrepend && cachedWidth >= 0 {
      preservePrepend = true
      prependLineCount = cache.Count
      prependFirstLine = FirstVisibleLine
      prependWidth = cachedWidth
    }

    var i = 0
    while i < added.Count {
      runs.Insert(i, added[i])
      i = i + 1
    }
    dirty = true
  }

  /// Refreshes the wrap cache for the current width, applies any pending ScrollToEnd or PrependRuns follow behavior, and paints the visible lines.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    refreshCache(r.WidthCells)

    if followEnd {
      FirstVisibleLine = clamp(cache.Count, r.HeightRows)
    } else if preservePrepend {
      if prependWidth == cachedWidth {
        let addedLines = cache.Count - prependLineCount
        if addedLines > 0 { FirstVisibleLine = prependFirstLine + addedLines }
      }
      preservePrepend = false
    }
    FirstVisibleLine = clamp(FirstVisibleLine, r.HeightRows)

    var i = FirstVisibleLine
    while i < cache.Count {
      let row = i - FirstVisibleLine
      if row >= r.HeightRows { break }
      var x = 0
      let line = cache[i]
      var part = 0
      while part < line.Count {
        let run = line[part]
        let style = Style{
          Foreground: run.Style.Foreground.IsInherited ? ink.Foreground : run.Style.Foreground,
          Background: run.Style.Background.IsInherited ? ink.Background : run.Style.Background,
          Attributes: TextAttributes(int32(ink.Attributes) | int32(run.Style.Attributes)),
        }
        screen.WriteClipped(r, x, row, run.Text, style)
        x = x + Glyph.WidthOf(run.Text)
        part = part + 1
      }
      i = i + 1
    }
  }

  /// Returns the total number of wrapped lines.
  /// @returns The total number of wrapped lines.
  protected override func ScrollExtentRows() int32 {
    return cache.Count
  }

  /// Returns FirstVisibleLine as the current scroll offset.
  /// @returns The index of the topmost visible wrapped line.
  protected override func ScrollOffsetRows() int32 {
    return FirstVisibleLine
  }

  /// Handles keyboard and mouse-wheel scrolling; End switches to following the final line via ScrollToEnd.
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
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End {
      ScrollToEnd()
      return EventResult.Handled
    }
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
    followEnd = want == clamp(cache.Count, height)
    preservePrepend = false
    return true
  }

  private func clamp(s int32, height int32) int32 {
    var max = cache.Count - height
    if max < 0 { max = 0 }
    if s > max { return max }
    if s < 0 { return 0 }
    return s
  }

  private func runsChanged() bool {
    if runs.Count != cachedRuns.Count { return true }
    for i in 0 ... runs.Count {
      if !sameRun(runs[i], cachedRuns[i]) { return true }
    }
    return false
  }

  private func refreshCache(width int32) {
    if dirty || width != cachedWidth {
      rebuildCache(width)
      return
    }
    if !runsChanged() { return }

    if canDropFront() {
      dropFront()
      return
    }
    if canUndoTail && frontRuns.Count == 0 && isPrefix(runs.Count) && runs.Count < cachedRuns.Count {
      undoTail(runs.Count)
      return
    }
    if isPrefix(cachedRuns.Count) && runs.Count > cachedRuns.Count {
      appendRuns(cachedRuns.Count)
      return
    }
    rebuildCache(width)
  }

  private func rebuildCache(width int32) {
    cache.Clear()
    cachedRuns.Clear()
    states.Clear()
    frontRuns.Clear()
    frontLineCount = 0
    canUndoTail = true
    pending.Clear()
    openStart = 0
    wordAt = 0
    used = 0
    wordWidth = 0
    cachedWidth = width
    dirty = false
    if width <= 0 { return }

    states.Add(captureState())
    for run in runs {
      appendRun(run, width)
      cachedRuns.Add(run)
      states.Add(captureState())
    }
    attachOpen()
  }

  private func appendRuns(from int32) {
    detachOpen()
    var i = from
    while i < runs.Count {
      appendRun(runs[i], cachedWidth)
      cachedRuns.Add(runs[i])
      if canUndoTail && frontRuns.Count == 0 { states.Add(captureState()) }
      i = i + 1
    }
    attachOpen()
  }

  private func undoTail(count int32) {
    detachOpen()
    let state = states[count]
    truncateCache(state.CacheCount)
    truncateGlyphs(state.OpenCount)
    openStart = state.OpenStart
    wordAt = state.WordAt
    used = state.Used
    wordWidth = state.WordWidth
    truncateRuns(count)
    truncateStates(count + 1)
    attachOpen()
  }

  private func prependCached(added List[TextRun]) {
    let wrapper = RichRunWrapper(cachedWidth)
    for run in added { wrapper.Append(run) }
    let prefix = wrapper.Complete()
    let lines = prefix.Count - 1
    var i = 0
    while i < added.Count {
      runs.Insert(i, added[i])
      cachedRuns.Insert(i, added[i])
      frontRuns.Insert(i, added[i])
      i = i + 1
    }
    i = 0
    while i < lines {
      cache.Insert(i, prefix[i])
      i = i + 1
    }
    frontLineCount = frontLineCount + lines
    canUndoTail = false
    if !followEnd { FirstVisibleLine = FirstVisibleLine + lines }
  }

  private func canDropFront() bool {
    if frontRuns.Count == 0 || runs.Count + frontRuns.Count != cachedRuns.Count { return false }
    var i = 0
    while i < frontRuns.Count {
      if !sameRun(frontRuns[i], cachedRuns[i]) { return false }
      i = i + 1
    }
    i = 0
    while i < runs.Count {
      if !sameRun(runs[i], cachedRuns[i + frontRuns.Count]) { return false }
      i = i + 1
    }
    return true
  }

  private func dropFront() {
    var i = 0
    while i < frontLineCount {
      cache.RemoveAt(0)
      i = i + 1
    }
    i = 0
    while i < frontRuns.Count {
      cachedRuns.RemoveAt(0)
      i = i + 1
    }
    frontRuns.Clear()
    frontLineCount = 0
    canUndoTail = true
  }

  private func appendRun(run TextRun, width int32) {
    for cluster in Glyph.Elements(run.Text) {
      appendGlyph(cluster, run.Style, width)
    }
  }

  private func appendGlyph(text string, style Style, width int32) {
    if text == "\n" {
      commit(openStart, pending.Count)
      openStart = pending.Count
      wordAt = pending.Count
      used = 0
      wordWidth = 0
      return
    }

    let glyphWidth = Glyph.Of(text)
    if text != " " {
      if wordWidth + glyphWidth > width {
        commit(openStart, pending.Count)
        openStart = pending.Count
        wordAt = pending.Count
        used = 0
        wordWidth = 0
      }
      if used + wordWidth + glyphWidth > width {
        commit(openStart, wordAt)
        openStart = wordAt
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
    cache.Add(packOpen(from, to))
  }

  private func attachOpen() {
    cache.Add(packOpen(openStart, pending.Count))
  }

  private func detachOpen() {
    if cache.Count > 0 { cache.RemoveAt(cache.Count - 1) }
  }

  private func packOpen(from int32, to int32) List[TextRun] {
    let line = List[TextRun]()
    var end = to
    while end > from && pending[end - 1].Text == " " { end = end - 1 }
    if end <= from { return line }

    var style = pending[from].Style
    let text = StringBuilder()
    var i = from
    while i < end {
      let glyph = pending[i]
      if !sameStyle(style, glyph.Style) {
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

  private func captureState() RichWrapState {
    return RichWrapState{
      CacheCount: cache.Count,
      OpenCount: pending.Count,
      OpenStart: openStart,
      WordAt: wordAt,
      Used: used,
      WordWidth: wordWidth,
    }
  }

  private func isPrefix(count int32) bool {
    if count > cachedRuns.Count || count > runs.Count { return false }
    var i = 0
    while i < count {
      if !sameRun(runs[i], cachedRuns[i]) { return false }
      i = i + 1
    }
    return true
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

  private func sameRun(a TextRun, b TextRun) bool {
    return a.Text == b.Text && sameStyle(a.Style, b.Style)
  }

  private func sameStyle(a Style, b Style) bool {
    return richSameStyle(a, b)
  }

  private func truncateCache(count int32) {
    while cache.Count > count { cache.RemoveAt(cache.Count - 1) }
  }

  private func truncateGlyphs(count int32) {
    while pending.Count > count { pending.RemoveAt(pending.Count - 1) }
  }

  private func truncateRuns(count int32) {
    while cachedRuns.Count > count { cachedRuns.RemoveAt(cachedRuns.Count - 1) }
  }

  private func truncateStates(count int32) {
    while states.Count > count { states.RemoveAt(states.Count - 1) }
  }

  private func result(handled bool) EventResult {
    return handled ? EventResult.Handled : EventResult.Continue
  }
}
