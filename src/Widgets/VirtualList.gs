package SharpTui

import System
import System.Collections.Generic

/// State passed to a VirtualListSource while it renders one item.
@Flags
public enum VirtualListItemState {
  None = 0;
  Selected = 1;
  Focused = 2;
}

/// Supplies stable, variable-height items to a VirtualListView.
public interface VirtualListSource {
  /// Returns the number of items.
  /// @returns The item count.
  func Count() int32;

  /// Returns the stable key for an item.
  /// @param index The zero-based item index.
  /// @returns The stable item key.
  func KeyAt(index int32) string;

  /// Returns the current index for a stable key, or negative one when absent.
  /// @param key The stable key to find.
  /// @returns The item index, or negative one.
  func IndexOfKey(key string) int32;

  /// Reports whether an item can be selected.
  /// @param index The zero-based item index.
  /// @returns True when keyboard and mouse selection may stop on the item.
  func IsSelectable(index int32) bool;

  /// Measures an item's positive height for the current viewport width.
  /// @param index The zero-based item index.
  /// @param width The available width in cells.
  /// @returns The item height in rows. Must be positive.
  func HeightAt(index int32, width int32) int32;

  /// Renders one visible item.
  /// @param index The zero-based item index.
  /// @param screen The target screen.
  /// @param bounds The full item bounds, which can extend beyond clipBounds.
  /// @param clipBounds The visible intersection of the item and viewport.
  /// @param style The resolved inherited and selected style.
  /// @param state The item's selection and focus state.
  func Render(index int32, screen Screen, bounds CellRect, clipBounds CellRect,
    style Style, state VirtualListItemState);
}

/// A virtualized, variable-height list with stable selection, row scrolling, and mouse hit testing.
public open class VirtualListView : Box {
  private var source VirtualListSource?
  private var selection SelectionState
  private var selectedKey string
  private var selectedSelectable bool
  private var observedCount int32
  private var offsets List[int32]
  private var measuredWidth int32
  private var metricsDirty bool

  /// The source that measures and renders items.
  public prop Source VirtualListSource? {
    get -> source
    set {
      if Object.ReferenceEquals(source, value) { return }
      source = value
      Refresh()
    }
  }

  /// Index of the selected item. Programmatic changes do not emit SelectionChange.
  public prop SelectedIndex int32 {
    get {
      reconcileSelection(false)
      return selection.Index
    }
    set -> setProgrammaticSelection(value)
  }

  /// Stable key of the selected item, or empty when the source is empty.
  public prop SelectedKey string {
    get {
      reconcileSelection(false)
      return selectedKey
    }
  }

  /// First visible content row measured from the start of the source.
  public prop FirstVisibleRowOffset int32 { get; set; }

  /// When true, rendering selects the last selectable item and pins the viewport to the end.
  public prop FollowTail bool { get; set; }

  /// Style merged over the item style when the item is selected.
  public prop SelectedStyle Style { get; set; }

  /// Creates an empty focusable list that grows to available space.
  public init() {
    source = nil
    selection = SelectionState()
    selectedKey = ""
    selectedSelectable = false
    observedCount = 0
    offsets = List[int32]()
    measuredWidth = -1
    metricsDirty = true
    FirstVisibleRowOffset = 0
    FollowTail = false
    SelectedStyle = Style()
    CanFocus = true
    GrowWeight = 1
  }

  /// Invalidates cached heights and reconciles source selection state.
  public func Refresh() {
    metricsDirty = true
    reconcileSelection(true)
  }

  /// Returns and clears the pending user selection change.
  /// @returns The pending change, or nil.
  public func ConsumeSelectionChange() SelectionChange? {
    reconcileSelection(false)
    return selection.Consume()
  }

  protected override func Render(screen Screen, bounds CellRect, ink Style) {
    ensureMetrics(bounds.WidthCells)
    reconcileSelection(false)
    if FollowTail { snapToTail(bounds.HeightRows) }
    let extent = extentRows()
    FirstVisibleRowOffset = Viewport.ClampOffset(extent, FirstVisibleRowOffset, bounds.HeightRows)
    if source == nil || bounds.WidthCells <= 0 || bounds.HeightRows <= 0 || extent == 0 { return }

    let count = source!!.Count()
    let bottom = bounds.Row + bounds.HeightRows
    var index = itemAtOffset(FirstVisibleRowOffset)
    while index < count {
      let top = bounds.Row + offsets[index] - FirstVisibleRowOffset
      if top >= bottom { break }
      let height = offsets[index + 1] - offsets[index]
      let itemBounds = CellRect{
        Column: bounds.Column,
        Row: top,
        WidthCells: bounds.WidthCells,
        HeightRows: height,
      }
      let clipTop = top < bounds.Row ? bounds.Row : top
      let itemBottom = top + height
      let clipBottom = itemBottom < bottom ? itemBottom : bottom
      if clipBottom > clipTop {
        let selected = index == selection.Index
        let itemStyle = selected ? SelectedStyle.MergedOver(ink) : ink
        var state = selected ? VirtualListItemState.Selected : VirtualListItemState.None
        if selected && IsFocused {
          state = VirtualListItemState(int32(state) | int32(VirtualListItemState.Focused))
        }
        source!!.Render(index, screen, itemBounds, CellRect{
          Column: bounds.Column,
          Row: clipTop,
          WidthCells: bounds.WidthCells,
          HeightRows: clipBottom - clipTop,
        }, itemStyle, state)
      }
      index = index + 1
    }
  }

  protected override func ScrollExtentRows() int32 -> extentRows()

  protected override func ScrollOffsetRows() int32 -> FirstVisibleRowOffset

  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if inputHasWindowModifier(ev.Modifiers) { return EventResult.Continue }
    let bounds = ContentBounds
    if bounds.WidthCells <= 0 || bounds.HeightRows <= 0 { return EventResult.Continue }
    ensureMetrics(bounds.WidthCells)
    reconcileSelection(false)

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up {
      FollowTail = false
      return result(moveItem(-1, bounds.HeightRows))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down {
      return result(moveItem(1, bounds.HeightRows))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp {
      FollowTail = false
      return result(movePage(-1, bounds.HeightRows))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown {
      return result(movePage(1, bounds.HeightRows))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home {
      FollowTail = false
      return result(moveTo(0, 1, bounds.HeightRows))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End {
      return result(moveTo(itemCount() - 1, -1, bounds.HeightRows))
    }

    if ev.Kind == UiEventKind.Mouse {
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      if ev.Mouse == MouseKind.ScrollUp {
        FollowTail = false
        return result(scrollTo(FirstVisibleRowOffset - Selection.WheelStep, bounds.HeightRows))
      }
      if ev.Mouse == MouseKind.ScrollDown {
        return result(scrollTo(FirstVisibleRowOffset + Selection.WheelStep, bounds.HeightRows))
      }
      if ev.Mouse == MouseKind.Press {
        FollowTail = false
        let row = FirstVisibleRowOffset + ev.Position.Row - bounds.Row
        return result(selectAtRow(row, bounds.HeightRows))
      }
    }
    return EventResult.Continue
  }

  private func ensureMetrics(width int32) {
    let count = itemCount()
    if !metricsDirty && measuredWidth == width && offsets.Count == count + 1 { return }
    offsets.Clear()
    offsets.Add(0)
    if source != nil {
      var total = 0
      var index = 0
      while index < count {
        let height = source!!.HeightAt(index, width)
        if height <= 0 { throw InvalidOperationException("VirtualListSource.HeightAt must return a positive height.") }
        total = checked(total + height)
        offsets.Add(total)
        index = index + 1
      }
    }
    measuredWidth = width
    metricsDirty = false
  }

  private func extentRows() int32 {
    if offsets.Count == 0 { return 0 }
    return offsets[offsets.Count - 1]
  }

  private func itemAtOffset(row int32) int32 {
    let count = itemCount()
    if count == 0 { return 0 }
    let target = Viewport.ClampIndex(extentRows(), row)
    var low = 0
    var high = count
    while low < high {
      let middle = low + (high - low) / 2
      if offsets[middle + 1] <= target { low = middle + 1 }
      else { high = middle }
    }
    return low
  }

  private func snapToTail(height int32) {
    let count = itemCount()
    if count == 0 { return }
    let last = nearestSelectable(count - 1, -1)
    if last >= 0 { setSelection(last, false) }
    FirstVisibleRowOffset = Viewport.ClampOffset(extentRows(), extentRows(), height)
  }

  private func moveItem(direction int32, height int32) bool {
    return moveTo(selection.Index + direction, direction, height)
  }

  private func movePage(direction int32, height int32) bool {
    let count = itemCount()
    if count == 0 { return false }
    let current = Viewport.ClampIndex(count, selection.Index)
    let row = offsets[current] + direction * height
    let target = itemAtOffset(Viewport.ClampIndex(extentRows(), row))
    return moveTo(target, direction, height)
  }

  private func moveTo(want int32, direction int32, height int32) bool {
    let count = itemCount()
    if count == 0 { return false }
    let index = nearestSelectable(Viewport.ClampIndex(count, want), direction)
    if index < 0 || !setSelection(index, true) { return false }
    reveal(index, height)
    return true
  }

  private func selectAtRow(row int32, height int32) bool {
    let count = itemCount()
    if count == 0 || row < 0 || row >= extentRows() { return false }
    let index = itemAtOffset(row)
    if !source!!.IsSelectable(index) || !setSelection(index, true) { return false }
    reveal(index, height)
    return true
  }

  private func scrollTo(offset int32, height int32) bool {
    let next = Viewport.ClampOffset(extentRows(), offset, height)
    if next == FirstVisibleRowOffset { return false }
    FirstVisibleRowOffset = next
    return true
  }

  private func reveal(index int32, height int32) {
    FirstVisibleRowOffset = Viewport.BringRangeIntoView(extentRows(), offsets[index],
      offsets[index + 1] - offsets[index], FirstVisibleRowOffset, height)
  }

  private func setProgrammaticSelection(want int32) {
    reconcileSelection(false)
    let count = itemCount()
    if count == 0 {
      setSelection(0, false)
      return
    }
    let direction = want < selection.Index ? -1 : 1
    let index = nearestSelectable(Viewport.ClampIndex(count, want), direction)
    setSelection(index < 0 ? Viewport.ClampIndex(count, want) : index, false)
  }

  private func setSelection(value int32, emit bool) bool {
    let changed = selection.Set(value, emit)
    let count = itemCount()
    if source != nil && value >= 0 && value < count {
      selectedKey = source!!.KeyAt(value)
      selectedSelectable = source!!.IsSelectable(value)
    } else {
      selectedKey = ""
      selectedSelectable = false
    }
    observedCount = count
    return changed
  }

  private func reconcileSelection(force bool) {
    let count = itemCount()
    if count == 0 {
      if selection.Index != 0 || selectedKey != "" || selectedSelectable {
        selection.Index = 0
        selectedKey = ""
        selectedSelectable = false
        selection.Change = nil
      }
      observedCount = 0
      return
    }
    guard let active = source else { return }

    let previous = selection.Index
    let current = Viewport.ClampIndex(count, previous)
    if selectedKey != "" && active.KeyAt(current) == selectedKey {
      if current != previous {
        selection.Index = current
        selection.Change = nil
      }
      if active.IsSelectable(current) {
        selectedSelectable = true
        observedCount = count
        return
      }
      if !force && !selectedSelectable && observedCount == count { return }
    }

    var restored = selectedKey == "" ? -1 : active.IndexOfKey(selectedKey)
    if restored < 0 || restored >= count || !active.IsSelectable(restored) {
      restored = nearestSelectable(current, previous < current ? -1 : 1)
    }
    if restored < 0 { restored = current }
    selection.Index = restored
    selectedKey = active.KeyAt(restored)
    selectedSelectable = active.IsSelectable(restored)
    observedCount = count
    selection.Change = nil
  }

  private func nearestSelectable(start int32, direction int32) int32 {
    let count = itemCount()
    if source == nil || count == 0 { return -1 }
    var index = start
    while index >= 0 && index < count {
      if source!!.IsSelectable(index) { return index }
      index = index + direction
    }
    index = start - direction
    while index >= 0 && index < count {
      if source!!.IsSelectable(index) { return index }
      index = index - direction
    }
    return -1
  }

  private func itemCount() int32 -> source == nil ? 0 : source!!.Count()
}
