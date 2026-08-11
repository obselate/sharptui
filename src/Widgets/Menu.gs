package SharpTui

import System
import System.Collections.Generic

/// A dropdown select. Opens a floating option list below itself.
/// Add a Select late among its siblings so the open list paints over them.
public open class Select : Box {
  private var isOpen bool
  private var highlightIndex int32
  private var top int32
  private var options List[string]
  private var selectedIndex int32
  private var selectionChange SelectionChange?

  /// Selectable option strings; setting it replaces all options and re-resolves the selection via RefreshOptions.
  public prop Options List[string] {
    get { return options }
    set {
      options = value
      RefreshOptions()
    }
  }
  /// Index of the selected option, clamped to the current Options range. Setting it selects programmatically and does not emit a SelectionChange.
  public prop SelectedIndex int32 {
    get {
      normalizeSelection()
      return selectedIndex
    }
    set { setSelection(value, false) }
  }
  /// Whether the floating option list is currently shown.
  public prop IsOpen bool { get { return isOpen } }
  /// Style merged over the highlighted option's inherited style in the open list.
  public prop SelectedStyle Style { get; set; }
  /// Text shown in the closed control when Options is empty.
  public prop Placeholder string { get; set; }

  /// Creates a closed select with no options and the placeholder "select".
  public init() {
    options = List[string]()
    selectedIndex = 0
    selectionChange = nil
    isOpen = false
    highlightIndex = 0
    SelectedStyle = Style()
    Placeholder = "select"
    CanFocus = true
    top = 0
  }

  /// Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  /// @returns The pending selection change, or nil when none is pending.
  public func ConsumeSelectionChange() SelectionChange? {
    let pending = selectionChange
    selectionChange = nil
    return pending
  }

  /// Refreshes selection after direct Options mutation.
  public func RefreshOptions() {
    normalizeSelection()
    highlightIndex = clampIndex(highlightIndex)
    selectionChange = nil
  }

  /// Always true, so this select sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the select as the widest option, or Placeholder when empty, plus two cells of padding.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    var width = Options.Count == 0 ? Glyph.WidthOf(Placeholder) : 0
    for option in Options {
      let optionWidth = Glyph.WidthOf(option)
      if optionWidth > width { width = optionWidth }
    }
    return CellSize{ WidthCells: width + 2, HeightRows: 1 }
  }

  /// Paints the closed control's selected text and dropdown arrow, then the floating option list with the highlighted row when open.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    normalizeSelection()
    let selected = selectedOptionIndex()
    let text = selected >= 0 ? Options[selected] : Placeholder
    let show = IsFocused ? ink.Inverted() : ink
    let textWidth = Glyph.WidthOf(text)
    screen.WriteClipped(r, 0, 0, text, show)
    screen.WriteClipped(r, textWidth, 0, " ", show)
    screen.WriteClipped(r, textWidth + 1, 0, "▾", show)

    if !IsOpen { return }
    let list = listRect()
    screen.Fill(list, ink)
    screen.DrawBorder(list, ink)
    let inner = list.Inset(CellInsets.All(1))
    let rows = inner.HeightRows
    let selectedStyle = SelectedStyle.MergedOver(ink)

    top = Selection.ScrollIntoView(Options.Count, highlightIndex, top, rows)

    var i = 0
    while i < rows && top + i < Options.Count {
      screen.WriteClipped(inner, 0, i, Options[top + i], top + i == highlightIndex ? selectedStyle : ink)
      i = i + 1
    }
  }

  /// Delegates keyboard and mouse input to the closed or open handling path depending on IsOpen.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    normalizeSelection()
    if !IsOpen { return acceptClosed(ev) }
    return acceptOpen(ev)
  }

  internal override func IsInputScope() bool {
    return IsOpen
  }

  internal override func ScopeFallback(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press { return Accept(ev) }
    return EventResult.Continue
  }

  private func acceptClosed(ev UiEvent) EventResult {
    if Options.Count == 0 { return EventResult.Continue }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      isOpen = true
      highlightIndex = selectedOptionIndex()
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ContentBounds.Contains(ev.Position) {
      isOpen = true
      highlightIndex = selectedOptionIndex()
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func acceptOpen(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up {
      if highlightIndex <= 0 { return EventResult.Continue }
      highlightIndex = highlightIndex - 1
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down {
      if highlightIndex >= Options.Count - 1 { return EventResult.Continue }
      highlightIndex = highlightIndex + 1
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      setSelection(highlightIndex, true)
      isOpen = false
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Escape {
      isOpen = false
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press {
      let list = listRect()
      if list.Contains(ev.Position) {
        let inner = list.Inset(CellInsets.All(1))
        let row = ev.Position.Row - inner.Row
        let idx = top + row
        if row >= 0 && row < inner.HeightRows && idx < Options.Count { setSelection(idx, true) }
      }
      isOpen = false
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func listRect() CellRect {
    return CellRect{
      Column: Bounds.Column,
      Row: Bounds.Row + Bounds.HeightRows,
      WidthCells: Bounds.WidthCells,
      HeightRows: Options.Count < 8 ? Options.Count : 8,
    }
  }

  private func selectedOptionIndex() int32 {
    if Options.Count == 0 { return -1 }
    return selectedIndex
  }

  private func normalizeSelection() {
    let normalized = clampIndex(selectedIndex)
    if normalized == selectedIndex { return }
    selectedIndex = normalized
    selectionChange = nil
  }

  private func setSelection(want int32, emit bool) bool {
    let value = clampIndex(want)
    if selectedIndex == value {
      if !emit { selectionChange = nil }
      return false
    }
    let previous = selectedIndex
    selectedIndex = value
    selectionChange = emit ? SelectionChange(previous, value) : nil
    return true
  }

  private func clampIndex(value int32) int32 {
    return Selection.ClampIndex(Options.Count, value)
  }
}
