package SharpTui

import System
import System.Collections.Generic

/// A scrolling, keyboard- and mouse-navigable list of ListItem rows with a single selection.
public open class ListView : Box {
  private var items List[ListItem]
  private var selectedIndex int32
  private var selectedId string
  private var selectionChange SelectionChange?

  /// The rows shown by this list; setting it replaces all items and re-resolves the selection via RefreshItems.
  public prop Items List[ListItem] {
    get { return items }
    set {
      items = value
      RefreshItems()
    }
  }

  /// Index of the selected item. Setting it selects programmatically and does not emit a SelectionChange.
  public prop SelectedIndex int32 {
    get { return selectedIndex }
    set { setProgrammaticSelection(value) }
  }

  /// Index of the first item visible in the viewport.
  public prop FirstVisibleItemIndex int32 { get; set; }
  /// Marker text drawn before the selected row; unselected rows reserve the same width with blanks.
  public prop SelectionMarker string { get; set; }
  /// Style merged over the selected row's own style and the inherited style.
  public prop SelectedStyle Style { get; set; }

  /// The currently selected item, or nil when SelectedIndex is out of range or Items is empty.
  public prop SelectedItem ListItem? {
    get {
      if selectedIndex < 0 || selectedIndex >= Items.Count { return nil }
      return Items[selectedIndex]
    }
  }

  /// Id of the currently selected item, or empty when nothing is selected.
  public prop SelectedId string { get { return selectedId } }

  /// Creates an empty list with a "> " selection marker and CanFocus enabled.
  public init() {
    items = List[ListItem]()
    selectedIndex = 0
    selectedId = ""
    selectionChange = nil
    FirstVisibleItemIndex = 0
    SelectedStyle = Style()
    SelectionMarker = "> "
    CanFocus = true
    GrowWeight = 1
  }

  /// Appends a new item with the given text and returns it.
  /// @param text The text for the new item.
  /// @returns The newly appended item.
  public func Add(text string) ListItem {
    let item = ListItem{ Text: text }
    Items.Add(item)
    return item
  }

  /// Re-resolves the selection after Items is mutated directly; restores the item with the previous Id if one still exists and is selectable, otherwise falls back to the nearest selectable index.
  public func RefreshItems() {
    let previous = selectedIndex
    var restored = -1
    if selectedId != "" {
      var i = 0
      while i < Items.Count {
        if Items[i].Id == selectedId && Items[i].IsSelectable {
          restored = i
          break
        }
        i = i + 1
      }
    }
    if restored < 0 { restored = nearestSelectable(clampIndex(previous), directionFor(previous)) }
    if restored < 0 && Items.Count > 0 { restored = clampIndex(previous) }
    selectedIndex = restored < 0 ? 0 : restored
    selectedId = selectedIdAt(selectedIndex)
    selectionChange = nil
  }

  /// Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  /// @returns The pending selection change, or nil when none is pending.
  public func ConsumeSelectionChange() SelectionChange? {
    let pending = selectionChange
    selectionChange = nil
    return pending
  }

  /// Paints each visible item's selection marker and text, highlighting the selected row.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    normalizeSelection()
    FirstVisibleItemIndex = clampScroll(FirstVisibleItemIndex, r.HeightRows)
    let selectedStyle = SelectedStyle.MergedOver(ink)
    let markerWidth = Glyph.WidthOf(SelectionMarker)
    let visibleMarkerWidth = markerWidth < r.WidthCells ? markerWidth : r.WidthCells
    var i = FirstVisibleItemIndex
    while i < Items.Count {
      let row = i - FirstVisibleItemIndex
      if row >= r.HeightRows { break }
      let item = Items[i]
      let selected = i == SelectedIndex
      let itemStyle = item.Style.MergedOver(ink)
      let rowStyle = selected ? SelectedStyle.MergedOver(itemStyle) : itemStyle
      if markerWidth > 0 {
        if selected { screen.WriteClipped(r, 0, row, SelectionMarker, rowStyle) }
        else if visibleMarkerWidth > 0 {
          for x in 0 ... visibleMarkerWidth {
            screen.WriteCell(r.Column + x, r.Row + row, " ", rowStyle)
          }
        }
      }
      if item.Runs.Count == 0 {
        screen.WriteClipped(r, markerWidth, row, item.Text, rowStyle)
      } else {
        drawRuns(screen, r, markerWidth, row, item.Runs, rowStyle)
      }
      i = i + 1
    }
  }

  /// Returns the total number of items.
  /// @returns The item count.
  protected override func ScrollExtentRows() int32 {
    return Items.Count
  }

  /// Returns FirstVisibleItemIndex as the current scroll offset.
  /// @returns The topmost visible item index.
  protected override func ScrollOffsetRows() int32 {
    return FirstVisibleItemIndex
  }

  /// Handles keyboard navigation, mouse-wheel scrolling, and click-to-select within the content bounds.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    let bounds = ContentBounds
    if bounds.HeightRows <= 0 { return EventResult.Continue }

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up { return result(moveTo(selectedIndex - 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down { return result(moveTo(selectedIndex + 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp { return result(moveTo(selectedIndex - bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown { return result(moveTo(selectedIndex + bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home { return result(moveTo(0, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End { return result(moveTo(Items.Count - 1, bounds.HeightRows)) }

    if ev.Kind == UiEventKind.Mouse {
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      if ev.Mouse == MouseKind.ScrollUp { return result(scrollTo(FirstVisibleItemIndex - 3, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(scrollTo(FirstVisibleItemIndex + 3, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.Press { return result(selectAt(FirstVisibleItemIndex + (ev.Position.Row - bounds.Row), bounds.HeightRows)) }
    }
    return EventResult.Continue
  }

  private func moveTo(want int32, height int32) bool {
    if Items.Count == 0 { return false }
    let i = nearestSelectable(clampIndex(want), directionFor(want))
    if i < 0 || !setSelection(i, true) { return false }
    FirstVisibleItemIndex = Selection.ScrollIntoView(Items.Count, selectedIndex, FirstVisibleItemIndex, height)
    return true
  }

  private func selectAt(want int32, height int32) bool {
    if want < 0 || want >= Items.Count || !Items[want].IsSelectable { return false }
    if !setSelection(want, true) { return false }
    FirstVisibleItemIndex = Selection.ScrollIntoView(Items.Count, selectedIndex, FirstVisibleItemIndex, height)
    return true
  }

  private func scrollTo(want int32, height int32) bool {
    let s = clampScroll(want, height)
    if s == FirstVisibleItemIndex { return false }
    FirstVisibleItemIndex = s
    return true
  }

  private func clampIndex(i int32) int32 {
    return Selection.ClampIndex(Items.Count, i)
  }

  private func clampScroll(s int32, height int32) int32 {
    return Selection.ClampScroll(Items.Count, s, height)
  }

  private func setProgrammaticSelection(want int32) {
    if Items.Count == 0 {
      setSelection(0, false)
      return
    }
    let selected = nearestSelectable(clampIndex(want), directionFor(want))
    setSelection(selected < 0 ? clampIndex(want) : selected, false)
  }

  private func setSelection(value int32, emit bool) bool {
    if selectedIndex == value {
      if !emit { selectionChange = nil }
      return false
    }
    let previous = selectedIndex
    selectedIndex = value
    selectedId = selectedIdAt(value)
    selectionChange = emit ? SelectionChange(previous, value) : nil
    return true
  }

  private func normalizeSelection() {
    if Items.Count == 0 {
      if selectedIndex != 0 {
        selectedIndex = 0
        selectedId = ""
        selectionChange = nil
      }
      return
    }
    if selectedIndex < 0 || selectedIndex >= Items.Count {
      selectedIndex = clampIndex(selectedIndex)
      selectedId = selectedIdAt(selectedIndex)
      selectionChange = nil
    }
  }

  private func selectedIdAt(index int32) string {
    if index < 0 || index >= Items.Count { return "" }
    return Items[index].Id
  }

  private func directionFor(want int32) int32 {
    return Selection.DirectionFor(want, selectedIndex)
  }

  private func nearestSelectable(start int32, direction int32) int32 {
    var i = start
    while i >= 0 && i < Items.Count {
      if Items[i].IsSelectable { return i }
      i = i + direction
    }
    i = start - direction
    while i >= 0 && i < Items.Count {
      if Items[i].IsSelectable { return i }
      i = i - direction
    }
    return -1
  }

  private func drawRuns(screen Screen, r CellRect, x int32, row int32, runs List[TextRun], inherited Style) {
    var offset = x
    var i = 0
    while i < runs.Count && offset < r.WidthCells {
      let run = runs[i]
      screen.WriteClipped(r, offset, row, run.Text, run.Style.MergedOver(inherited))
      offset = offset + Glyph.WidthOf(run.Text)
      i = i + 1
    }
  }

}
