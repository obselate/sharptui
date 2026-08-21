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
  /// Horizontal alignment of the header text, independent of body cells.
  public prop HeaderAlignment HorizontalAlignment { get; set; }
  /// Horizontal alignment of text within this column's cells.
  public prop Alignment HorizontalAlignment { get; set; }

  /// Creates a column with an empty header, an equal share width, and left alignment.
  public init() {
    Header = ""
    ColumnWidth = ColumnWidth.Share(1)
    HeaderAlignment = HorizontalAlignment.Left
    Alignment = HorizontalAlignment.Left
  }
}

/// One table cell containing either plain text or styled text runs.
public struct TableCell {
  private var text string
  private var runs List[TextRun]?
  private var style Style

  /// Plain text drawn when Runs is nil or empty.
  public prop Text string {
    get { return text }
    init { text = value }
  }
  /// Styled text segments drawn instead of Text when the list is non-empty.
  public prop Runs List[TextRun]? {
    get { return runs }
    init { runs = value }
  }
  /// Style merged over the row style before this cell is drawn.
  public prop Style Style {
    get { return style }
    init { style = value }
  }

  /// Creates an empty plain-text cell inheriting its row's style.
  public init() {
    text = ""
    runs = nil
    style = Style()
  }

  /// Creates a plain-text cell inheriting its row's style.
  /// @param text The text displayed in the cell.
  public init(text string) {
    this.text = text
    runs = nil
    style = Style()
  }
}

/// One table row with stable identity, cells, style, and selection eligibility.
public class TableRow {
  /// Caller-supplied Id values must be unique for selection restoration across Rows replacement.
  public prop Id string { get; set; }
  /// Cells displayed in column order.
  public prop Cells List[TableCell] { get; set; }
  /// Style merged over the table's inherited style before cells are drawn.
  public prop Style Style { get; set; }
  /// When false, the row is skipped by keyboard and mouse selection but remains visible.
  public prop IsSelectable bool { get; set; }

  /// Creates a selectable row with a generated Id and no cells.
  public init() {
    Id = Guid.NewGuid().ToString("N")
    Cells = List[TableCell]()
    Style = Style()
    IsSelectable = true
  }
}


/// A scrolling table with a header row and selectable data rows.
public open class TableView : Box {
  private var columnGapCells int32
  private var columnSeparator string
  private var widthScratch List[int32]
  private var rows List[TableRow]
  private var source KeyedSource[TableRow, string]?
  private var selection SelectionState
  private var selectedRowId string
  private var selectedRowSelectable bool
  private var observedRowCount int32
  /// Column definitions in display order.
  public prop Columns List[TableColumn] { get; set; }
  /// Data rows shown by this table; setting it replaces all rows and preserves selection by stable Id when possible.
  public prop Rows List[TableRow] {
    get { return rows }
    set {
      source = nil
      rows = value
      Refresh()
    }
  }
  /// An optional indexed row source. When set, the source supplies rows instead of Rows.
  public prop Source KeyedSource[TableRow, string]? {
    get { return source }
    set {
      if Object.ReferenceEquals(source, value) { return }
      source = value
      Refresh()
    }
  }
  /// Index of the selected row. Setting it selects programmatically and does not emit a SelectionChange.
  public prop SelectedRowIndex int32 {
    get {
      reconcileSelection()
      return selection.Index
    }
    set { setProgrammaticSelection(value) }
  }
  /// Id of the selected row, or empty when no row is selected.
  public prop SelectedRowId string {
    get {
      reconcileSelection()
      return selectedRowId
    }
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
  /// Text drawn at the start of each inter-column gap; empty leaves the gap blank.
  public prop ColumnSeparator string {
    get { return columnSeparator }
    set { columnSeparator = value }
  }
  /// Style merged over the current header or row style for column separators.
  public prop ColumnSeparatorStyle Style { get; set; }
  /// Style applied to the header row.
  public prop HeaderStyle Style { get; set; }
  /// Style merged over the selected row's inherited style.
  public prop SelectedRowStyle Style { get; set; }

  /// Creates an empty table with a one-cell column gap and CanFocus enabled.
  public init() {
    columnGapCells = 1
    columnSeparator = ""
    widthScratch = List[int32]()
    Columns = List[TableColumn]()
    rows = List[TableRow]()
    source = nil
    selection = SelectionState()
    selectedRowId = ""
    selectedRowSelectable = false
    observedRowCount = 0
    FirstVisibleRowIndex = 0
    FirstVisibleColumnIndex = 0
    HeaderStyle = Style()
    SelectedRowStyle = Style()
    ColumnSeparatorStyle = Style()
    CanFocus = true
    GrowWeight = 1
  }

  /// Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedRowIndex does not produce one.
  /// @returns The pending SelectionChange, or nil when none is pending.
  public func ConsumeSelectionChange() SelectionChange? {
    reconcileSelection()
    return selection.Consume()
  }

  /// Forces selection reconciliation, including same-count eligibility changes away from the selected row. Identity, count, and selected-row eligibility reconcile automatically before observation, input, and rendering.
  public func Refresh() {
    reconcileSelection(true)
  }

  protected override func ScrollExtentRows() int32 {
    return rowCount() + 1
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
    reconcileSelection()
    if r.HeightRows <= 0 || Columns.Count == 0 { return }
    let height = r.HeightRows - 1
    FirstVisibleRowIndex = clampScroll(FirstVisibleRowIndex, height)

    let widths = columnWidths(r.WidthCells)
    let headerStyle = HeaderStyle.MergedOver(ink)
    drawHeader(screen, r, widths, headerStyle)

    let count = rowCount()
    var i = FirstVisibleRowIndex
    while i < count {
      let row = i - FirstVisibleRowIndex
      if row >= height { break }
      let selected = i == selection.Index
      let data = rowAt(i)
      var rowStyle = data.Style.MergedOver(ink)
      if selected { rowStyle = SelectedRowStyle.MergedOver(rowStyle) }
      drawRow(screen, r, row + 1, Columns.Count, widths, data.Cells, rowStyle)
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
    reconcileSelection()

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up { return result(moveTo(selection.Index - 1, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down { return result(moveTo(selection.Index + 1, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp { return result(moveTo(selection.Index - height, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown { return result(moveTo(selection.Index + height, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home { return result(moveTo(0, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End { return result(moveTo(rowCount() - 1, height)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Left { return result(panTo(FirstVisibleColumnIndex - 1, bounds.WidthCells)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Right { return result(panTo(FirstVisibleColumnIndex + 1, bounds.WidthCells)) }

    if ev.Kind == UiEventKind.Mouse {
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      if ev.Mouse == MouseKind.ScrollUp { return result(scrollTo(FirstVisibleRowIndex - Selection.WheelStep, height)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(scrollTo(FirstVisibleRowIndex + Selection.WheelStep, height)) }
      if ev.Mouse == MouseKind.Press {
        let hit = ev.Position.Row - bounds.Row
        if hit == 0 { return EventResult.Continue }
        let row = FirstVisibleRowIndex + hit - 1
        let count = rowCount()
        if row < 0 || row >= count { return EventResult.Continue }
        if !rowAt(row).IsSelectable { return EventResult.Continue }
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
      drawTextCell(screen, r, x, 0, widths[i], Columns[i].Header, Columns[i].HeaderAlignment, ink)
      x = x + widths[i]
      if i + 1 < Columns.Count {
        drawSeparator(screen, r, x, 0, ink)
        x = x + ColumnGapCells
      }
      if x >= r.WidthCells { break }
      i = i + 1
    }
  }

  private func drawRow(screen Screen, r CellRect, row int32, count int32, widths List[int32], cells List[TableCell], ink Style) {
    var x = 0
    var i = FirstVisibleColumnIndex
    while i < count {
      let w = widths[i]
      if i < cells.Count {
        drawTableCell(screen, r, x, row, w, cells[i], Columns[i].Alignment, ink)
      }
      x = x + w
      if i + 1 < count {
        drawSeparator(screen, r, x, row, ink)
        x = x + ColumnGapCells
      }
      if x >= r.WidthCells { break }
      i = i + 1
    }
  }

  private func drawTableCell(screen Screen, r CellRect, x int32, row int32, width int32,
    cell TableCell, alignment HorizontalAlignment, inherited Style) {
    let ink = cell.Style.MergedOver(inherited)
    guard let runs = cell.Runs else {
      drawTextCell(screen, r, x, row, width, cell.Text, alignment, ink)
      return
    }
    if runs.Count == 0 {
      drawTextCell(screen, r, x, row, width, cell.Text, alignment, ink)
      return
    }
    drawRunCell(screen, r, x, row, width, runs, alignment, ink)
  }

  private func drawTextCell(screen Screen, r CellRect, x int32, row int32, width int32,
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

  private func drawRunCell(screen Screen, r CellRect, x int32, row int32, width int32,
    runs List[TextRun], alignment HorizontalAlignment, ink Style) {
    if width <= 0 { return }
    let contentWidth = clippedRunsWidth(runs, width)
    var offset = 0
    if alignment == HorizontalAlignment.Center { offset = (width - contentWidth) / 2 }
    if alignment == HorizontalAlignment.Right { offset = width - contentWidth }
    let cellRect = CellRect{
      Column: r.Column + x,
      Row: r.Row + row,
      WidthCells: width,
      HeightRows: 1,
    }
    var i = 0
    while i < runs.Count && offset < width {
      let run = runs[i]
      let remaining = width - offset
      screen.WriteClipped(cellRect, offset, 0, run.Text, run.Style.MergedOver(ink))
      let runWidth = boundedWidth(run.Text, remaining)
      if runWidth >= remaining { return }
      offset = offset + runWidth
      i = i + 1
    }
  }

  private func drawSeparator(screen Screen, r CellRect, x int32, row int32, inherited Style) {
    if ColumnGapCells <= 0 || ColumnSeparator == "" || x >= r.WidthCells { return }
    var width = ColumnGapCells
    if x + width > r.WidthCells { width = r.WidthCells - x }
    screen.WriteClipped(CellRect{
      Column: r.Column + x,
      Row: r.Row + row,
      WidthCells: width,
      HeightRows: 1,
    }, 0, 0, ColumnSeparator, ColumnSeparatorStyle.MergedOver(inherited))
  }

  private func clippedRunsWidth(runs List[TextRun], width int32) int32 {
    var used = 0
    var i = 0
    while i < runs.Count && used < width {
      used = accumulateWidth(runs[i].Text, used, width)
      i = i + 1
    }
    return used
  }

  /// Adds text's glyph widths to used, saturating at width.
  private func accumulateWidth(text string, used int32, width int32) int32 {
    var total = used
    for cluster in Glyph.Elements(text) {
      let next = Glyph.Of(cluster)
      if total + next > width { return width }
      total = total + next
    }
    return total
  }

  private func boundedWidth(text string, width int32) int32 {
    return accumulateWidth(text, 0, width)
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
    let count = rowCount()
    if count == 0 { return false }
    let i = nearestSelectable(clampIndex(want), directionFor(want))
    if i < 0 { return false }
    if !setSelection(i, true) { return false }
    FirstVisibleRowIndex = Selection.ScrollIntoView(count, selection.Index, FirstVisibleRowIndex, height)
    return true
  }

  private func scrollTo(want int32, height int32) bool {
    let s = clampScroll(want, height)
    if s == FirstVisibleRowIndex { return false }
    FirstVisibleRowIndex = s
    return true
  }

  private func clampIndex(i int32) int32 {
    return Selection.ClampIndex(rowCount(), i)
  }

  private func clampScroll(s int32, height int32) int32 {
    return Selection.ClampScroll(rowCount(), s, height)
  }

  private func setSelection(value int32, emit bool) bool {
    let count = rowCount()
    let changed = selection.Set(value, emit)
    if value >= 0 && value < count {
      let row = rowAt(value)
      selectedRowId = row.Id
      selectedRowSelectable = row.IsSelectable
    } else {
      selectedRowId = ""
      selectedRowSelectable = false
    }
    observedRowCount = count
    return changed
  }

  private func reconcileSelection() {
    reconcileSelection(false)
  }

  private func reconcileSelection(force bool) {
    let count = rowCount()
    if count == 0 {
      if selection.Index != 0 || selectedRowId != "" || selectedRowSelectable {
        selection.Index = 0
        selectedRowId = ""
        selectedRowSelectable = false
        selection.Change = nil
      }
      observedRowCount = 0
      return
    }

    let previous = selection.Index
    let current = Selection.ClampIndex(count, previous)
    let currentRow = rowAt(current)
    if selectedRowId != "" && currentRow.Id == selectedRowId {
      if current != previous {
        selection.Index = current
        selection.Change = nil
      }
      if currentRow.IsSelectable {
        selectedRowSelectable = true
        observedRowCount = count
        return
      }
      if !force && !selectedRowSelectable && observedRowCount == count { return }
    }

    var restored = findSelectableById(selectedRowId, count)
    if restored < 0 { restored = nearestSelectable(current, directionFor(previous)) }
    if restored < 0 { restored = current }
    let restoredRow = rowAt(restored)
    selection.Index = restored
    selectedRowId = restoredRow.Id
    selectedRowSelectable = restoredRow.IsSelectable
    observedRowCount = count
    selection.Change = nil
  }

  private func setProgrammaticSelection(want int32) {
    reconcileSelection()
    if rowCount() == 0 {
      setSelection(0, false)
      return
    }
    let selected = nearestSelectable(clampIndex(want), directionFor(want))
    setSelection(selected < 0 ? clampIndex(want) : selected, false)
  }

  private func directionFor(want int32) int32 {
    return Selection.DirectionFor(want, selection.Index)
  }

  private func nearestSelectable(start int32, direction int32) int32 {
    let count = rowCount()
    var i = start
    while i >= 0 && i < count {
      if rowAt(i).IsSelectable { return i }
      i = i + direction
    }
    i = start - direction
    while i >= 0 && i < count {
      if rowAt(i).IsSelectable { return i }
      i = i - direction
    }
    return -1
  }

  private func rowCount() int32 {
    if source != nil { return source!!.Count() }
    return Rows.Count
  }

  private func rowAt(index int32) TableRow {
    if source != nil { return source!!.ItemAt(index) }
    return Rows[index]
  }

  private func findSelectableById(id string, count int32) int32 {
    if id == "" { return -1 }
    if source != nil {
      let candidate = source!!.IndexOfKey(id)
      if candidate >= 0 && candidate < count && rowAt(candidate).IsSelectable { return candidate }
      return -1
    }
    var i = 0
    while i < count {
      let row = rowAt(i)
      if row.Id == id && row.IsSelectable { return i }
      i = i + 1
    }
    return -1
  }

}
