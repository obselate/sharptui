package SharpTui

import System
import System.Collections.Generic

/// A push button: " Text " centred, flips ink when focused.
public open class Button : Box {
  private var text string
  private var onClick Action?

  /// The label centred within the button.
  public prop Text string {
    get -> text
    set {
      if text == value { return }
      text = value
      MarkMeasureDirty()
    }
  }

  /// Work invoked when the button is activated.
  public prop OnClick Action? {
    get -> onClick
    set -> onClick = value
  }

  /// Creates an empty, focusable button.
  public init() {
    text = ""
    onClick = nil
    CanFocus = true
  }

  /// Always true, so this button sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool -> true

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

  /// Invokes OnClick on Enter, space, or a click within its bounds.
  /// @param ev The input event to handle.
  /// @returns Handled when the button was pressed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    if inputHasWindowModifier(ev.Modifiers) { return EventResult.Continue }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter {
      press()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == " " {
      press()
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ev.Button == MouseButton.Left && ContentBounds.Contains(ev.Position) {
      press()
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func press() {
    if onClick != nil { onClick!!() }
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

/// A centered, dimmed modal overlay with a wrapped message and adaptive action buttons.
/// Stacked actions that exceed the available content rows are clipped.
public open class Dialog : Overlay {
  private var message string
  private var actions List[DialogAction]
  private var actionButtons List[Button]
  private var onResult Action[DialogAction]?
  private var body TextBlock
  private var actionHost Box
  private var preferredWidth CellLength
  private var assignedWidth CellLength
  private var wrappedWidth int32
  private var wrappedMessage string
  private var messageRows int32

  /// The wrapped body text. Setting it rebuilds the dialog's children.
  public prop Message string {
    get -> message
    set {
      message = value
      compose()
    }
  }

  /// The actions offered as buttons, in display order. Setting it rebuilds the dialog's children.
  public prop Actions List[DialogAction] {
    get -> actions
    set {
      actions = value
      compose()
    }
  }

  /// Work invoked with the selected action.
  public prop OnResult Action[DialogAction]? {
    get -> onResult
    set -> onResult = value
  }

  /// Creates a centered, dimmed, bordered dialog with no message or actions.
  public init() {
    message = ""
    actions = List[DialogAction]()
    actionButtons = List[Button]()
    onResult = nil
    body = TextBlock{ Grow: 0 }
    actionHost = Box()
    preferredWidth = CellLength.Cells(44)
    assignedWidth = preferredWidth
    wrappedWidth = -1
    wrappedMessage = ""
    messageRows = 0
    DimBackground = true
    Placement = Placement.Centered
    ShowBorder = true
    Width = CellLength.Cells(44)
    Padding = CellInsets.All(1)
    compose()
  }
  internal override prop ClipChildren bool -> true

  /// Rebuilds the message and action buttons if Actions changed shape, otherwise refreshes the default/cancel button assignment.
  protected override func PrepareLayout() {
    if !compositionIsCurrent() { compose() }
    else { configureActions() }
    let view = TreeViewport
    if Width.IsAuto != assignedWidth.IsAuto || Width.CellCount != assignedWidth.CellCount { preferredWidth = Width }
    let width = Math.Min(view.WidthCells, preferredWidth.IsAuto ? view.WidthCells : preferredWidth.CellCount)
    assignedWidth = CellLength.Cells(Math.Max(0, width))
    if Width.IsAuto || Width.CellCount != assignedWidth.CellCount { Width = assignedWidth }
    let edges = (ShowBorder ? 2 : 0)
    let contentWidth = Math.Max(0, width - edges - Padding.LeftCells - Padding.RightCells)
    let availableRows = Math.Max(0, view.HeightRows - edges - Padding.TopRows - Padding.BottomRows)
    if wrappedWidth != contentWidth || wrappedMessage != Message {
      messageRows = Message == "" || contentWidth <= 0 ? 0 : CellText.Wrap(Message, contentWidth).Count
      wrappedWidth = contentWidth
      wrappedMessage = Message
    }
    var totalWidth = 0
    var actionIndex = 0
    while actionIndex < actionButtons.Count {
      totalWidth = totalWidth + Glyph.WidthOf(actionButtons[actionIndex].Text) + 2
      actionIndex = actionIndex + 1
    }
    if actionButtons.Count > 1 { totalWidth = totalWidth + (actionButtons.Count - 1) * 2 }
    let stacked = totalWidth > contentWidth
    let axis = stacked ? Axis.Column : Axis.Row
    let gap = stacked ? 0 : 2
    if actionHost.LayoutAxis != axis { actionHost.LayoutAxis = axis }
    if actionHost.Gap != gap { actionHost.Gap = gap }
    let actionRows = Math.Min(availableRows, stacked ? actionButtons.Count : (actionButtons.Count > 0 ? 1 : 0))
    let bodyRows = Math.Min(messageRows, Math.Max(0, availableRows - actionRows))
    if body.Height.IsAuto || body.Height.CellCount != bodyRows { body.Height = CellLength.Cells(bodyRows) }
    if body.Width.IsAuto || body.Width.CellCount != contentWidth { body.Width = CellLength.Cells(contentWidth) }
    if actionHost.Height.IsAuto || actionHost.Height.CellCount != actionRows { actionHost.Height = CellLength.Cells(actionRows) }
    if actionHost.Width.IsAuto || actionHost.Width.CellCount != contentWidth { actionHost.Width = CellLength.Cells(contentWidth) }
    let height = bodyRows + actionRows + edges + Padding.TopRows + Padding.BottomRows
    if Height.IsAuto || Height.CellCount != height { Height = CellLength.Cells(height) }
  }

  /// Scrolls the message within this dialog.
  /// @param ev The input event to handle.
  /// @returns Handled when a local scroll was requested.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) || inputHasWindowModifier(ev.Modifiers) { return EventResult.Continue }
    if ev.Kind == UiEventKind.Key && (ev.Key == Key.PageUp || ev.Key == Key.PageDown) {
      body.ScrollToLine(Selection.ClampScroll(messageRows,
        body.FirstVisibleLine + (ev.Key == Key.PageUp ? -body.ContentBounds.HeightRows : body.ContentBounds.HeightRows),
        body.ContentBounds.HeightRows))
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func compose() {
    if actions == nil || actionButtons == nil { return }
    Children.Clear()
    actionButtons.Clear()
    body.Text = Message
    Children.Add(body)
    actionHost.Children.Clear()
    for action in Actions {
      let button = Button{ Text: action.Text }
      button.OnClick = () -> choose(action)
      actionButtons.Add(button)
      actionHost.Children.Add(button)
    }
    Children.Add(actionHost)
    wrappedWidth = -1
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
