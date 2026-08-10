package SharpTui

import System
import System.Collections.Generic

/// A table column's fixed cell width or its weighted share of remaining space.
public struct ColumnWidth : IEquatable[ColumnWidth] {
  private var amount int32
  private var isCellWidth bool

  internal prop IsCellWidth bool { get { return isCellWidth } }
  internal prop CellCount int32 { get { return amount } }
  internal prop ShareWeight int32 { get { return amount > 0 ? amount : 1 } }

  /// Tests whether another width uses the same policy and amount.
  /// @param other The width to compare against.
  /// @returns True when other has the same policy and amount as this width.
  public func Equals(other ColumnWidth) bool {
    return amount == other.amount && isCellWidth == other.isCellWidth
  }

  shared {
    /// A column width fixed at count cells.
    /// @param count The fixed number of cells.
    /// @returns A column width using that fixed cell count.
    public func Cells(count int32) ColumnWidth {
      if count < 0 { throw ArgumentOutOfRangeException("count") }
      return ColumnWidth{ amount: count, isCellWidth: true }
    }

    /// A column width that takes weight parts of the space remaining after fixed-width columns and gutters.
    /// @param weight The share weight relative to other weighted columns.
    /// @returns A column width using that share weight.
    public func Share(weight int32) ColumnWidth {
      if weight <= 0 { throw ArgumentOutOfRangeException("weight") }
      return ColumnWidth{ amount: weight, isCellWidth: false }
    }
  }
}

/// Tests two column widths for equality.
/// @param left The first column width.
/// @param right The second column width.
/// @returns True when left and right have the same policy and amount.
public func (left ColumnWidth) operator ==(right ColumnWidth) bool {
  return left.Equals(right)
}

/// Tests two column widths for inequality.
/// @param left The first column width.
/// @param right The second column width.
/// @returns True when left and right differ in policy or amount.
public func (left ColumnWidth) operator !=(right ColumnWidth) bool {
  return !left.Equals(right)
}

/// A named table column, its width policy, and its text alignment.
public class TableColumn {
  /// Text drawn in the header row for this column.
  public prop Header string { get; set; }
  /// Width policy for this column, either a fixed cell count or a weighted share.
  public prop ColumnWidth ColumnWidth { get; set; }
  /// Horizontal alignment of text within this column's cells.
  public prop Alignment HorizontalAlignment { get; set; }

  /// Creates a column with an empty header, an equal share width, and left alignment.
  public init() {
    Header = ""
    ColumnWidth = ColumnWidth.Share(1)
    Alignment = HorizontalAlignment.Left
  }
}

/// A scrolling table with a header row and selectable data rows.
public open class TableView : Box {
  private var columnGapCells int32
  private var widthScratch List[int32]
  private var rows List[List[string]]
  private var selectedRowIndex int32
  private var selectionChange SelectionChange?

  /// Column definitions in display order.
  public prop Columns List[TableColumn] { get; set; }
  /// Data rows shown by this table; setting it replaces all rows and re-resolves the selection via RefreshRows.
  public prop Rows List[List[string]] {
    get { return rows }
    set {
      rows = value
      RefreshRows()
    }
  }
  /// Index of the selected row. Setting it selects programmatically and does not emit a SelectionChange.
  public prop SelectedRowIndex int32 {
    get { return selectedRowIndex }
    set { setSelection(clampIndex(value), false) }
  }
  /// Index of the first data row visible in the viewport.
  public prop FirstVisibleRowIndex int32 { get; set; }
  /// Index of the first visible column in the horizontal viewport.
  public prop FirstVisibleColumnIndex int32 { get; set; }
  /// Cells inserted between displayed columns.
  public prop ColumnGapCells int32 {
    get { return columnGapCells }
    set {
      if value < 0 { throw ArgumentOutOfRangeException("ColumnGapCells") }
      columnGapCells = value
    }
  }
  /// Style applied to the header row.
  public prop HeaderStyle Style { get; set; }
  /// Style merged over the selected row's inherited style.
  public prop SelectedRowStyle Style { get; set; }

  /// Creates an empty table with a one-cell column gap and CanFocus enabled.
  public init() {
    columnGapCells = 1
    widthScratch = List[int32]()
    Columns = List[TableColumn]()
    rows = List[List[string]]()
    selectedRowIndex = 0
    selectionChange = nil
    FirstVisibleRowIndex = 0
    FirstVisibleColumnIndex = 0
    HeaderStyle = Style()
    SelectedRowStyle = Style()
    CanFocus = true
    GrowWeight = 1
  }

  /// Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedRowIndex does not produce one.
  /// @returns The pending SelectionChange, or nil when none is pending.
  public func ConsumeSelectionChange() SelectionChange? {
    let pending = selectionChange
    selectionChange = nil
    return pending
  }

  /// Refreshes selection after direct Rows mutation.
  public func RefreshRows() {
    normalizeSelection()
    selectionChange = nil
  }

  /// Returns the row count including the header row.
  /// @returns Total content rows, header included.
  protected override func ScrollExtentRows() int32 {
    return Rows.Count + 1
  }

  /// Returns FirstVisibleRowIndex as the current scroll offset.
  /// @returns The index of the first visible row.
  protected override func ScrollOffsetRows() int32 {
    return FirstVisibleRowIndex
  }

  /// Paints the header row followed by the visible data rows, highlighting the selected row.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 || Columns.Count == 0 { return }
    let height = r.HeightRows - 1
    normalizeSelection()
    FirstVisibleRowIndex = clampScroll(FirstVisibleRowIndex, height)

    let widths = columnWidths(r.WidthCells)
    let headerStyle = resolvedStyle(HeaderStyle, ink)
    let selectedStyle = resolvedStyle(SelectedRowStyle, ink)

    drawHeader(screen, r, widths, headerStyle)

    var i = FirstVisibleRowIndex
    while i < Rows.Count {
      let row = i - FirstVisibleRowIndex
      if row >= height { break }
      let selected = i == selectedRowIndex
      drawRow(screen, r, row + 1, Columns.Count, widths, Rows[i], selected ? selectedStyle : ink)
      i = i + 1
    }
  }

  /// Moves or scrolls the selected row from keyboard and mouse input, and pans the visible columns.
  /// @param ev The input event to handle.
  /// @returns Handled when the event changed the selection or scroll position, Continue otherwise.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    let bounds = ContentBounds
    let height = bounds.HeightRows - 1
    if height <= 0 { return EventResult.Continue }
    normalizeSelection()

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up { return result(moveTo(selectedRowIndex - 1, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down { return result(moveTo(selectedRowIndex + 1, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp { return result(moveTo(selectedRowIndex - height, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown { return result(moveTo(selectedRowIndex + height, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home { return result(moveTo(0, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End { return result(moveTo(Rows.Count - 1, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Left { return result(panTo(FirstVisibleColumnIndex - 1, bounds.WidthCells)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Right { return result(panTo(FirstVisibleColumnIndex + 1, bounds.WidthCells)) }

    if ev.Kind == UiEventKind.Mouse {
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      if ev.Mouse == MouseKind.ScrollUp { return result(scrollTo(FirstVisibleRowIndex - 3, height)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(scrollTo(FirstVisibleRowIndex + 3, height)) }
      if ev.Mouse == MouseKind.Press {
        let hit = ev.Position.Row - bounds.Row
        if hit == 0 { return EventResult.Continue }
        let row = FirstVisibleRowIndex + hit - 1
        if row < 0 || row >= Rows.Count { return EventResult.Continue }
        return result(moveTo(row, height))
      }
    }
    return EventResult.Continue
  }

  private func columnWidths(total int32) List[int32] {
    widthScratch.Clear()
    var fixedTotal = 0
    var totalWeight = 0
    var i = 0
    while i < Columns.Count {
      let c = Columns[i]
      if c.ColumnWidth.IsCellWidth {
        fixedTotal = fixedTotal + c.ColumnWidth.CellCount
      } else {
        totalWeight = totalWeight + c.ColumnWidth.ShareWeight
      }
      i = i + 1
    }
    let gutters = ColumnGapCells * (Columns.Count - 1)
    var remaining = total - fixedTotal - gutters
    if remaining < 0 { remaining = 0 }

    var allocated = 0
    i = 0
    while i < Columns.Count {
      let c = Columns[i]
      if c.ColumnWidth.IsCellWidth {
        widthScratch.Add(c.ColumnWidth.CellCount)
      } else {
        let width = totalWeight > 0 ? remaining * c.ColumnWidth.ShareWeight / totalWeight : 0
        widthScratch.Add(width)
        allocated = allocated + width
      }
      i = i + 1
    }

    var extra = remaining - allocated
    i = 0
    while extra > 0 && i < Columns.Count {
      if !Columns[i].ColumnWidth.IsCellWidth {
        widthScratch[i] = widthScratch[i] + 1
        extra = extra - 1
      }
      i = i + 1
    }
    return widthScratch
  }

  private func drawHeader(screen Screen, r CellRect, widths List[int32], ink Style) {
    var x = 0
    var i = FirstVisibleColumnIndex
    while i < Columns.Count {
      drawCell(screen, r, x, 0, widths[i], Columns[i].Header, Columns[i].Alignment, ink)
      x = x + widths[i] + ColumnGapCells
      if x >= r.WidthCells { break }
      i = i + 1
    }
  }

  private func drawRow(screen Screen, r CellRect, row int32, count int32, widths List[int32], cells List[string], ink Style) {
    var x = 0
    var i = FirstVisibleColumnIndex
    while i < count {
      let w = widths[i]
      let cell = i < cells.Count ? cells[i] : ""
      drawCell(screen, r, x, row, w, cell, Columns[i].Alignment, ink)
      x = x + w + ColumnGapCells
      if x >= r.WidthCells { break }
      i = i + 1
    }
  }

  private func drawCell(screen Screen, r CellRect, x int32, row int32, width int32,
    text string, alignment HorizontalAlignment, ink Style) {
    if width <= 0 { return }
    var dx = x
    if alignment != HorizontalAlignment.Left {
      let textWidth = clippedWidth(text, width)
      if alignment == HorizontalAlignment.Center { dx = x + (width - textWidth) / 2 }
      if alignment == HorizontalAlignment.Right { dx = x + width - textWidth }
    }
    screen.WriteClipped(CellRect{
      Column: r.Column + x,
      Row: r.Row + row,
      WidthCells: width,
      HeightRows: 1,
    }, dx - x, 0, text, ink)
  }

  private func clippedWidth(text string, width int32) int32 {
    var used = 0
    for cluster in Glyph.Elements(text) {
      let next = Glyph.Of(cluster)
      if used + next > width { break }
      used = used + next
    }
    return used
  }

  private func panTo(want int32, total int32) bool {
    var fixedTotal = ColumnGapCells * (Columns.Count - 1)
    var column = 0
    while column < Columns.Count {
      let c = Columns[column]
      if c.ColumnWidth.IsCellWidth { fixedTotal = fixedTotal + c.ColumnWidth.CellCount }
      column = column + 1
    }
    if fixedTotal <= total { return false }

    var i = want
    if i < 0 { i = 0 }
    if i >= Columns.Count { i = Columns.Count - 1 }
    if i == FirstVisibleColumnIndex { return false }
    FirstVisibleColumnIndex = i
    return true
  }

  private func moveTo(want int32, height int32) bool {
    if Rows.Count == 0 { return false }
    let i = clampIndex(want)
    if !setSelection(i, true) { return false }
    if selectedRowIndex < FirstVisibleRowIndex { FirstVisibleRowIndex = selectedRowIndex }
    if selectedRowIndex >= FirstVisibleRowIndex + height {
      FirstVisibleRowIndex = selectedRowIndex - height + 1
    }
    FirstVisibleRowIndex = clampScroll(FirstVisibleRowIndex, height)
    return true
  }

  private func scrollTo(want int32, height int32) bool {
    let s = clampScroll(want, height)
    if s == FirstVisibleRowIndex { return false }
    FirstVisibleRowIndex = s
    return true
  }

  private func clampIndex(i int32) int32 {
    if Rows.Count == 0 { return 0 }
    if i < 0 { return 0 }
    if i >= Rows.Count { return Rows.Count - 1 }
    return i
  }

  private func clampScroll(s int32, height int32) int32 {
    var max = Rows.Count - height
    if max < 0 { max = 0 }
    if s > max { return max }
    if s < 0 { return 0 }
    return s
  }

  private func setSelection(value int32, emit bool) bool {
    if selectedRowIndex == value {
      if !emit { selectionChange = nil }
      return false
    }
    let previous = selectedRowIndex
    selectedRowIndex = value
    selectionChange = emit ? SelectionChange(previous, value) : nil
    return true
  }

  private func normalizeSelection() {
    let normalized = clampIndex(selectedRowIndex)
    if normalized == selectedRowIndex { return }
    selectedRowIndex = normalized
    selectionChange = nil
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
