package SharpTui

import System
import System.Collections.Generic

/// A checkbox that flips its checked state on Enter, space, or a click. A Toggle added to a
/// RadioGroup behaves as a radio button: selecting it deselects the group's other toggles, and
/// activating the already-checked one leaves it checked.
public open class Toggle : Box {
  private var text string
  private var isChecked bool
  private var checkedGlyph string
  private var uncheckedGlyph string
  /// Receives the checked value after this toggle is activated. Programmatic changes are silent.
  public prop OnChange Action[bool]? { get; set; }

  private var owner RadioGroup?

  /// The label drawn after the checkbox glyph.
  public prop Text string {
    get -> text
    set {
      if text == value { return }
      text = value
      MarkMeasureDirty()
    }
  }

  /// The checked state, flipped by activation.
  public prop IsChecked bool {
    get -> isChecked
    set {
      if let group = owner {
        group.SetSelection(this, value)
        return
      }
      SetCheckedFromGroup(value)
    }
  }

  /// The glyph drawn when IsChecked is true.
  public prop CheckedGlyph string {
    get -> checkedGlyph
    set {
      if checkedGlyph == value { return }
      checkedGlyph = value
      MarkMeasureDirty()
    }
  }

  /// The glyph drawn when IsChecked is false.
  public prop UncheckedGlyph string {
    get -> uncheckedGlyph
    set {
      if uncheckedGlyph == value { return }
      uncheckedGlyph = value
      MarkMeasureDirty()
    }
  }

  /// Creates an unchecked, focusable toggle with default bracket glyphs.
  public init() {
    text = ""
    isChecked = false
    checkedGlyph = "[x] "
    uncheckedGlyph = "[ ] "
    owner = nil
    CanFocus = true
  }

  /// Always true, so this toggle sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool -> true

  /// Measures the toggle as the current glyph width plus the text width.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    let mark = IsChecked ? CheckedGlyph : UncheckedGlyph
    return CellSize{ WidthCells: Glyph.WidthOf(mark) + Glyph.WidthOf(Text), HeightRows: 1 }
  }

  /// Paints the current glyph followed by Text, filling the row with inverted ink when focused.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 { return }
    let mark = IsChecked ? CheckedGlyph : UncheckedGlyph
    let style = IsFocused ? ink.Inverted() : ink
    if IsFocused { screen.Fill(r, style) }
    screen.WriteClipped(r, 0, 0, mark, style)
    screen.WriteClipped(r, Glyph.WidthOf(mark), 0, Text, style)
  }

  /// Flips IsChecked on Enter, space, or a click within the box; under a RadioGroup, activation
  /// selects this toggle instead of unchecking an already-checked one.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, Continue otherwise.
  protected open override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if inputHasWindowModifier(ev.Modifiers) { return EventResult.Continue }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      Activate()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == " " {
      Activate()
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ev.Button == MouseButton.Left && ContentBounds.Contains(ev.Position) {
      Activate()
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  internal prop Owner RadioGroup? -> owner

  internal func Attach(group RadioGroup) {
    owner = group
  }

  internal func SetCheckedFromGroup(value bool) {
    if isChecked == value { return }
    isChecked = value
    MarkMeasureDirty()
  }

  internal func Activate() {
    if let group = owner {
      if isChecked { return }
      group.Select(this)
      if let callback = OnChange { callback(true) }
      group.NotifySelection(this)
      return
    }
    SetCheckedFromGroup(!isChecked)
    if let callback = OnChange { callback(isChecked) }
  }

}

/// Owns Toggle children and keeps at most one checked at a time, radio-button style.
public open class RadioGroup : Box {
  private var toggles List[Toggle]
  /// Receives the activated radio choice. Programmatic selection is silent.
  public prop OnChange Action[Toggle]? { get; set; }

  private var selectedToggle Toggle?

  /// Whether options form a row with Left/Right navigation instead of a column with Up/Down. Defaults to false.
  public prop IsHorizontal bool {
    get -> LayoutAxis == Axis.Row
    set -> LayoutAxis = value ? Axis.Row : Axis.Column
  }

  /// The currently selected toggle, or nil when none is selected.
  public prop SelectedToggle Toggle? {
    get {
      synchronize()
      return selectedToggle
    }
  }

  /// Creates an empty radio group with no selection.
  public init() {
    toggles = List[Toggle]()
    selectedToggle = nil
  }

  /// Adds a toggle as a child and attaches it to this group. Throws if the toggle already belongs to another group.
  /// @param toggle The toggle to add.
  public func Add(toggle Toggle) {
    synchronize()
    if contains(toggle) { return }
    Children.Add(toggle)
    attach(toggle)
  }

  /// Attaches any Toggle children added directly rather than through Add.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    synchronize()
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind != UiEventKind.Key || inputIsRelease(ev) || inputHasWindowModifier(ev.Modifiers) {
      return EventResult.Continue
    }
    let previous = ev.Key == (IsHorizontal ? Key.Left : Key.Up)
    if !previous && ev.Key != (IsHorizontal ? Key.Right : Key.Down) { return EventResult.Continue }
    synchronize()
    var index = previous ? 0 : Children.Count - 1
    for i in 0 ... Children.Count {
      if Children[i].IsFocused { index = i }
    }
    var remaining = Children.Count
    while remaining > 0 {
      index = (index + (previous ? -1 : 1) + Children.Count) % Children.Count
      let child = Children[index]
      if child is Toggle && child.IsVisible && child.CanFocus {
        TreeRoot().Focus(child)
        child.Activate()
        return EventResult.Handled
      }
      remaining = remaining - 1
    }
    return EventResult.Continue
  }

  /// Selects toggle, deselecting every other toggle in the group. Throws if toggle does not belong to this group.
  /// @param toggle The toggle to select.
  public func Select(toggle Toggle) {
    synchronize()
    selectToggle(toggle)
  }

  /// Deselects every toggle in the group.
  public func ClearSelection() {
    synchronize()
    var i = 0
    while i < toggles.Count {
      toggles[i].SetCheckedFromGroup(false)
      i = i + 1
    }
    selectedToggle = nil
  }

  internal func NotifySelection(toggle Toggle) {
    if let callback = OnChange { callback(toggle) }
  }

  internal func SetSelection(toggle Toggle, value bool) {
    synchronize()
    if value {
      selectToggle(toggle)
      return
    }
    toggle.SetCheckedFromGroup(false)
    if let selected = selectedToggle {
      if Object.ReferenceEquals(selected, toggle) { selectedToggle = nil }
    }
  }

  private func synchronize() {
    var i = 0
    while i < Children.Count {
      let child = Children[i]
      if child is Toggle { attach(child) }
      i = i + 1
    }
  }

  private func attach(toggle Toggle) {
    if contains(toggle) { return }
    if let group = toggle.Owner {
      throw InvalidOperationException("toggle already belongs to a RadioGroup")
    }
    toggles.Add(toggle)
    toggle.Attach(this)
    if toggle.IsChecked { selectToggle(toggle) }
  }

  private func selectToggle(toggle Toggle) {
    if !contains(toggle) { throw ArgumentException("toggle") }
    var i = 0
    while i < toggles.Count {
      let candidate = toggles[i]
      candidate.SetCheckedFromGroup(Object.ReferenceEquals(candidate, toggle))
      i = i + 1
    }
    selectedToggle = toggle
  }

  private func contains(toggle Toggle) bool {
    var i = 0
    while i < toggles.Count {
      if Object.ReferenceEquals(toggles[i], toggle) { return true }
      i = i + 1
    }
    return false
  }
}
