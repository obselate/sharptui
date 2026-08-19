package SharpTui

/// A centered content host that paints above normal siblings and traps input.
public open class Overlay : Box {
  private var dimBackground bool
  private var defaultAction Box?
  private var cancelAction Box?
  private var previousFocus Box?
  private var focusActive bool

  /// The overlay's single child. Setting replaces any existing content; getting returns nil when
  /// the overlay is empty.
  public prop Content Box? {
    get { return Children.Count == 1 ? Children[0] : nil }
    set {
      Children.Clear()
      if value != nil {
        let child = value
        Children.Add(child)
      }
    }
  }

  /// Whether Render dims everything outside the overlay's bounds while it is open. Defaults to false.
  public prop DimBackground bool {
    get { return dimBackground }
    set { dimBackground = value }
  }

  /// The descendant offered Enter after focused content declines it.
  public prop DefaultAction Box? {
    get { return defaultAction }
    set { defaultAction = value }
  }

  /// The descendant offered Enter after Escape reaches the scope.
  public prop CancelAction Box? {
    get { return cancelAction }
    set { cancelAction = value }
  }

  /// Creates a centered overlay with background dimming off and no default or cancel action set.
  public init() {
    dimBackground = false
    defaultAction = nil
    cancelAction = nil
    previousFocus = nil
    focusActive = false
    Placement = Placement.Centered
  }

  /// Dims everything outside the overlay's bounds when DimBackground is set. Draws no other
  /// content itself.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if DimBackground { screen.DimOutside(Bounds) }
  }

  internal override func IsInputScope() bool {
    return IsVisible
  }

  internal override func PrepareInputScope() {
    activate()
  }

  /// Restores previously saved focus when the overlay closes, or traps focus inside the overlay
  /// when it opens while attached.
  /// @param isVisible True when the overlay just became visible, false when it just became hidden.
  protected override func VisibilityChanged(isVisible bool) {
    if !isVisible {
      deactivate()
      return
    }
    if IsAttached { activate() }
  }

  internal override func ScopeFallback(ev UiEvent) EventResult {
    if ev.Kind != UiEventKind.Key { return EventResult.Continue }
    if inputIsRelease(ev) { return EventResult.Continue }
    if ev.Key == Key.Enter { return invoke(DefaultAction) }
    if ev.Key == Key.Escape { return invoke(CancelAction) }
    return EventResult.Continue
  }

  private func activate() {
    if focusActive || !IsVisible { return }
    let root = TreeRoot()
    let focused = root.FocusedElement
    if focused != nil && !Contains(focused) { previousFocus = focused }
    else { previousFocus = nil }
    if !FocusFirst() { root.ClearFocus() }
    focusActive = true
  }

  private func deactivate() {
    if !focusActive { return }
    let root = TreeRoot()
    let saved = previousFocus
    if saved != nil {
      let previous = saved
      if previous.IsVisible && root.Contains(previous) { root.Focus(previous) }
    }
    previousFocus = nil
    focusActive = false
  }

  private func invoke(action Box?) EventResult {
    if action == nil { return EventResult.Continue }
    let target = action
    if !target.IsVisible || !Contains(target) { return EventResult.Continue }
    return DeliverTo(target, UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter })
  }
}
