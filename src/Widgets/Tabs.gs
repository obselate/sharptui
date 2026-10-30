package SharpTui

import System
import System.Collections.Generic

/// A horizontal strip of titles; arrow keys or a click switch the active one.
public open class Tabs : Box {
  private var selection SelectionState

  /// Receives each user selection change after navigation completes. Programmatic selection is silent.
  public prop OnChange Action[SelectionChange]? {
    get -> selection.OnChange
    set -> selection.OnChange = value
  }
  private var titles List[string]
  private var titleStarts List[int32]

  /// Tab titles in display order; setting it replaces all titles and re-resolves the selection via Refresh.
  public prop Titles List[string] {
    get -> titles
    set {
      titles = value
      Refresh()
    }
  }

  /// Index of the active tab. Setting it selects programmatically and does not emit a SelectionChange; the value must not be negative.
  public prop SelectedIndex int32 {
    get -> normalizedSelectedIndex()
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
    Gap = 2
    CanFocus = true
  }


  /// Re-resolves selection after direct Titles mutation.
  public func Refresh() {
    selection.Index = normalizedSelectedIndex()
    selection.Change = nil
  }

  /// Always true, so this tab strip sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool -> true

  /// Measures the strip as the sum of all title widths plus Gap between them.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    var width = 0
    for i in 0 ... Titles.Count {
      if i > 0 { width = width + Gap }
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
    let outcome = acceptSelection(ev)
    selection.Notify()
    return outcome
  }

  private func acceptSelection(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if inputHasWindowModifier(ev.Modifiers) { return EventResult.Continue }
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

  /// Left edge of each title, laid end to end with Gap between.
  private func starts() List[int32] {
    titleStarts.Clear()
    var x = 0
    for t in Titles {
      titleStarts.Add(x)
      x = x + Glyph.WidthOf(t) + Gap
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
  /// Styled content drawn at the left edge. When non-empty, this takes precedence over LeftText.
  public prop LeftRuns List[TextRun] { get; set; }
  /// Styled content drawn in the center. When non-empty, this takes precedence over CenterText.
  public prop CenterRuns List[TextRun] { get; set; }
  /// Styled content drawn at the right edge. When non-empty, this takes precedence over RightText.
  public prop RightRuns List[TextRun] { get; set; }

  /// Creates a bar with empty left, center, and right text.
  public init() {
    LeftText = ""
    CenterText = ""
    RightText = ""
    LeftRuns = List[TextRun]()
    CenterRuns = List[TextRun]()
    RightRuns = List[TextRun]()
  }

  /// Always true, so this bar sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool -> true

  /// Measures the bar as the wider of the flanking text width and the width needed to center CenterText between them.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    let leftWidth = segmentWidth(LeftText, LeftRuns)
    let middleWidth = segmentWidth(CenterText, CenterRuns)
    let rightWidth = segmentWidth(RightText, RightRuns)
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
    let leftW = segmentWidth(LeftText, LeftRuns)
    let rightW = segmentWidth(RightText, RightRuns)
    let rightX = r.WidthCells - rightW
    let showRight = rightX >= leftW

    drawSegment(screen, r, 0, LeftText, LeftRuns, ink)
    if showRight { drawSegment(screen, r, rightX, RightText, RightRuns, ink) }

    let midW = segmentWidth(CenterText, CenterRuns)
    let midX = (r.WidthCells - midW) / 2
    let bound = showRight ? rightX : r.WidthCells
    // Clip the centered notice into the free region instead of dropping it when
    // it is wider than the gap: WriteClipped truncates at the rect's right edge.
    let availL = leftW > midX ? leftW : midX
    if availL < bound {
      let clip = CellRect{ Column: r.Column + availL, Row: r.Row,
        WidthCells: bound - availL, HeightRows: r.HeightRows }
      drawSegment(screen, clip, midX - availL, CenterText, CenterRuns, ink)
    }
  }

  private func segmentWidth(text string, runs List[TextRun]) int32 {
    if runs.Count == 0 { return Glyph.WidthOf(text) }
    var width = 0
    for run in runs { width = width + Glyph.WidthOf(run.Text) }
    return width
  }

  private func drawSegment(screen Screen, bounds CellRect, x int32, text string, runs List[TextRun], ink Style) {
    if runs.Count == 0 {
      screen.WriteClipped(bounds, x, 0, text, ink)
      return
    }
    var offset = x
    for run in runs {
      screen.WriteClipped(bounds, offset, 0,
        TextRun(run.Text, run.Style.MergedOver(ink), run.Hyperlink))
      offset = offset + Glyph.WidthOf(run.Text)
    }
  }
}
