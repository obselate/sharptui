package SharpTui

import System
import System.Collections.Generic

/// A push button: " Text " centred, flips ink when focused.
public open class Button : Box {
  private var text string
  private var onPress Action?

  /// The label centred within the button.
  public prop Text string {
    get { return text }
    set { text = value }
  }

  /// Work invoked when the button is activated.
  public prop OnPress Action? {
    get { return onPress }
    set { onPress = value }
  }

  /// Creates an empty, focusable button.
  public init() {
    text = ""
    onPress = nil
    CanFocus = true
  }

  /// Always true, so this button sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the button as the text width plus one cell of padding on each side.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    return CellSize{ WidthCells: Glyph.WidthOf(Text) + 2, HeightRows: 1 }
  }

  /// Paints " Text " centred within the box, with ink flipped when focused.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 { return }
    let style = IsFocused ? ink.Inverted() : ink
    let textWidth = Glyph.WidthOf(Text)
    var x = (r.WidthCells - textWidth - 2) / 2
    if x < 0 { x = 0 }
    screen.WriteClipped(r, x, 0, " ", style)
    screen.WriteClipped(r, x + 1, 0, Text, style)
    screen.WriteClipped(r, x + textWidth + 1, 0, " ", style)
  }

  /// Invokes OnPress on Enter, space, or a click within its bounds.
  /// @param ev The input event to handle.
  /// @returns Handled when the button was pressed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      press()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == " " {
      press()
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ContentBounds.Contains(ev.Position) {
      press()
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func press() {
    if onPress != nil { onPress!!() }
  }
}

/// One choice offered by a Dialog, rendered as a button.
public class DialogAction {
  /// The label shown on the action's button.
  public prop Text string { get; set; }
  /// When true, this action is the one activated by Escape.
  public prop IsCancel bool { get; set; }

  /// Creates a non-cancel action with an empty label.
  public init() {
    Text = ""
    IsCancel = false
  }
}

/// A centered, dimmed modal overlay showing a message and a row of action buttons.
public open class Dialog : Overlay {
  private var message string
  private var actions List[DialogAction]
  private var actionButtons List[Button]
  private var onResult Action[DialogAction]?

  /// The wrapped body text. Setting it rebuilds the dialog's children.
  public prop Message string {
    get { return message }
    set {
      message = value
      compose()
    }
  }

  /// The actions offered as buttons, in display order. Setting it rebuilds the dialog's children.
  public prop Actions List[DialogAction] {
    get { return actions }
    set {
      actions = value
      compose()
    }
  }

  /// Work invoked with the selected action.
  public prop OnResult Action[DialogAction]? {
    get { return onResult }
    set { onResult = value }
  }

  /// Creates a centered, dimmed, bordered dialog with no message or actions.
  public init() {
    message = ""
    actions = List[DialogAction]()
    actionButtons = List[Button]()
    onResult = nil
    DimBackground = true
    Placement = Placement.Centered
    ShowBorder = true
    Width = CellLength.Cells(44)
    Padding = CellInsets.All(1)
  }

  /// Rebuilds the message and action buttons if Actions changed shape, otherwise refreshes the default/cancel button assignment.
  protected override func PrepareLayout() {
    if !compositionIsCurrent() { compose() }
    else { configureActions() }
  }

  private func compose() {
    if actions == nil || actionButtons == nil { return }
    Children.Clear()
    actionButtons.Clear()
    for line in CellText.Wrap(Message, 40) {
      Children.Add(Label{ Text: line })
    }
    let row = Row{ GapCells: 2 }
    for action in Actions {
      let button = Button{ Text: action.Text }
      button.OnPress = () -> choose(action)
      actionButtons.Add(button)
      row.Children.Add(button)
    }
    Children.Add(row)
    configureActions()
  }

  private func configureActions() {
    DefaultAction = nil
    CancelAction = nil
    var i = 0
    while i < actionButtons.Count && i < Actions.Count {
      let button = actionButtons[i]
      let action = Actions[i]
      if DefaultAction == nil && !action.IsCancel { DefaultAction = button }
      if action.IsCancel { CancelAction = button }
      i = i + 1
    }
    if DefaultAction == nil && actionButtons.Count > 0 { DefaultAction = actionButtons[0] }
    if CancelAction == nil && actionButtons.Count > 0 {
      CancelAction = actionButtons[actionButtons.Count - 1]
    }
  }

  private func choose(action DialogAction) {
    if onResult != nil { onResult!!(action) }
  }

  private func compositionIsCurrent() bool {
    if actionButtons.Count != Actions.Count { return false }
    var i = 0
    while i < Actions.Count {
      if actionButtons[i].Text != Actions[i].Text { return false }
      i = i + 1
    }
    return true
  }
}
