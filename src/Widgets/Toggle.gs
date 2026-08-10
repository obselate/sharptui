package SharpTui

import System
import System.Collections.Generic

/// A checkbox that flips its checked state on Enter, space, or a click.
public open class Toggle : Box {
  private var text string
  private var isChecked bool
  private var checkedGlyph string
  private var uncheckedGlyph string

  /// The label drawn after the checkbox glyph.
  public prop Text string {
    get { return text }
    set { text = value }
  }

  /// The checked state, flipped by activation.
  public prop IsChecked bool {
    get { return isChecked }
    set { isChecked = value }
  }

  /// The glyph drawn when IsChecked is true.
  public prop CheckedGlyph string {
    get { return checkedGlyph }
    set { checkedGlyph = value }
  }

  /// The glyph drawn when IsChecked is false.
  public prop UncheckedGlyph string {
    get { return uncheckedGlyph }
    set { uncheckedGlyph = value }
  }

  /// Creates an unchecked, focusable toggle with default bracket glyphs.
  public init() {
    text = ""
    isChecked = false
    checkedGlyph = "[x] "
    uncheckedGlyph = "[ ] "
    CanFocus = true
  }

  /// Always true, so this toggle sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

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

  /// Flips IsChecked on Enter, space, or a click within the box.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, Continue otherwise.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      IsChecked = !IsChecked
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == " " {
      IsChecked = !IsChecked
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ContentBounds.Contains(ev.Position) {
      IsChecked = !IsChecked
      return EventResult.Handled
    }
    return EventResult.Continue
  }
}

/// One selectable option. A RadioGroup owns radio buttons and keeps them exclusive.
public open class RadioButton : Box {
  private var text string
  private var isSelected bool
  private var selectedGlyph string
  private var unselectedGlyph string
  private var owner RadioGroup?

  /// The label drawn after the radio glyph.
  public prop Text string {
    get { return text }
    set { text = value }
  }

  /// The selected state. Setting it true deselects the other buttons in the owning RadioGroup, if any.
  public prop IsSelected bool {
    get { return isSelected }
    set { setSelected(value) }
  }

  /// The glyph drawn when IsSelected is true.
  public prop SelectedGlyph string {
    get { return selectedGlyph }
    set { selectedGlyph = value }
  }

  /// The glyph drawn when IsSelected is false.
  public prop UnselectedGlyph string {
    get { return unselectedGlyph }
    set { unselectedGlyph = value }
  }

  /// Creates an unselected, focusable, unowned radio button with default parenthesis glyphs.
  public init() {
    text = ""
    isSelected = false
    selectedGlyph = "(o) "
    unselectedGlyph = "( ) "
    owner = nil
    CanFocus = true
  }

  /// Always true, so this button sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the button as the current glyph width plus the text width.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    let mark = IsSelected ? SelectedGlyph : UnselectedGlyph
    return CellSize{ WidthCells: Glyph.WidthOf(mark) + Glyph.WidthOf(Text), HeightRows: 1 }
  }

  /// Paints the current glyph followed by Text, filling the row with inverted ink when focused.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 { return }
    let mark = IsSelected ? SelectedGlyph : UnselectedGlyph
    let style = IsFocused ? ink.Inverted() : ink
    if IsFocused { screen.Fill(r, style) }
    screen.WriteClipped(r, 0, 0, mark, style)
    screen.WriteClipped(r, Glyph.WidthOf(mark), 0, Text, style)
  }

  /// Selects this button on Enter, space, or a click; already-selected buttons swallow the same inputs without changing state.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, Continue otherwise.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if IsSelected {
      if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter { return EventResult.Handled }
      if ev.Key == Key.Character && ev.Text == " " { return EventResult.Handled }
      if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ContentBounds.Contains(ev.Position) { return EventResult.Handled }
      return EventResult.Continue
    }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      IsSelected = true
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == " " {
      IsSelected = true
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ContentBounds.Contains(ev.Position) {
      IsSelected = true
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  internal prop Owner RadioGroup? { get { return owner } }

  internal func Attach(group RadioGroup) {
    owner = group
  }

  internal func SetSelectedFromGroup(value bool) {
    isSelected = value
  }

  private func setSelected(value bool) {
    if let group = owner {
      group.SetSelection(this, value)
      return
    }
    isSelected = value
  }
}

/// Owns radio buttons and keeps one selected button at a time.
public open class RadioGroup : Box {
  private var buttons List[RadioButton]
  private var selectedButton RadioButton?

  /// The currently selected button, or nil when none is selected.
  public prop SelectedButton RadioButton? {
    get {
      synchronize()
      return selectedButton
    }
  }

  /// Creates an empty radio group with no selection.
  public init() {
    buttons = List[RadioButton]()
    selectedButton = nil
  }

  /// Adds a radio button as a child and attaches it to this group. Throws if the button already belongs to another group.
  /// @param button The button to add.
  public func Add(button RadioButton) {
    synchronize()
    if contains(button) { return }
    Children.Add(button)
    attach(button)
  }

  /// Attaches any RadioButton children added directly rather than through Add.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    synchronize()
  }

  /// Selects button, deselecting every other button in the group. Throws if button does not belong to this group.
  /// @param button The button to select.
  public func Select(button RadioButton) {
    synchronize()
    selectButton(button)
  }

  /// Deselects every button in the group.
  public func ClearSelection() {
    synchronize()
    var i = 0
    while i < buttons.Count {
      buttons[i].SetSelectedFromGroup(false)
      i = i + 1
    }
    selectedButton = nil
  }

  internal func SetSelection(button RadioButton, value bool) {
    synchronize()
    if value {
      selectButton(button)
      return
    }
    button.SetSelectedFromGroup(false)
    if let selected = selectedButton {
      if Object.ReferenceEquals(selected, button) { selectedButton = nil }
    }
  }

  private func synchronize() {
    var i = 0
    while i < Children.Count {
      let child = Children[i]
      if child is RadioButton { attach(child) }
      i = i + 1
    }
  }

  private func attach(button RadioButton) {
    if contains(button) { return }
    if let group = button.Owner {
      throw InvalidOperationException("button already belongs to a RadioGroup")
    }
    buttons.Add(button)
    button.Attach(this)
    if button.IsSelected { selectButton(button) }
  }

  private func selectButton(button RadioButton) {
    if !contains(button) { throw ArgumentException("button") }
    var i = 0
    while i < buttons.Count {
      let candidate = buttons[i]
      candidate.SetSelectedFromGroup(Object.ReferenceEquals(candidate, button))
      i = i + 1
    }
    selectedButton = button
  }

  private func contains(button RadioButton) bool {
    var i = 0
    while i < buttons.Count {
      if Object.ReferenceEquals(buttons[i], button) { return true }
      i = i + 1
    }
    return false
  }
}
