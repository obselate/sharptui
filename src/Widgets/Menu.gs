package SharpTui

import System
import System.Collections.Generic

/// A dropdown select with a bounded floating option list.
public open class Select : Box {
  private var isOpen bool
  private var highlightIndex int32
  private var top int32
  private var options List[string]
  private var selection SelectionState
  private var placeholder string

  /// Receives each user selection change after navigation completes. Programmatic selection is silent.
  public prop OnChange Action[SelectionChange]? {
    get -> selection.OnChange
    set -> selection.OnChange = value
  }

  /// Selectable option strings; setting it replaces all options and re-resolves the selection via Refresh.
  public prop Options List[string] {
    get -> options
    set {
      options = value
      Refresh()
    }
  }
  /// Index of the selected option, clamped to the current Options range. Setting it selects programmatically and does not emit a SelectionChange.
  public prop SelectedIndex int32 {
    get {
      normalizeSelection()
      return selection.Index
    }
    set -> setSelection(value, false)
  }
  /// Whether the floating option list is currently shown.
  public prop IsOpen bool -> isOpen
  /// Receives true when the option list opens and false when it closes.
  public prop OnOpenChange Action[bool]? { get; set; }
  /// Style merged over the highlighted option's inherited style in the open list.
  public prop SelectedStyle Style { get; set; }
  /// Text shown in the closed control when Options is empty.
  public prop Placeholder string {
    get -> placeholder
    set {
      if placeholder == value { return }
      placeholder = value
      MarkMeasureDirty()
    }
  }

  /// Creates a closed select with no options and the placeholder "select".
  public init() {
    options = List[string]()
    selection = SelectionState()
    isOpen = false
    highlightIndex = 0
    SelectedStyle = Style()
    Placeholder = "select"
    CanFocus = true
    top = 0
  }


  /// Re-resolves selection after direct Options mutation.
  public func Refresh() {
    normalizeSelection()
    highlightIndex = clampIndex(highlightIndex)
    selection.Change = nil
    MarkMeasureDirty()
  }

  /// Always true, so this select sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool -> true

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

    top = Selection.ClampScroll(Options.Count, top, rows)

    var i = 0
    while i < rows && top + i < Options.Count {
      screen.WriteClipped(inner, 0, i, Options[top + i], top + i == highlightIndex ? selectedStyle : ink)
      i = i + 1
    }
  }

  /// Delegates keyboard and mouse input to the closed or open handling path depending on IsOpen.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected open override func Accept(ev UiEvent) EventResult {
    let outcome = acceptSelection(ev)
    selection.Notify()
    return outcome
  }

  private func acceptSelection(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if inputHasWindowModifier(ev.Modifiers) { return EventResult.Continue }
    normalizeSelection()
    if !IsOpen { return acceptClosed(ev) }
    return acceptOpen(ev)
  }

  internal override func IsInputScope() bool -> IsOpen

  internal override func ScopeFallback(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Mouse { return Accept(ev) }
    return EventResult.Continue
  }

  private func acceptClosed(ev UiEvent) EventResult {
    if Options.Count == 0 { return EventResult.Continue }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      highlightIndex = selectedOptionIndex()
      top = Selection.ScrollIntoView(Options.Count, highlightIndex, top, Math.Max(0, listRect().HeightRows - 2))
      setOpen(true)
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ev.Button == MouseButton.Left && ContentBounds.Contains(ev.Position) {
      highlightIndex = selectedOptionIndex()
      top = Selection.ScrollIntoView(Options.Count, highlightIndex, top, Math.Max(0, listRect().HeightRows - 2))
      setOpen(true)
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func acceptOpen(ev UiEvent) EventResult {
    let rows = listRect().HeightRows - 2
    if ev.Kind == UiEventKind.Mouse && (ev.Mouse == MouseKind.ScrollUp || ev.Mouse == MouseKind.ScrollDown) {
      let delta = ev.Mouse == MouseKind.ScrollUp ? -Selection.WheelStep : Selection.WheelStep
      top = Selection.ClampScroll(Options.Count, top + delta, rows)
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up {
      if highlightIndex <= 0 { return EventResult.Continue }
      highlightIndex = highlightIndex - 1
      top = Selection.ScrollIntoView(Options.Count, highlightIndex, top, rows)
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down {
      if highlightIndex >= Options.Count - 1 { return EventResult.Continue }
      highlightIndex = highlightIndex + 1
      top = Selection.ScrollIntoView(Options.Count, highlightIndex, top, rows)
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      setSelection(highlightIndex, true)
      setOpen(false)
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Escape {
      setOpen(false)
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ev.Button == MouseButton.Left {
      let list = listRect()
      if list.Contains(ev.Position) {
        let inner = list.Inset(CellInsets.All(1))
        let row = ev.Position.Row - inner.Row
        let idx = top + row
        if row >= 0 && row < inner.HeightRows && idx < Options.Count { setSelection(idx, true) }
      }
      setOpen(false)
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func setOpen(value bool) {
    if isOpen == value { return }
    isOpen = value
    if let callback = OnOpenChange { callback(value) }
  }

  private func listRect() CellRect {
    let view = TreeViewport
    let bottom = view.Row + view.HeightRows
    let below = Math.Max(0, bottom - Bounds.Row - Bounds.HeightRows)
    let above = Math.Max(0, Bounds.Row - view.Row)
    let wanted = Math.Min(Options.Count + 2, 8)
    let opensBelow = below >= wanted || below >= above
    let height = Math.Min(wanted, opensBelow ? below : above)
    let width = Math.Min(Math.Max(2, Bounds.WidthCells), view.WidthCells)
    return CellRect{
      Column: Math.Max(view.Column, Math.Min(Bounds.Column, view.Column + view.WidthCells - width)),
      Row: opensBelow ? Bounds.Row + Bounds.HeightRows : Bounds.Row - height,
      WidthCells: width,
      HeightRows: height,
    }
  }

  private func selectedOptionIndex() int32 {
    if Options.Count == 0 { return -1 }
    return selection.Index
  }

  private func normalizeSelection() {
    let normalized = clampIndex(selection.Index)
    if normalized == selection.Index { return }
    selection.Index = normalized
    selection.Change = nil
  }

  private func setSelection(want int32, emit bool) bool -> selection.Set(clampIndex(want), emit)

  private func clampIndex(value int32) int32 -> Selection.ClampIndex(Options.Count, value)
}
