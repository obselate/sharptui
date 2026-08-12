package SharpTui

import System
import System.Collections.Generic

/// A horizontal strip of titles; arrow keys or a click switch the active one.
public open class Tabs : Box {
  private var selection SelectionState
  private var titles List[string]
  private var titleStarts List[int32]

  /// Tab titles in display order; setting it replaces all titles and re-resolves the selection via RefreshTitles.
  public prop Titles List[string] {
    get { return titles }
    set {
      titles = value
      RefreshTitles()
    }
  }

  /// Index of the active tab. Setting it selects programmatically and does not emit a SelectionChange; the value must not be negative.
  public prop SelectedIndex int32 {
    get { return normalizedSelectedIndex() }
    set {
      if value < 0 { throw ArgumentOutOfRangeException("SelectedIndex") }
      selection.Set(value, false)
    }
  }

  /// Style merged over the active tab's inherited style.
  public prop SelectedStyle Style { get; set; }

  /// Creates an empty tab strip with a two-cell title gap and CanFocus enabled.
  public init() {
    titles = List[string]()
    titleStarts = List[int32]()
    selection = SelectionState()
    SelectedStyle = Style()
    GapCells = 2
    CanFocus = true
  }

  /// Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  /// @returns The pending SelectionChange, or nil when none is pending.
  public func ConsumeSelectionChange() SelectionChange? {
    return selection.Consume()
  }

  /// Refreshes selection after direct Titles mutation.
  public func RefreshTitles() {
    selection.Index = normalizedSelectedIndex()
    selection.Change = nil
  }

  /// Always true, so this tab strip sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the strip as the sum of all title widths plus GapCells between them.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    var width = 0
    for i in 0 ... Titles.Count {
      if i > 0 { width = width + GapCells }
      width = width + Glyph.WidthOf(Titles[i])
    }
    return CellSize{ WidthCells: width, HeightRows: 1 }
  }

  /// Paints each title at its scrolled position, highlighting the active tab with SelectedStyle.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 || Titles.Count == 0 { return }
    let lefts = starts()
    let off = offset(r, lefts)
    let selectedStyle = SelectedStyle.MergedOver(ink)

    for i in 0 ... Titles.Count {
      let x = lefts[i] - off
      screen.WriteClipped(r, x, 0, Titles[i], i == SelectedIndex ? selectedStyle : ink)
    }
  }

  /// Moves the active tab with Left and Right keys, or selects the tab clicked with the mouse.
  /// @param ev The input event to handle.
  /// @returns Handled when the event changed the selection, Continue otherwise.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Left { return result(moveTo(SelectedIndex - 1)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Right { return result(moveTo(SelectedIndex + 1)) }

    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press {
      let bounds = ContentBounds
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      let lefts = starts()
      let off = offset(bounds, lefts)
      let hit = ev.Position.Column - bounds.Column + off
      let i = titleAt(hit, lefts)
      if i < 0 { return EventResult.Continue }
      return result(moveTo(i))
    }
    return EventResult.Continue
  }

  private func moveTo(want int32) bool {
    if Titles.Count == 0 { return false }
    return selection.Set(Selection.ClampIndex(Titles.Count, want), true)
  }

  /// Left edge of each title, laid end to end with GapCells between.
  private func starts() List[int32] {
    titleStarts.Clear()
    var x = 0
    for t in Titles {
      titleStarts.Add(x)
      x = x + Glyph.WidthOf(t) + GapCells
    }
    return titleStarts
  }

  private func titleAt(x int32, lefts List[int32]) int32 {
    for i in 0 ... Titles.Count {
      let w = Glyph.WidthOf(Titles[i])
      if x >= lefts[i] && x < lefts[i] + w { return i }
    }
    return -1
  }

  /// Horizontal scroll so the active title stays fully on screen.
  private func offset(bounds CellRect, lefts List[int32]) int32 {
    if Titles.Count == 0 { return 0 }
    let lastW = Glyph.WidthOf(Titles[Titles.Count - 1])
    let total = lefts[lefts.Count - 1] + lastW
    var max = total - bounds.WidthCells
    if max < 0 { max = 0 }

    let activeStart = lefts[SelectedIndex]
    let activeW = Glyph.WidthOf(Titles[SelectedIndex])
    var off = 0
    if activeStart + activeW > bounds.WidthCells { off = activeStart + activeW - bounds.WidthCells }
    if activeStart < off { off = activeStart }
    if off > max { off = max }
    if off < 0 { off = 0 }
    return off
  }

  private func normalizedSelectedIndex() int32 {
    let normalized = Selection.ClampIndex(Titles.Count, selection.Index)
    if normalized != selection.Index {
      selection.Index = normalized
      selection.Change = nil
    }
    return selection.Index
  }


}

/// A one row bar with a left, centred, and right segment.
public open class StatusBar : Box {
  /// Text drawn at the left edge of the bar.
  public prop LeftText string { get; set; }
  /// Text drawn centered in the bar when there is room for it and the flanking text.
  public prop CenterText string { get; set; }
  /// Text drawn at the right edge of the bar when there is room.
  public prop RightText string { get; set; }

  /// Creates a bar with empty left, center, and right text.
  public init() {
    LeftText = ""
    CenterText = ""
    RightText = ""
  }

  /// Always true, so this bar sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the bar as the wider of the flanking text width and the width needed to center CenterText between them.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    let leftWidth = Glyph.WidthOf(LeftText)
    let middleWidth = Glyph.WidthOf(CenterText)
    let rightWidth = Glyph.WidthOf(RightText)
    var width = leftWidth + rightWidth
    let centeredLeft = leftWidth + leftWidth + middleWidth
    let centeredRight = rightWidth + rightWidth + middleWidth
    if centeredLeft > width { width = centeredLeft }
    if centeredRight > width { width = centeredRight }
    return CellSize{ WidthCells: width, HeightRows: 1 }
  }

  /// Paints LeftText at the left edge, RightText at the right edge when there is room, and CenterText centered in the space between.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 { return }
    let leftW = Glyph.WidthOf(LeftText)
    let rightW = Glyph.WidthOf(RightText)
    let rightX = r.WidthCells - rightW
    let showRight = rightX >= leftW

    screen.WriteClipped(r, 0, 0, LeftText, ink)
    if showRight { screen.WriteClipped(r, rightX, 0, RightText, ink) }

    let midW = Glyph.WidthOf(CenterText)
    let midX = (r.WidthCells - midW) / 2
    let bound = showRight ? rightX : r.WidthCells
    // Clip the centered notice into the free region instead of dropping it when
    // it is wider than the gap: WriteClipped truncates at the rect's right edge.
    let availL = leftW > midX ? leftW : midX
    if availL < bound {
      let clip = CellRect{ Column: r.Column + availL, Row: r.Row,
        WidthCells: bound - availL, HeightRows: r.HeightRows }
      screen.WriteClipped(clip, 0, 0, CenterText, ink)
    }
  }
}
