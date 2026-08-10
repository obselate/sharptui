package SharpTui

import System
import System.Collections.Generic

/// How wrapped content breaks lines: None leaves lines unbroken except at explicit newlines, Word wraps at word boundaries within the available width.
public enum TextWrapping { None, Word }

/// A block of wrapped text with an explicit line viewport.
public open class TextBlock : Box {
  private var text string
  private var wrapping TextWrapping
  private var firstVisibleLine int32

  private var cache List[string]
  private var cachedFor string
  private var cachedWidth int32

  /// The text content rendered by this block. Setting it invalidates the wrap cache.
  public prop Text string {
    get { return text }
    set {
      text = value
      cachedWidth = -1
    }
  }

  /// The wrapping mode applied to Text. Setting it invalidates the wrap cache.
  public prop Wrapping TextWrapping {
    get { return wrapping }
    set {
      wrapping = value
      cachedWidth = -1
    }
  }

  /// The index of the topmost visible wrapped line. Negative values clamp to zero.
  public prop FirstVisibleLine int32 {
    get { return firstVisibleLine }
    private set { firstVisibleLine = value < 0 ? 0 : value }
  }

  /// Creates an empty, focusable text block with word wrapping enabled.
  public init() {
    text = ""
    wrapping = TextWrapping.Word
    firstVisibleLine = 0
    CanFocus = true
    cache = List[string]()
    cachedFor = ""
    cachedWidth = -1
    GrowWeight = 1
  }

  /// TextBlock always sizes itself via MeasureIntrinsic rather than Width and Height.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the block by wrapping Text to the available width and returning the widest line and the line count.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured content size in cells and rows.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    var width = 1000000
    if Wrapping == TextWrapping.Word && availableWidth != nil { width = availableWidth!! }
    if width <= 0 { return CellSize{} }

    let lines = Wrapping == TextWrapping.Word ? CellText.Wrap(Text, width) : CellText.Wrap(Text, 1000000)
    var measuredWidth = 0
    for line in lines {
      let lineWidth = Glyph.WidthOf(line)
      if lineWidth > measuredWidth { measuredWidth = lineWidth }
    }
    return CellSize{ WidthCells: measuredWidth, HeightRows: lines.Count }
  }

  /// Scrolls so that the given wrapped line index becomes the topmost visible line.
  /// @param line The wrapped line index to scroll to.
  public func ScrollToLine(line int32) {
    FirstVisibleLine = line
  }

  /// Paints the visible slice of wrapped lines starting at FirstVisibleLine, clipped to r.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    let lines = wrapped(r.WidthCells)
    FirstVisibleLine = clamp(FirstVisibleLine, lines.Count, r.HeightRows)
    var i = FirstVisibleLine
    while i < lines.Count {
      let row = i - FirstVisibleLine
      if row >= r.HeightRows { break }
      screen.WriteClipped(r, 0, row, lines[i], ink)
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

  /// Scrolls the viewport on mouse wheel events within the content bounds.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    let bounds = ContentBounds
    if bounds.HeightRows <= 0 { return EventResult.Continue }
    if ev.Kind == UiEventKind.Mouse && bounds.Contains(ev.Position) {
      if ev.Mouse == MouseKind.ScrollUp { return result(scrollBy(-3, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(scrollBy(3, bounds.HeightRows)) }
    }
    return EventResult.Continue
  }

  private func wrapped(width int32) List[string] {
    if width == cachedWidth && Text == cachedFor { return cache }
    cache = Wrapping == TextWrapping.Word ? CellText.Wrap(Text, width) : CellText.Wrap(Text, 1000000)
    cachedFor = Text
    cachedWidth = width
    return cache
  }

  private func scrollBy(delta int32, height int32) bool {
    let want = clamp(FirstVisibleLine + delta, cache.Count, height)
    if want == FirstVisibleLine { return false }
    FirstVisibleLine = want
    return true
  }

  private func clamp(s int32, count int32, height int32) int32 {
    var max = count - height
    if max < 0 { max = 0 }
    if s > max { return max }
    if s < 0 { return 0 }
    return s
  }

  private func result(handled bool) EventResult {
    return handled ? EventResult.Handled : EventResult.Continue
  }
}
