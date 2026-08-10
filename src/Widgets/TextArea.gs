package SharpTui

import System
import System.Collections.Generic
import System.Collections.Immutable
import System.Globalization

/// A multi-line plain text editor, cluster indexed like Entry.
public open class TextArea : Box {
  private var lines ImmutableList[string]
  private var row int32
  private var col int32
  private var firstVisibleRowIndex int32
  private var horizontalCellOffset int32
  private var wrapping TextWrapping
  private var isModified bool
  private var anchorRow int32
  private var anchorCol int32
  private var marked bool
  private var gutterStyle Style
  private var selectedTextStyle Style

  /// The full text content, joined with '\n'. Setting it replaces all lines, resets the caret, and clears undo history.
  public prop Text string {
    get { return textOfLines() }
    set { loadText(value) }
  }

  /// The caret position as a line and grapheme index. Setting it moves the caret and scrolls it into view.
  public prop Caret TextPosition {
    get { return position(row, col) }
    set { moveTo(value.LineIndex, value.GraphemeIndex, ContentBounds.HeightRows) }
  }

  /// The index of the topmost visible visual row. Negative values clamp to zero.
  public prop FirstVisibleRowIndex int32 {
    get { return firstVisibleRowIndex }
    set { firstVisibleRowIndex = value < 0 ? 0 : value }
  }

  /// The horizontal scroll offset in cells, used when Wrapping is None. Negative values clamp to zero.
  public prop HorizontalCellOffset int32 {
    get { return horizontalCellOffset }
    set { horizontalCellOffset = value < 0 ? 0 : value }
  }

  /// The line wrapping mode; None preserves lines and pans horizontally, Word wraps at the content width.
  public prop Wrapping TextWrapping {
    get { return wrapping }
    set { wrapping = value }
  }

  /// True once the text has changed since it was last loaded via the Text setter.
  public prop IsModified bool { get { return isModified } }

  /// The current selection range, or nil when nothing is marked.
  public prop Selection TextSelection? {
    get {
    if !marked { return nil }
      return TextSelection{ Start: markStart(), End: markEnd() }
    }
  }

  /// True when a selection is currently marked.
  public prop HasSelection bool { get { return marked } }
  /// The text within the current selection, or an empty string when nothing is marked.
  public prop SelectedText string { get { return markedText() } }

  /// The style applied to the line-number gutter.
  public prop GutterStyle Style {
    get { return gutterStyle }
    set { gutterStyle = value }
  }

  /// The style applied to the highlighted selection background.
  public prop SelectedTextStyle Style {
    get { return selectedTextStyle }
    set { selectedTextStyle = value }
  }

  private var undos List[Snapshot]
  private var redos List[Snapshot]
  private var typing bool
  private var rows List[VisRow]
  private var rowsWidth int32
  private var rowsStamp int32
  private var rowsWrap bool
  private var stamp int32
  private var lineNumbers List[string]
  private var lineNumberCount int32
  private var lineNumberDigits int32

  /// Creates an empty, focusable, unwrapped text area with a single blank line.
  public init() {
    lines = ImmutableList[string].Empty.Add("")
    row = 0
    col = 0
    firstVisibleRowIndex = 0
    horizontalCellOffset = 0
    wrapping = TextWrapping.None
    isModified = false
    gutterStyle = Style()
    anchorRow = 0
    anchorCol = 0
    marked = false
    selectedTextStyle = Style()
    undos = List[Snapshot]()
    redos = List[Snapshot]()
    typing = false
    rows = List[VisRow]()
    rowsWidth = -1
    rowsStamp = -1
    rowsWrap = false
    stamp = 0
    lineNumbers = List[string]()
    lineNumberCount = -1
    lineNumberDigits = -1
    CanFocus = true
    GrowWeight = 1
  }

  private func loadText(text string) {
    let raw = text.Replace("\r", "").Split('\n')
    lines = ImmutableList[string].Empty
    for line in raw { lines = lines.Add(line) }
    if lines.Count == 0 { lines = lines.Add("") }
    row = 0
    col = 0
    firstVisibleRowIndex = 0
    horizontalCellOffset = 0
    isModified = false
    stamp = stamp + 1
    marked = false
    undos.Clear()
    redos.Clear()
    typing = false
  }

  private func textOfLines() string {
    var out = ""
    for i in 0 ... lines.Count {
      if i > 0 { out = out + "\n" }
      out = out + lines[i]
    }
    return out
  }

  /// Returns the number of visual rows, accounting for word wrap when enabled.
  /// @returns The number of visual rows.
  protected override func ScrollExtentRows() int32 {
    return rows.Count > 0 ? rows.Count : lines.Count
  }

  /// Returns FirstVisibleRowIndex as the current scroll offset.
  /// @returns The index of the topmost visible visual row.
  protected override func ScrollOffsetRows() int32 {
    return firstVisibleRowIndex
  }

  /// Paints the gutter, visible text rows, selection highlight, and caret.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.WidthCells <= 0 || r.HeightRows <= 0 { return }
    clampCursor()

    let digits = digitCount(lines.Count)
    let gutterWidth = digits + 1
    let textWidth = r.WidthCells - gutterWidth
    if textWidth <= 0 { return }
    layout(textWidth)
    ensureLineNumbers(digits)
    followPan(textWidth)
    firstVisibleRowIndex = clampScroll(firstVisibleRowIndex, r.HeightRows)

    var v = firstVisibleRowIndex
    while v < rows.Count {
      let drawRow = v - firstVisibleRowIndex
      if drawRow >= r.HeightRows { break }
      let seg = rows[v]
      if seg.From == 0 { screen.WriteClipped(r, 0, drawRow, lineNumbers[seg.Line], gutterStyle) }
      let to = wrapping == TextWrapping.Word ? seg.To : -1
      let skip = wrapping == TextWrapping.Word ? 0 : horizontalCellOffset
      screen.WriteClippedRange(r, gutterWidth, drawRow, lines[seg.Line], seg.From, to, skip, ink)
      paintMark(screen, r, drawRow, seg, gutterWidth, textWidth, ink)
      v = v + 1
    }

    if IsFocused {
      let here = visualOf(row, col)
      let cursorRow = here - firstVisibleRowIndex
      if cursorRow >= 0 && cursorRow < r.HeightRows {
        let cursorColumn = cellOf(lines[row], col) - originOf(rows[here])
        if cursorColumn >= 0 && cursorColumn < textWidth {
          let swapped = ink.Inverted()
          let glyph = graphemeAt(lines[row], col)
          screen.WriteCell(r.Column + gutterWidth + cursorColumn, r.Row + cursorRow, glyph, swapped)
        }
      }
    }
  }

  private func originOf(seg VisRow) int32 {
    if Wrapping == TextWrapping.Word { return cellOf(lines[seg.Line], seg.From) }
    return horizontalCellOffset
  }

  private func layout(width int32) {
    if wrapping == TextWrapping.None && !rowsWrap && rows.Count == lines.Count { return }
    if width == rowsWidth && stamp == rowsStamp && wrapping == (rowsWrap ? TextWrapping.Word : TextWrapping.None) && rows.Count > 0 { return }
    rowsWidth = width
    rowsStamp = stamp
    rowsWrap = wrapping == TextWrapping.Word
    rows.Clear()
    for i in 0 ... lines.Count {
      if wrapping == TextWrapping.Word {
        wrapLine(i, width)
      } else {
        rows.Add(seg(i, 0, 0))
      }
    }
  }

  private func ensureLineNumbers(digits int32) {
    if lineNumberCount == lines.Count && lineNumberDigits == digits { return }
    lineNumbers.Clear()
    var i = 0
    while i < lines.Count {
      lineNumbers.Add((i + 1).ToString().PadLeft(digits) + " ")
      i = i + 1
    }
    lineNumberCount = lines.Count
    lineNumberDigits = digits
  }

  private func digitCount(value int32) int32 {
    var digits = 1
    var n = value
    while n >= 10 {
      n = n / 10
      digits = digits + 1
    }
    return digits
  }

  private func wrapLine(line int32, width int32) {
    let clusters = Glyph.Clusters(lines[line])
    if clusters.Count == 0 {
      rows.Add(seg(line, 0, 0))
      return
    }
    var from = 0
    while from < clusters.Count {
      var cells = 0
      var j = from
      var space = -1
      while j < clusters.Count {
        let w = Glyph.Of(clusters[j])
        if cells + w > width { break }
        cells = cells + w
        if clusters[j] == " " { space = j }
        j = j + 1
      }
      if j < clusters.Count && space > from { j = space + 1 }
      if j == from { j = from + 1 }
      rows.Add(seg(line, from, j))
      from = j
    }
  }

  private func seg(line int32, from int32, to int32) VisRow {
    var s = VisRow{}
    s.Line = line
    s.From = from
    s.To = to
    return s
  }

  private func rowStart() int32 {
    if wrapping != TextWrapping.Word || rows.Count == 0 { return 0 }
    return rows[visualOf(row, col)].From
  }

  private func rowEnd() int32 {
    let n = graphemeCount(lines[row])
    if wrapping != TextWrapping.Word || rows.Count == 0 { return n }
    let here = rows[visualOf(row, col)]
    if here.To >= n { return n }
    return here.To - 1
  }

  private func visualOf(row int32, col int32) int32 {
    if wrapping != TextWrapping.Word { return row }
    var last = 0
    for i in 0 ... rows.Count {
      if rows[i].Line == row {
        last = i
        if col < rows[i].To { return i }
      }
    }
    return last
  }

  /// Handles editing, navigation, selection, clipboard, undo/redo, and mouse input. A paste inserts its text preserving line breaks as one undo step.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    let bounds = ContentBounds
    clampCursor()

    if ev.Kind == UiEventKind.Paste {
      return result(insertPaste(ev.Text))
    }
    if ev.Key == Key.Character && (int32(ev.Modifiers) & int32(KeyModifiers.Ctrl)) != 0 {
      if ev.Text == "z" { return result(Undo()) }
      if ev.Text == "y" { return result(Redo()) }
      if ev.Text == "a" { return result(selectAll()) }
      if ev.Text == "c" { return result(copy()) }
      if ev.Text == "x" { return result(cut()) }
      if ev.Text == "v" { return result(paste()) }
      return EventResult.Continue
    }

    if ev.Key == Key.Character && (int32(ev.Modifiers) & int32(KeyModifiers.Alt)) == 0 {
      dropMark()
      beginRun()
      insert(ev.Text)
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      dropMark()
      endRun()
      return result(splitLine())
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Backspace {
      endRun()
      if marked { return result(cutMark()) }
      return result(backspace())
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Delete {
      endRun()
      if marked { return result(cutMark()) }
      return result(deleteForward())
    }

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Left {
      let m = step(ev)
      if (int32(ev.Modifiers) & int32(KeyModifiers.Ctrl)) != 0 { return result(wordLeft(bounds.HeightRows) || m) }
      return result(moveLeft() || m)
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Right {
      let m = step(ev)
      if (int32(ev.Modifiers) & int32(KeyModifiers.Ctrl)) != 0 { return result(wordRight(bounds.HeightRows) || m) }
      return result(moveRight() || m)
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up {
      let m = step(ev)
      return result(moveVertical(-1, bounds) || m)
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down {
      let m = step(ev)
      return result(moveVertical(1, bounds) || m)
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home {
      let m = step(ev)
      return result(moveTo(row, rowStart(), bounds.HeightRows) || m)
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End {
      let m = step(ev)
      return result(moveTo(row, rowEnd(), bounds.HeightRows) || m)
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp {
      let m = step(ev)
      return result(moveTo(row - bounds.HeightRows, col, bounds.HeightRows) || m)
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown {
      let m = step(ev)
      return result(moveTo(row + bounds.HeightRows, col, bounds.HeightRows) || m)
    }

    if ev.Kind == UiEventKind.Mouse {
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      if ev.Mouse == MouseKind.ScrollUp { return result(scrollBy(-3, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(scrollBy(3, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.Press {
        endRun()
        dropMark()
        let moved = clickAt(ev.Position, bounds)
        anchorRow = row
        anchorCol = col
        return result(moved)
      }
      if ev.Mouse == MouseKind.Move {
        let moved = clickAt(ev.Position, bounds)
        marked = anchorRow != row || anchorCol != col
        return result(moved || marked)
      }
    }
    return EventResult.Continue
  }

  /// Undoes one edit. False when there is nothing left to undo.
  /// @returns True when an edit was undone.
  public func Undo() bool {
    endRun()
    if undos.Count == 0 { return false }
    redos.Add(snapshot())
    apply(undos[undos.Count - 1])
    undos.RemoveAt(undos.Count - 1)
    mark()
    return true
  }

  /// Redoes one undone edit.
  /// @returns True when an edit was redone.
  public func Redo() bool {
    endRun()
    if redos.Count == 0 { return false }
    undos.Add(snapshot())
    apply(redos[redos.Count - 1])
    redos.RemoveAt(redos.Count - 1)
    mark()
    return true
  }

  private func markedText() string {
    if !marked { return "" }
    let a = markStart()
    let b = markEnd()
    if a.LineIndex == b.LineIndex { return slice(lines[a.LineIndex], a.GraphemeIndex, b.GraphemeIndex) }

    var out = slice(lines[a.LineIndex], a.GraphemeIndex, graphemeCount(lines[a.LineIndex]))
    for i in a.LineIndex + 1 ... b.LineIndex {
      out = out + "\n" + lines[i]
    }
    return out + "\n" + slice(lines[b.LineIndex], 0, b.GraphemeIndex)
  }

  /// Searches for needle from the caret in the given direction, wrapping around the document, and selects the first match found. Returns false when needle is empty or not found.
  /// @param needle The text to search for.
  /// @param direction The direction to search in.
  /// @returns True when a match was found and selected.
  public func Find(needle string, direction SearchDirection) bool {
    return find(needle, direction == SearchDirection.Forward)
  }

  private func find(needle string, forward bool) bool {
    if needle == "" { return false }
    let want = needle.ToUpperInvariant()
    let wide = graphemeCount(needle)

    var n = 0
    while n <= lines.Count {
      let foundRow = wrapRow(forward ? row + n : row - n)
      let clusters = Glyph.Clusters(lines[foundRow])
      var i = 0
      var best = -1
      while i + wide <= clusters.Count {
        if slice(lines[foundRow], i, i + wide).ToUpperInvariant() == want {
          if forward && (n > 0 || i >= col) {
            best = i
            break
          }
          if !forward && (n > 0 || i + wide <= col) { best = i }
        }
        i = i + 1
      }
      if best >= 0 {
        anchorRow = foundRow
        anchorCol = best
        row = foundRow
        col = best + wide
        marked = true
        follow(ContentBounds.HeightRows)
        return true
      }
      n = n + 1
    }
    return false
  }

  /// Replaces the current selection with text as one undo step. Returns false when nothing is selected.
  /// @param text The replacement text.
  /// @returns True when the selection was replaced.
  public func ReplaceSelection(text string) bool {
    if !marked { return false }
    endRun()
    record()
    deleteMark()
    insert(text)
    return true
  }

  private func wrapRow(row int32) int32 {
    var r = row % lines.Count
    if r < 0 { r = r + lines.Count }
    return r
  }

  private func insert(text string) {
    let offset = graphemeOffset(lines[row], col)
    lines = lines.SetItem(row, lines[row].Insert(offset, text))
    col = col + graphemeCount(text)
    mark()
  }

  private func splitLine() bool {
    record()
    let current = lines[row]
    let offset = graphemeOffset(current, col)
    let before = current.Substring(0, offset)
    let after = current.Substring(offset)
    lines = lines.SetItem(row, before).Insert(row + 1, after)
    row = row + 1
    col = 0
    mark()
    return true
  }

  private func backspace() bool {
    if col == 0 && row == 0 { return false }
    record()
    if col > 0 {
      let current = lines[row]
      let start = graphemeOffset(current, col - 1)
      let end = graphemeOffset(current, col)
      lines = lines.SetItem(row, current.Remove(start, end - start))
      col = col - 1
      mark()
      return true
    }
    if row == 0 { return false }
    let prevLen = graphemeCount(lines[row - 1])
    lines = lines.SetItem(row - 1, lines[row - 1] + lines[row]).RemoveAt(row)
    row = row - 1
    col = prevLen
    mark()
    return true
  }

  private func deleteForward() bool {
    let count = graphemeCount(lines[row])
    if col >= count && row >= lines.Count - 1 { return false }
    record()
    if col < count {
      let current = lines[row]
      let start = graphemeOffset(current, col)
      let end = graphemeOffset(current, col + 1)
      lines = lines.SetItem(row, current.Remove(start, end - start))
      mark()
      return true
    }
    if row >= lines.Count - 1 { return false }
    lines = lines.SetItem(row, lines[row] + lines[row + 1]).RemoveAt(row + 1)
    mark()
    return true
  }

  private func moveLeft() bool {
    if col > 0 {
      col = col - 1
      return true
    }
    if row == 0 { return false }
    row = row - 1
    col = graphemeCount(lines[row])
    return true
  }

  private func wordLeft(height int32) bool {
    if col == 0 { return moveLeft() }
    let cl = Glyph.Clusters(lines[row])
    var c = col
    while c > 0 && blank(cl[c - 1]) { c = c - 1 }
    while c > 0 && !blank(cl[c - 1]) { c = c - 1 }
    col = c
    follow(height)
    return true
  }

  private func wordRight(height int32) bool {
    let cl = Glyph.Clusters(lines[row])
    if col >= cl.Count { return moveRight() }
    var c = col
    while c < cl.Count && !blank(cl[c]) { c = c + 1 }
    while c < cl.Count && blank(cl[c]) { c = c + 1 }
    col = c
    follow(height)
    return true
  }

  private func blank(cluster string) bool {
    return cluster == " " || cluster == "\t"
  }

  private func moveRight() bool {
    let count = graphemeCount(lines[row])
    if col < count {
      col = col + 1
      return true
    }
    if row >= lines.Count - 1 { return false }
    row = row + 1
    col = 0
    return true
  }

  private func moveVertical(delta int32, bounds CellRect) bool {
    if wrapping != TextWrapping.Word { return moveTo(row + delta, col, bounds.HeightRows) }
    let digits = digitCount(lines.Count)
    layout(bounds.WidthCells - digits - 1)
    let here = visualOf(row, col)
    let want = here + delta
    if want < 0 || want >= rows.Count { return false }
    let seg = rows[want]
    var targetCol = seg.From + (col - rows[here].From)
    if targetCol > seg.To { targetCol = seg.To }
    return moveTo(seg.Line, targetCol, bounds.HeightRows)
  }

  private func moveTo(targetRow int32, targetCol int32, height int32) bool {
    var r = targetRow
    if r < 0 { r = 0 }
    if r >= lines.Count { r = lines.Count - 1 }
    var c = targetCol
    let count = graphemeCount(lines[r])
    if c < 0 { c = 0 }
    if c > count { c = count }
    if r == row && c == col { return false }
    row = r
    col = c
    follow(height)
    return true
  }

  private func scrollBy(delta int32, height int32) bool {
    let want = clampScroll(firstVisibleRowIndex + delta, height)
    if want == firstVisibleRowIndex { return false }
    firstVisibleRowIndex = want
    return true
  }

  private func clickAt(position CellPoint, bounds CellRect) bool {
    let digits = digitCount(lines.Count)
    let gutterWidth = digits + 1
    layout(bounds.WidthCells - gutterWidth)
    if rows.Count == 0 { return false }
    var v = firstVisibleRowIndex + (position.Row - bounds.Row)
    if v < 0 { v = 0 }
    if v >= rows.Count { v = rows.Count - 1 }
    let seg = rows[v]
    let clusters = Glyph.Clusters(lines[seg.Line])
    let stop = wrapping == TextWrapping.Word ? seg.To : clusters.Count
    var cell = position.Column - bounds.Column - gutterWidth + originOf(seg)
    if cell < 0 { cell = 0 }
    var targetCol = wrapping == TextWrapping.Word ? seg.From : 0
    var cells = cellOf(lines[seg.Line], targetCol)
    while targetCol < stop && cells < cell {
      cells = cells + Glyph.Of(clusters[targetCol])
      targetCol = targetCol + 1
    }
    row = seg.Line
    col = targetCol
    follow(bounds.HeightRows)
    return true
  }

  private func clampCursor() {
    if row < 0 { row = 0 }
    if row >= lines.Count { row = lines.Count - 1 }
    let count = graphemeCount(lines[row])
    if col < 0 { col = 0 }
    if col > count { col = count }
  }

  private func follow(height int32) {
    let here = visualOf(row, col)
    if here < firstVisibleRowIndex { firstVisibleRowIndex = here }
    if here >= firstVisibleRowIndex + height { firstVisibleRowIndex = here - height + 1 }
    firstVisibleRowIndex = clampScroll(firstVisibleRowIndex, height)
  }

  private func clampScroll(s int32, height int32) int32 {
    var max = ScrollExtentRows() - height
    if max < 0 { max = 0 }
    if s > max { return max }
    if s < 0 { return 0 }
    return s
  }

  private func mark() {
    isModified = true
    stamp = stamp + 1
  }

  private func beginRun() {
    if typing { return }
    record()
    typing = true
  }

  private func endRun() {
    typing = false
  }

  private func record() {
    undos.Add(snapshot())
    redos.Clear()
    if undos.Count > 200 { undos.RemoveAt(0) }
  }

  private func snapshot() Snapshot {
    let s = Snapshot()
    s.Lines = lines
    s.Row = row
    s.Col = col
    return s
  }

  private func apply(s Snapshot) {
    lines = s.Lines
    row = s.Row
    col = s.Col
    marked = false
    clampCursor()
  }

  private func step(ev UiEvent) bool {
    endRun()
    if (int32(ev.Modifiers) & int32(KeyModifiers.Shift)) == 0 { return dropMark() }
    if marked { return false }
    anchorRow = row
    anchorCol = col
    marked = true
    return true
  }

  private func dropMark() bool {
    if !marked { return false }
    marked = false
    return true
  }

  private func markStart() TextPosition {
    if anchorRow < row { return position(anchorRow, anchorCol) }
    if anchorRow > row { return position(row, col) }
    return position(row, anchorCol < col ? anchorCol : col)
  }

  private func markEnd() TextPosition {
    if anchorRow < row { return position(row, col) }
    if anchorRow > row { return position(anchorRow, anchorCol) }
    return position(row, anchorCol > col ? anchorCol : col)
  }

  private func position(lineIndex int32, graphemeIndex int32) TextPosition {
    return TextPosition{ LineIndex: lineIndex, GraphemeIndex: graphemeIndex }
  }

  private func slice(text string, from int32, to int32) string {
    var a = from
    var b = to
    if a < 0 { a = 0 }
    let count = graphemeCount(text)
    if b > count { b = count }
    if b <= a { return "" }
    let start = graphemeOffset(text, a)
    let end = graphemeOffset(text, b)
    if start == 0 && end == text.Length { return text }
    return text.Substring(start, end - start)
  }

  private func selectAll() bool {
    endRun()
    anchorRow = 0
    anchorCol = 0
    row = lines.Count - 1
    col = graphemeCount(lines[row])
    marked = true
    return true
  }

  private func copy() bool {
    if !marked { return false }
    Clip.Set(SelectedText)
    return true
  }

  private func cut() bool {
    if !marked { return false }
    Clip.Set(SelectedText)
    return cutMark()
  }

  private func paste() bool {
    return insertPaste(Clip.Get())
  }

  private func insertPaste(text string) bool {
    if text == "" { return false }
    endRun()
    record()
    if marked { deleteMark() }
    let parts = text.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n')
    for i in 0 ... parts.Length {
      if i > 0 {
        let clusters = Glyph.Clusters(lines[row])
        var after = ""
        for j in col ... clusters.Count { after = after + clusters[j] }
        lines = lines.SetItem(row, slice(lines[row], 0, col)).Insert(row + 1, after)
        row = row + 1
        col = 0
      }
      if parts[i] != "" { insert(parts[i]) }
    }
    mark()
    return true
  }

  private func cutMark() bool {
    if !marked { return false }
    record()
    deleteMark()
    return true
  }

  private func deleteMark() {
    let a = markStart()
    let b = markEnd()
    let head = slice(lines[a.LineIndex], 0, a.GraphemeIndex)
    let tail = slice(lines[b.LineIndex], b.GraphemeIndex, graphemeCount(lines[b.LineIndex]))

    var i = b.LineIndex
    while i > a.LineIndex {
      lines = lines.RemoveAt(i)
      i = i - 1
    }
    lines = lines.SetItem(a.LineIndex, head + tail)
    row = a.LineIndex
    col = a.GraphemeIndex
    marked = false
    mark()
  }

  private func paintMark(screen Screen, r CellRect, row int32, seg VisRow,
      gutterWidth int32, textWidth int32, ink Style) {
    if !marked { return }
    let line = seg.Line
    let a = markStart()
    let b = markEnd()
    if line < a.LineIndex || line > b.LineIndex { return }

    let clusters = Glyph.Clusters(lines[line])
    var from = line == a.LineIndex ? a.GraphemeIndex : 0
    var to = line == b.LineIndex ? b.GraphemeIndex : clusters.Count
    if wrapping == TextWrapping.Word {
      if from < seg.From { from = seg.From }
      if to > seg.To { to = seg.To }
    }
    if to <= from { return }

    var x = cellOf(lines[line], from) - originOf(seg)
    var run = slice(lines[line], from, to)
    if x < 0 {
      run = panned(run, -x, textWidth)
      x = 0
    }
    if x >= textWidth { return }
    let selectionStyle = Style{
      Foreground: selectedTextStyle.Foreground.IsInherited ? ink.Background : selectedTextStyle.Foreground,
      Background: selectedTextStyle.Background.IsInherited ? ink.Foreground : selectedTextStyle.Background,
      Attributes: TextAttributes(int32(ink.Attributes) | int32(selectedTextStyle.Attributes)),
    }
    screen.WriteClipped(r, gutterWidth + x, row, CellText.Clip(run, textWidth - x), selectionStyle)
  }

  private func cellOf(text string, index int32) int32 {
    var cells = 0
    var i = 0
    for cluster in Glyph.Elements(text) {
      if i >= index { break }
      cells = cells + Glyph.Of(cluster)
      i = i + 1
    }
    return cells
  }

  private func graphemeCount(text string) int32 {
    var count = 0
    var offset = 0
    while offset < text.Length {
      offset = offset + StringInfo.GetNextTextElementLength(text, offset)
      count = count + 1
    }
    return count
  }

  private func graphemeOffset(text string, index int32) int32 {
    var offset = 0
    var count = 0
    while offset < text.Length && count < index {
      offset = offset + StringInfo.GetNextTextElementLength(text, offset)
      count = count + 1
    }
    return offset
  }

  private func graphemeAt(text string, index int32) string {
    var i = 0
    for cluster in Glyph.Elements(text) {
      if i == index { return cluster }
      i = i + 1
    }
    return " "
  }

  private func panned(text string, from int32, width int32) string {
    if from <= 0 { return CellText.Clip(text, width) }
    let clusters = Glyph.Clusters(text)
    var cells = 0
    var i = 0
    while i < clusters.Count && cells < from {
      cells = cells + Glyph.Of(clusters[i])
      i = i + 1
    }
    var out = ""
    if cells > from { out = " " }
    while i < clusters.Count {
      out = out + clusters[i]
      i = i + 1
    }
    return CellText.Clip(out, width)
  }

  private func followPan(textWidth int32) {
    if wrapping == TextWrapping.Word {
      horizontalCellOffset = 0
      return
    }
    let cells = cellOf(lines[row], col)
    if cells < horizontalCellOffset { horizontalCellOffset = cells }
    if cells >= horizontalCellOffset + textWidth { horizontalCellOffset = cells - textWidth + 1 }
    if horizontalCellOffset < 0 { horizontalCellOffset = 0 }
  }

  private func result(handled bool) EventResult {
    return handled ? EventResult.Handled : EventResult.Continue
  }
}

internal class Snapshot {
  public var Lines ImmutableList[string]
  public var Row int32
  public var Col int32

  public init() {
    Lines = ImmutableList[string].Empty
    Row = 0
    Col = 0
  }
}

/// An immutable line and grapheme-cluster index within a TextArea. Both indices must be non-negative.
public struct TextPosition {
  private var lineIndex int32
  private var graphemeIndex int32

  /// The zero-based line index.
  public prop LineIndex int32 {
    get { return lineIndex }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("LineIndex") }
      lineIndex = value
    }
  }

  /// The zero-based grapheme-cluster index within the line.
  public prop GraphemeIndex int32 {
    get { return graphemeIndex }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("GraphemeIndex") }
      graphemeIndex = value
    }
  }
}

/// A start/end range of TextPosition values marking a selection in a TextArea.
public struct TextSelection {
  private var start TextPosition
  private var end TextPosition

  /// The position where the selection begins.
  public prop Start TextPosition { get { return start } init { start = value } }
  /// The position where the selection ends.
  public prop End TextPosition { get { return end } init { end = value } }
}

/// The direction TextArea.Find searches from the caret.
public enum SearchDirection { Forward, Backward }

internal struct VisRow {
  var Line int32
  var From int32
  var To int32
}

internal class Clip {
  shared {
    let box List[string] = List[string]()

    public func Set(text string) {
      box.Clear()
      box.Add(text)
    }

    public func Get() string {
      return box.Count > 0 ? box[0] : ""
    }
  }
}
