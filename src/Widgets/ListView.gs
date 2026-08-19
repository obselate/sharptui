package SharpTui

import System
import System.Collections.Generic


/// A scrolling, keyboard- and mouse-navigable list of ListItem rows with a single selection.
public open class ListView : Box {
  private var items List[ListItem]
  private var source KeyedSource[ListItem, string]?
  private var selection SelectionState
  private var selectedId string

  /// The rows shown by this list; setting it replaces all items and re-resolves the selection via Refresh.
  public prop Items List[ListItem] {
    get { return items }
    set {
      source = nil
      items = value
      Refresh()
    }
  }

  /// An optional indexed item source. When set, the source supplies rows instead of Items.
  public prop Source KeyedSource[ListItem, string]? {
    get { return source }
    set {
      if Object.ReferenceEquals(source, value) { return }
      source = value
      Refresh()
    }
  }

  /// Index of the selected item. Setting it selects programmatically and does not emit a SelectionChange.
  public prop SelectedIndex int32 {
    get { return selection.Index }
    set { setProgrammaticSelection(value) }
  }

  /// Index of the first item visible in the viewport.
  public prop FirstVisibleItemIndex int32 { get; set; }
  /// When true the list pins to its tail: every render selects the last
  /// selectable item and scrolls the viewport to the end, so appended items
  /// are always in view. Navigating or scrolling away from the tail (Up,
  /// PageUp, Home, wheel-up, or a click) turns it off; it never re-engages
  /// on its own.
  public prop FollowTail bool { get; set; }
  /// Marker text drawn before the selected row; unselected rows reserve the same width with blanks.
  public prop SelectionMarker string { get; set; }
  /// Style merged over the selected row's own style and the inherited style.
  public prop SelectedStyle Style { get; set; }

  /// The currently selected item, or nil when SelectedIndex is out of range or the active source is empty.
  public prop SelectedItem ListItem? {
    get {
      if selection.Index < 0 || selection.Index >= itemCount() { return nil }
      return itemAt(selection.Index)
    }
  }
  /// Id of the currently selected item, or empty when nothing is selected.
  public prop SelectedId string { get { return selectedId } }

  /// Creates an empty list with a "> " selection marker and CanFocus enabled.
  public init() {
    items = List[ListItem]()
    source = nil
    selection = SelectionState()
    selectedId = ""
    FirstVisibleItemIndex = 0
    FollowTail = false
    SelectedStyle = Style()
    SelectionMarker = "> "
    CanFocus = true
    GrowWeight = 1
  }

  /// Appends a new item with the given text and returns it.
  /// @param text The text for the new item.
  /// @returns The newly appended item.
  public func Add(text string) ListItem {
    source = nil
    let item = ListItem{ Text: text }
    Items.Add(item)
    return item
  }

  /// Re-resolves selection after direct mutation of the active Items or Source data, restoring the previous Id when possible.
  public func Refresh() {
    refreshSelection()
  }

  /// Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  /// @returns The pending selection change, or nil when none is pending.
  public func ConsumeSelectionChange() SelectionChange? {
    return selection.Consume()
  }

  /// Paints each visible item's selection marker and text, highlighting the selected row.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    normalizeSelection()
    if FollowTail { snapToTail() }
    FirstVisibleItemIndex = clampScroll(FirstVisibleItemIndex, r.HeightRows)
    let selectedStyle = SelectedStyle.MergedOver(ink)
    let markerWidth = Glyph.WidthOf(SelectionMarker)
    let visibleMarkerWidth = markerWidth < r.WidthCells ? markerWidth : r.WidthCells
    let count = itemCount()
    var i = FirstVisibleItemIndex
    while i < count {
      let row = i - FirstVisibleItemIndex
      if row >= r.HeightRows { break }
      let item = itemAt(i)
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

  protected override func ScrollExtentRows() int32 {
    return itemCount()
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

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up {
      FollowTail = false
      return result(moveTo(selection.Index - 1, bounds.HeightRows))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down { return result(moveTo(selection.Index + 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp {
      FollowTail = false
      return result(moveTo(selection.Index - bounds.HeightRows, bounds.HeightRows))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown { return result(moveTo(selection.Index + bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home {
      FollowTail = false
      return result(moveTo(0, bounds.HeightRows))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End { return result(moveTo(itemCount() - 1, bounds.HeightRows)) }

    if ev.Kind == UiEventKind.Mouse {
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      if ev.Mouse == MouseKind.ScrollUp {
        FollowTail = false
        return result(scrollTo(FirstVisibleItemIndex - Selection.WheelStep, bounds.HeightRows))
      }
      if ev.Mouse == MouseKind.ScrollDown { return result(scrollTo(FirstVisibleItemIndex + Selection.WheelStep, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.Press {
        FollowTail = false
        return result(selectAt(FirstVisibleItemIndex + (ev.Position.Row - bounds.Row), bounds.HeightRows))
      }
    }
    return EventResult.Continue
  }

  private func snapToTail() {
    let count = itemCount()
    if count == 0 { return }
    let last = nearestSelectable(count - 1, -1)
    if last >= 0 { setSelection(last, false) }
    FirstVisibleItemIndex = count
  }

  private func moveTo(want int32, height int32) bool {
    let count = itemCount()
    if count == 0 { return false }
    let i = nearestSelectable(clampIndex(want), directionFor(want))
    if i < 0 || !setSelection(i, true) { return false }
    FirstVisibleItemIndex = Selection.ScrollIntoView(count, selection.Index, FirstVisibleItemIndex, height)
    return true
  }

  private func selectAt(want int32, height int32) bool {
    let count = itemCount()
    if want < 0 || want >= count || !itemAt(want).IsSelectable { return false }
    if !setSelection(want, true) { return false }
    FirstVisibleItemIndex = Selection.ScrollIntoView(count, selection.Index, FirstVisibleItemIndex, height)
    return true
  }

  private func scrollTo(want int32, height int32) bool {
    let s = clampScroll(want, height)
    if s == FirstVisibleItemIndex { return false }
    FirstVisibleItemIndex = s
    return true
  }

  private func clampIndex(i int32) int32 {
    return Selection.ClampIndex(itemCount(), i)
  }

  private func clampScroll(s int32, height int32) int32 {
    return Selection.ClampScroll(itemCount(), s, height)
  }

  private func setProgrammaticSelection(want int32) {
    let count = itemCount()
    if count == 0 {
      setSelection(0, false)
      return
    }
    let selected = nearestSelectable(clampIndex(want), directionFor(want))
    setSelection(selected < 0 ? clampIndex(want) : selected, false)
  }

  private func setSelection(value int32, emit bool) bool {
    if !selection.Set(value, emit) { return false }
    selectedId = selectedIdAt(value)
    return true
  }

  private func normalizeSelection() {
    let count = itemCount()
    if count == 0 {
      if selection.Index != 0 {
        selection.Index = 0
        selectedId = ""
        selection.Change = nil
      }
      return
    }
    if selection.Index < 0 || selection.Index >= count {
      selection.Index = clampIndex(selection.Index)
      selectedId = selectedIdAt(selection.Index)
      selection.Change = nil
    }
  }

  private func selectedIdAt(index int32) string {
    if index < 0 || index >= itemCount() { return "" }
    return itemAt(index).Id
  }

  private func directionFor(want int32) int32 {
    return Selection.DirectionFor(want, selection.Index)
  }

  private func nearestSelectable(start int32, direction int32) int32 {
    let count = itemCount()
    var i = start
    while i >= 0 && i < count {
      if itemAt(i).IsSelectable { return i }
      i = i + direction
    }
    i = start - direction
    while i >= 0 && i < count {
      if itemAt(i).IsSelectable { return i }
      i = i - direction
    }
    return -1
  }

  private func itemCount() int32 {
    if source != nil { return source!!.Count() }
    return Items.Count
  }

  private func itemAt(index int32) ListItem {
    if source != nil { return source!!.ItemAt(index) }
    return Items[index]
  }

  private func refreshSelection() {
    let previous = selection.Index
    let count = itemCount()
    var restored = -1
    if selectedId != "" {
      if source != nil {
        let candidate = source!!.IndexOfKey(selectedId)
        if candidate >= 0 && candidate < count && itemAt(candidate).IsSelectable {
          restored = candidate
        }
      } else {
        var i = 0
        while i < count {
          let item = itemAt(i)
          if item.Id == selectedId && item.IsSelectable {
            restored = i
            break
          }
          i = i + 1
        }
      }
    }
    if restored < 0 { restored = nearestSelectable(clampIndex(previous), directionFor(previous)) }
    if restored < 0 && count > 0 { restored = clampIndex(previous) }
    selection.Index = restored < 0 ? 0 : restored
    selectedId = selectedIdAt(selection.Index)
    selection.Change = nil
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
