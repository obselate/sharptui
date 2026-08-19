package SharpTui

import System
import System.Collections.Generic
import System.Text

/// Where the caret moves to in TextInput.MoveCaretToStart / MoveCaretToEnd.
internal enum CaretPlacement { Start, End }

/// A single-line text input, indexed by grapheme cluster throughout.
public open class TextInput : Box {
  private var text string
  private var placeholder string
  private var caretGraphemeIndex int32
  private var isPassword bool
  private var placeholderStyle Style
  private var clusters List[string]

  /// The current text content. Setting it rebuilds the grapheme index and clamps the caret.
  public prop Text string {
    get { return text }
    set {
      text = value
      rebuildClusters()
      clampCaret()
    }
  }

  /// Text shown in place of an empty, unfocused field.
  public prop Placeholder string {
    get { return placeholder }
    set { placeholder = value }
  }

  /// The caret position as a grapheme-cluster index. Setting it clamps to the text bounds.
  public prop CaretGraphemeIndex int32 {
    get { return caretGraphemeIndex }
    set {
      caretGraphemeIndex = value
      clampCaret()
    }
  }

  /// When true, characters render as bullets instead of the underlying text.
  public prop IsPassword bool {
    get { return isPassword }
    set { isPassword = value }
  }

  /// The style applied to Placeholder text.
  public prop PlaceholderStyle Style {
    get { return placeholderStyle }
    set { placeholderStyle = value }
  }

  /// Creates an empty, focusable single-line text input.
  public init() {
    text = ""
    placeholder = ""
    caretGraphemeIndex = 0
    isPassword = false
    placeholderStyle = Style()
    clusters = List[string]()
    CanFocus = true
    FlexShrink = 1.0F
  }

  /// Enables intrinsic sizing so MeasureIntrinsic determines the auto width.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures an auto width as the wider of Text and Placeholder, at least one cell.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    var width = Width.IsAuto ? Glyph.WidthOf(Text) : Width.CellCount
    if Width.IsAuto {
      let placeholderWidth = Glyph.WidthOf(Placeholder)
      if placeholderWidth > width { width = placeholderWidth }
    }
    if width < 1 { width = 1 }
    return CellSize{ WidthCells: width, HeightRows: 1 }
  }

  /// Paints Placeholder when empty and unfocused, otherwise the panned text and caret glyph.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.WidthCells <= 0 || r.HeightRows <= 0 { return }
    clampCaret(clusters.Count)

    if Text == "" && !IsFocused {
      let style = PlaceholderStyle.MergedOver(ink)
      screen.WriteClipped(r, 0, 0, Placeholder, style)
      return
    }

    var start = CaretGraphemeIndex
    var visibleCells = 0
    while start > 0 {
      let w = isPassword ? 1 : Glyph.Of(clusters[start - 1])
      if visibleCells + w >= r.WidthCells { break }
      visibleCells = visibleCells + w
      start = start - 1
    }

    if isPassword {
      var x = 0
      var i = start
      while i < clusters.Count && x < r.WidthCells {
        screen.WriteCell(r.Column + x, r.Row, "•", ink)
        x = x + 1
        i = i + 1
      }
    } else {
      screen.WriteClippedRange(r, 0, 0, text, start, -1, 0, ink)
    }

    if IsFocused {
      let col = columnOf(start, CaretGraphemeIndex)
      if col < r.WidthCells {
        let swapped = ink.Inverted()
        var glyph = " "
        if CaretGraphemeIndex < clusters.Count {
          glyph = isPassword ? "•" : clusters[CaretGraphemeIndex]
        }
        screen.WriteCell(r.Column + col, r.Row, glyph, swapped)
      }
    }
  }

  private func columnOf(start int32, upto int32) int32 {
    var col = 0
    for i in start ... upto {
      col = col + (isPassword ? 1 : Glyph.Of(clusters[i]))
    }
    return col
  }

  /// Handles editing, caret movement, and clipboard shortcuts. A paste normalizes any line breaks in the pasted text to single spaces.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    clampCaret(clusters.Count)

    if ev.Kind == UiEventKind.Paste {
      insert(singleLinePaste(ev.Text))
      return EventResult.Handled
    }
    if ev.Key == Key.Character && (int32(ev.Modifiers) & int32(KeyModifiers.Ctrl)) != 0 {
      if ev.Text == "a" { return result(moveCaretTo(CaretPlacement.Start)) }
      if ev.Text == "e" { return result(moveCaretTo(CaretPlacement.End)) }
      if ev.Text == "u" { return result(remove(clusters, 0, CaretGraphemeIndex)) }
      if ev.Text == "k" { return result(remove(clusters, CaretGraphemeIndex, clusters.Count)) }
      return EventResult.Continue
    }
    if ev.Key == Key.Character && (int32(ev.Modifiers) & int32(KeyModifiers.Alt)) == 0 {
      insert(ev.Text)
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Backspace {
      if CaretGraphemeIndex <= 0 { return EventResult.Continue }
      return result(remove(clusters, CaretGraphemeIndex - 1, CaretGraphemeIndex))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Delete {
      if CaretGraphemeIndex >= clusters.Count { return EventResult.Continue }
      return result(remove(clusters, CaretGraphemeIndex, CaretGraphemeIndex + 1))
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Left { return result(moveCaret(CaretGraphemeIndex - 1)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Right { return result(moveCaret(CaretGraphemeIndex + 1)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home { return result(moveCaretTo(CaretPlacement.Start)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End { return result(moveCaretTo(CaretPlacement.End)) }
    return EventResult.Continue
  }

  private func insert(inserted string) {
    let offset = utf16Offset(CaretGraphemeIndex)
    text = text.Insert(offset, inserted)
    caretGraphemeIndex = CaretGraphemeIndex + countGraphemes(inserted)
    rebuildClusters()
  }

  private func remove(clusters List[string], from int32, to int32) bool {
    if from < 0 || to > clusters.Count || from >= to { return false }
    let start = utf16Offset(from)
    let end = utf16Offset(to)
    text = text.Remove(start, end - start)
    caretGraphemeIndex = from
    rebuildClusters()
    return true
  }

  private func moveCaret(pos int32) bool {
    var clamped = pos
    if clamped < 0 { clamped = 0 }
    let count = clusters.Count
    if clamped > count { clamped = count }
    if clamped == CaretGraphemeIndex { return false }
    CaretGraphemeIndex = clamped
    return true
  }

  /// Moves the caret to the beginning of the text. Returns false when it was already there.
  /// @returns True when the caret moved.
  public func MoveCaretToStart() bool {
    return moveCaretTo(CaretPlacement.Start)
  }

  /// Moves the caret to the end of the text. Returns false when it was already there.
  /// @returns True when the caret moved.
  public func MoveCaretToEnd() bool {
    return moveCaretTo(CaretPlacement.End)
  }

  private func moveCaretTo(placement CaretPlacement) bool {
    return placement == CaretPlacement.Start ? moveCaret(0) : moveCaret(clusters.Count)
  }

  private func clampCaret() {
    clampCaret(clusters.Count)
  }

  private func rebuildClusters() {
    clusters.Clear()
    for cluster in Glyph.Elements(text) { clusters.Add(cluster) }
  }

  private func utf16Offset(index int32) int32 {
    var offset = 0
    var i = 0
    while i < index && i < clusters.Count {
      offset = offset + clusters[i].Length
      i = i + 1
    }
    return offset
  }

  private func countGraphemes(value string) int32 {
    var count = 0
    for cluster in Glyph.Elements(value) { count = count + 1 }
    return count
  }

  private func clampCaret(count int32) {
    if caretGraphemeIndex < 0 { caretGraphemeIndex = 0 }
    if caretGraphemeIndex > count { caretGraphemeIndex = count }
  }

  private func singleLinePaste(value string) string {
    var first = 0
    while first < value.Length && value[first] != char(13) && value[first] != char(10) {
      first = first + 1
    }
    if first == value.Length { return value }
    let out = StringBuilder(value.Length)
    var i = 0
    while i < value.Length {
      let c = value[i]
      if c == char(13) {
        if i + 1 < value.Length && value[i + 1] == char(10) { i = i + 1 }
        out.Append(' ')
      } else if c == char(10) {
        out.Append(' ')
      } else {
        out.Append(c)
      }
      i = i + 1
    }
    return out.ToString()
  }
}
