package SharpTui

import System
import System.Collections.Generic
import Facebook.Yoga

internal enum Axis { Row, Column }

/// The base element. Everything drawable is a Box, so everything nests.
public open class Box {
  private var axis Axis
  private var bounds CellRect
  private var gapCells int32
  private var padding CellInsets
  private var growWeight int32
  private var flexShrink float32
  private var width CellLength
  private var height CellLength
  private var style Style
  private var focusedStyle Style
  private var showBorder bool
  private var placement Placement
  private var showScrollbar bool
  private var canFocus bool
  private var canReceiveMouse bool
  private var isFocused bool
  private var isVisible bool
  private var children List[Box]
  private var title string

  private var yoga Facebook.Yoga.Node?
  private var config Facebook.Yoga.Config?
  private var measureCallback Facebook.Yoga.YGMeasureFunc?
  private var measureInstalled bool
  private var layoutStyleDirty bool
  private var childVisibilityDirty bool
  private var linked List[Box]
  private var treeChildren List[Box]
  private var parent Box?
  private var mouseCapture Box?

  /// The box's rectangle in screen cells after the last layout pass. Zero-valued when not visible.
  public prop Bounds CellRect { get { return bounds } }

  /// Cells of gap inserted between children along the layout axis. Must be non-negative; defaults to 0.
  public prop GapCells int32 {
    get { return gapCells }
    set {
      if value < 0 { throw ArgumentOutOfRangeException("GapCells") }
      gapCells = value
      layoutStyleDirty = true
    }
  }

  /// Inner spacing between the border or edge and content on each side. Defaults to CellInsets.None.
  public prop Padding CellInsets {
    get { return padding }
    set {
      padding = value
      layoutStyleDirty = true
    }
  }

  /// Flex-grow weight used by the immediate in-flow parent to distribute leftover space among
  /// siblings. It does not make this box's ancestors grow: each auto-sized ancestor on a path
  /// that should receive spare width or height needs its own GrowWeight (or an explicit size).
  /// Must be non-negative; defaults to 0.
  public prop GrowWeight int32 {
    get { return growWeight }
    set {
      if value < 0 { throw ArgumentOutOfRangeException("GrowWeight") }
      growWeight = value
      layoutStyleDirty = true
    }
  }

  /// Lets an internal leaf relinquish intrinsic main-axis size when its parent is smaller.
  internal prop FlexShrink float32 {
    get { return flexShrink }
    set {
      if value < 0.0F { throw ArgumentOutOfRangeException("FlexShrink") }
      flexShrink = value
      layoutStyleDirty = true
    }
  }

  /// The box's width. CellLength.Auto sizes it from content; defaults to Auto.
  public prop Width CellLength {
    get { return width }
    set {
      width = value
      layoutStyleDirty = true
    }
  }

  /// The box's height. CellLength.Auto sizes it from content; defaults to Auto.
  public prop Height CellLength {
    get { return height }
    set {
      height = value
      layoutStyleDirty = true
    }
  }

  /// The style used for this box's own fill, border, and title when unfocused. Foreground and
  /// background marked IsInherited fall back to the parent's resolved style.
  public prop Style Style {
    get { return style }
    set { style = value }
  }

  /// The style merged over Style while this exact box is focused. Focus held by a descendant does
  /// not activate an ancestor's FocusedStyle; use FocusedElement to observe descendant focus when
  /// pane chrome must reflect which nested control is active. Foreground and background marked
  /// IsInherited fall back to the unfocused resolved style.
  public prop FocusedStyle Style {
    get { return focusedStyle }
    set { focusedStyle = value }
  }

  /// Whether a one-cell border is drawn around the box, consuming one cell of padding on each side.
  /// Defaults to false.
  public prop ShowBorder bool {
    get { return showBorder }
    set {
      showBorder = value
      layoutStyleDirty = true
    }
  }

  /// Text drawn along the top edge, inside the border if ShowBorder is set or on its own row
  /// otherwise. Empty string draws nothing.
  public prop Title string {
    get { return title }
    set {
      title = value
      layoutStyleDirty = true
    }
  }

  /// Whether this box lays out in flow with siblings or is positioned absolutely. Defaults to
  /// Placement.InFlow.
  public prop Placement Placement {
    get { return placement }
    set {
      placement = value
      layoutStyleDirty = true
    }
  }

  /// Whether a vertical scrollbar is drawn against overflowing content. Reserves a column of
  /// padding on the right edge when ShowBorder is false. Defaults to false.
  public prop ShowScrollbar bool {
    get { return showScrollbar }
    set {
      if showScrollbar == value { return }
      showScrollbar = value
      layoutStyleDirty = true
    }
  }

  /// Whether this box can receive keyboard focus. Defaults to false.
  protected prop CanFocus bool {
    get { return canFocus }
    set { canFocus = value }
  }

  /// Whether this box counts as a mouse hit target even when it cannot take focus. Defaults to false.
  protected prop CanReceiveMouse bool {
    get { return canReceiveMouse }
    set { canReceiveMouse = value }
  }

  /// Attempts to capture all subsequent mouse events for this box until released. Fails and
  /// returns false if the box is detached, hidden, or outside the active input scope.
  /// @returns True when mouse capture was acquired.
  protected func CaptureMouse() bool {
    let root = TreeRoot()
    let activeScope = root.topInputScope()
    root.synchronizeMouseCapture(activeScope)
    if !IsAttached || !root.IsVisible || !root.owns(this) { return false }
    if activeScope != nil && !activeScope.owns(this) { return false }
    let captured = root.mouseCapture
    if captured != nil && !Object.ReferenceEquals(captured, this) {
      root.clearMouseCapture(true)
    }
    root.mouseCapture = this
    return true
  }

  /// Releases mouse capture held by this box, if any.
  protected func ReleaseMouseCapture() {
    let root = TreeRoot()
    if Object.ReferenceEquals(root.mouseCapture, this) { root.mouseCapture = nil }
  }

  /// Whether this box currently holds mouse capture.
  protected prop HasMouseCapture bool {
    get {
      let root = TreeRoot()
      root.synchronizeMouseCapture(root.topInputScope())
      return Object.ReferenceEquals(root.mouseCapture, this)
    }
  }

  /// Called when mouse capture is released or reassigned away from this box. Does nothing by
  /// default; widgets that need to react override it.
  protected open func MouseCaptureLost() {
  }

  /// Whether this box currently holds keyboard focus.
  public prop IsFocused bool { get { return isFocused } }

  /// Whether this box and descendants participate in layout, drawing, input, and scrollbars.
  public prop IsVisible bool {
    get { return isVisible }
    set {
      if isVisible == value { return }
      let root = TreeRoot()
      if !value { root.clearMouseCaptureFor(this) }
      let lostFocus = !value && containsFocused()
      isVisible = value
      let owner = parent
      if owner != nil {
        let linkedOwner = owner
        linkedOwner.childVisibilityDirty = true
      }
      if lostFocus {
        if !root.FocusNext() { root.ClearFocus() }
      }
      VisibilityChanged(isVisible)
      root.synchronizeMouseCapture(root.topInputScope())
    }
  }

  /// The direct children, in paint and layout order. Replacing the list detaches boxes that are
  /// no longer present and resynchronizes mouse capture.
  public prop Children List[Box] {
    get { return children }
    set {
      children = value
      childVisibilityDirty = true
      synchronizeChildren()
      let root = TreeRoot()
      if root.mouseCapture != nil { root.synchronizeMouseCapture(root.topInputScope()) }
    }
  }

  /// The box's bounds after border, padding, scrollbar gutter, and title row are subtracted, in
  /// that order. What Render and children draw into.
  public prop ContentBounds CellRect { get { return contentBounds() } }

  /// Creates an empty, visible box with column layout, no border, and default style; auto-sized
  /// and detached from any parent.
  public init() {
    axis = Axis.Column
    bounds = CellRect{}
    gapCells = 0
    padding = CellInsets.None
    growWeight = 0
    flexShrink = 0.0F
    width = CellLength.Auto
    height = CellLength.Auto
    style = Style()
    focusedStyle = Style()
    showBorder = false
    title = ""
    placement = Placement.InFlow
    showScrollbar = false
    canFocus = false
    canReceiveMouse = false
    isFocused = false
    isVisible = true
    children = List[Box]()
    linked = List[Box]()
    treeChildren = List[Box]()
    yoga = nil
    config = nil
    measureCallback = nil
    measureInstalled = false
    layoutStyleDirty = true
    childVisibilityDirty = false
    parent = nil
    mouseCapture = nil
  }

  internal prop LayoutAxis Axis {
    get { return axis }
    set {
      axis = value
      layoutStyleDirty = true
    }
  }

  /// Lays the tree out in a cell rectangle and fills every Bounds.
  internal func Compute(width int32, height int32) {
    if !IsVisible {
      clearBounds()
      return
    }
    linkTree(nil)
    synchronizeMouseCapture(topInputScope())
    if config == nil {
      let fresh = YGConfigAPI.YGConfigNew()
      YGConfigAPI.YGConfigSetPointScaleFactor(fresh, 1.0F)
      config = fresh
    }
    guard let cfg = config else { return }

    prepareTree(nil)
    build(cfg)
    guard let root = yoga else { return }
    YGNodeAPI.YGNodeCalculateLayout(root, float32(width), float32(height), YGDirection.LTR)
    read(0.0F, 0.0F, CellRect{ WidthCells: width, HeightRows: height })
  }

  /// Lays out and draws the whole tree.
  /// @param screen The screen to paint into.
  public func Draw(screen Screen) {
    if !IsVisible { return }
    Compute(screen.Size.WidthCells, screen.Size.HeightRows)
    paintTree(screen, screen.DefaultStyle)
  }

  /// Routes one event through the tree. Call this on the root.
  /// @param ev The event to route.
  /// @returns Handled when a box consumed the event, Exit to quit, otherwise Continue.
  public func Handle(ev UiEvent) EventResult {
    linkTree(nil)
    let inputScope = topInputScope()
    synchronizeMouseCapture(inputScope)
    if ev.Kind == UiEventKind.Mouse && (ev.Mouse == MouseKind.Move || ev.Mouse == MouseKind.Release) {
      let captured = mouseCapture
      if captured != nil {
        let target = captured
        return routeCapturedMouse(target, ev)
      }
    }
    if inputScope != nil { return inputScope.routeScope(ev) }
    if ev.Key == Key.Tab && !inputIsRelease(ev) { return FocusNext() ? EventResult.Handled : EventResult.Continue }
    if ev.Key == Key.BackTab && !inputIsRelease(ev) { return FocusPrevious() ? EventResult.Handled : EventResult.Continue }

    if ev.Kind == UiEventKind.Mouse {
      return routeMouse(ev)
    }

    var target = FocusedElement
    if target == nil && (ev.Kind == UiEventKind.Key || ev.Kind == UiEventKind.TextInput
        || ev.Kind == UiEventKind.Paste) {
      FocusNext()
      target = FocusedElement
    }
    guard let focused = target else { return Accept(ev) }
    return offerPath(focused, ev)
  }

  /// Moves focus to the next focusable box in tree order, wrapping around. Returns false if no
  /// box can take focus.
  /// @returns True when a focusable box was found.
  public func FocusNext() bool {
    return moveFocus(1)
  }

  /// Moves focus to the previous focusable box in tree order, wrapping around. Returns false if
  /// no box can take focus.
  /// @returns True when a focusable box was found.
  public func FocusPrevious() bool {
    return moveFocus(-1)
  }

  /// Moves focus directly to the given box, clearing focus everywhere else in the tree.
  /// @param target The box to give focus to.
  public func Focus(target Box) {
    TreeRoot().clearFocus()
    let all = List[Box]()
    collect(all)
    for box in all {
      box.isFocused = Object.ReferenceEquals(box, target)
    }
  }

  /// The visible focusable descendant that currently holds focus, or nil if none.
  public prop FocusedElement Box? { get { return findFocused() } }

  internal func TreeRoot() Box {
    var root = this
    while root.parent != nil {
      guard let next = root.parent else { break }
      root = next
    }
    return root
  }

  internal prop IsAttached bool { get { return parent != nil } }

  internal func ClearFocus() {
    clearFocus()
  }

  internal func FocusFirst() bool {
    let all = List[Box]()
    collect(all)
    if all.Count == 0 { return false }
    TreeRoot().Focus(all[0])
    return true
  }

  internal func Contains(target Box) bool {
    return owns(target)
  }

  internal func DeliverTo(target Box, ev UiEvent) EventResult {
    if !owns(target) { return EventResult.Continue }
    return offerPath(target, ev)
  }

  internal open func IsInputScope() bool {
    return false
  }

  internal open func ScopeFallback(ev UiEvent) EventResult {
    return EventResult.Continue
  }

  internal open func PrepareInputScope() {
  }

  /// Draws this box's own content. Containers draw nothing.
  protected open func Render(screen Screen, bounds CellRect, style Style) {
  }

  /// Takes an event, or does not. Containers take nothing.
  protected open func Accept(ev UiEvent) EventResult {
    return EventResult.Continue
  }

  /// Total content rows. Scrolling widgets override this.
  protected open func ScrollExtentRows() int32 {
    return 0
  }

  /// First visible content row. Scrolling widgets override this.
  protected open func ScrollOffsetRows() int32 {
    return 0
  }

  /// Returns this childless box's natural content size given optional width and height
  /// constraints (nil means unconstrained). Only consulted when MeasuresIntrinsic is true.
  protected open func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    return CellSize{}
  }

  /// Whether this box, when it has no children, sizes itself via MeasureIntrinsic instead of
  /// relying only on Width and Height. Defaults to false.
  protected open prop MeasuresIntrinsic bool { get { return false } }

  /// Called once per layout pass, before children are prepared, so a box can update its own
  /// layout-affecting state. Does nothing by default.
  protected open func PrepareLayout() {
  }

  /// Called after this box enters or leaves the visible tree.
  protected open func VisibilityChanged(isVisible bool) {
  }

  private func moveFocus(n int32) bool {
    let all = List[Box]()
    collect(all)
    if all.Count == 0 { return false }

    var at = -1
    for i in 0 ... all.Count {
      if all[i].IsFocused { at = i }
    }
    var next = at < 0 ? (n > 0 ? 0 : all.Count - 1) : (at + n) % all.Count
    if next < 0 { next = next + all.Count }
    TreeRoot().Focus(all[next])
    return true
  }

  private func findFocused() Box? {
    if !IsVisible { return nil }
    if IsFocused && CanFocus { return this }
    for kid in Children {
      let found = kid.findFocused()
      if found != nil { return found }
    }
    return nil
  }

  private func under(column int32, row int32) Box? {
    if !IsVisible { return nil }
    if !Bounds.Contains(column, row) { return nil }
    var i = Children.Count - 1
    while i >= 0 {
      let found = Children[i].under(column, row)
      if found != nil { return found }
      i = i - 1
    }
    return CanFocus || CanReceiveMouse ? this : nil
  }

  private func routeMouse(ev UiEvent) EventResult {
    let hit = under(ev.Position.Column, ev.Position.Row)
    guard let target = hit else {
      return Bounds.Contains(ev.Position) ? Accept(ev) : EventResult.Continue
    }

    if ev.Mouse == MouseKind.Press && target.CanFocus { Focus(target) }
    return offerPath(target, ev)
  }

  private func routeCapturedMouse(target Box, ev UiEvent) EventResult {
    let result = target.offerCapturedPath(ev)
    if ev.Mouse == MouseKind.Release && Object.ReferenceEquals(mouseCapture, target) {
      mouseCapture = nil
    }
    return result
  }

  private func routeScope(ev UiEvent) EventResult {
    if ev.Key == Key.Tab && !inputIsRelease(ev) {
      FocusNext()
      return EventResult.Handled
    }
    if ev.Key == Key.BackTab && !inputIsRelease(ev) {
      FocusPrevious()
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse { return routeScopeMouse(ev) }

    var target = FocusedElement
    if target == nil && (ev.Kind == UiEventKind.Key || ev.Kind == UiEventKind.TextInput
        || ev.Kind == UiEventKind.Paste) {
      FocusNext()
      target = FocusedElement
    }

    var result = EventResult.Continue
    if target != nil { result = offerPath(target, ev) }
    if result == EventResult.Continue { result = ScopeFallback(ev) }
    return result == EventResult.Continue ? EventResult.Handled : result
  }

  private func routeScopeMouse(ev UiEvent) EventResult {
    let hit = under(ev.Position.Column, ev.Position.Row)
    if hit == nil {
      let fallback = ScopeFallback(ev)
      return fallback == EventResult.Continue ? EventResult.Handled : fallback
    }
    if ev.Mouse == MouseKind.Press && hit.CanFocus { TreeRoot().Focus(hit) }
    let result = offerPath(hit, ev)
    return result == EventResult.Continue ? EventResult.Handled : result
  }

  private func offerPath(target Box, ev UiEvent) EventResult {
    if Object.ReferenceEquals(this, target) { return Accept(ev) }
    for child in Children {
      if child.owns(target) {
        let result = child.offerPath(target, ev)
        if result != EventResult.Continue { return result }
        return Accept(ev)
      }
    }
    return EventResult.Continue
  }

  private func offerCapturedPath(ev UiEvent) EventResult {
    let result = Accept(ev)
    if result != EventResult.Continue { return result }
    let owner = parent
    if owner == nil { return EventResult.Continue }
    return owner.offerCapturedPath(ev)
  }

  private func owns(target Box) bool {
    if !IsVisible { return false }
    if Object.ReferenceEquals(this, target) { return true }
    var child = 0
    while child < Children.Count {
      if Children[child].owns(target) { return true }
      child = child + 1
    }
    return false
  }

  private func synchronizeMouseCapture(activeScope Box?) {
    let target = mouseCapture
    if target == nil { return }
    let captured = target
    if !IsVisible || !owns(captured) || (activeScope != nil && !activeScope.owns(captured)) {
      clearMouseCapture(true)
    }
  }

  private func clearMouseCapture(notify bool) {
    let target = mouseCapture
    mouseCapture = nil
    if notify && target != nil {
      let captured = target
      captured.MouseCaptureLost()
    }
  }

  private func clearMouseCaptureFor(subtree Box) {
    let target = mouseCapture
    if target == nil { return }
    let captured = target
    if Object.ReferenceEquals(subtree, captured) || subtree.owns(captured)
        || subtree.containsRetained(captured) {
      clearMouseCapture(true)
    }
  }

  private func synchronizeChildren() {
    if sameChildList(treeChildren) { return }

    var old = 0
    while old < treeChildren.Count {
      let prior = treeChildren[old]
      if !containsChild(prior) { prior.detachTree() }
      old = old + 1
    }
    treeChildren.Clear()
    var current = 0
    while current < Children.Count {
      treeChildren.Add(Children[current])
      current = current + 1
    }
  }

  /// True when list holds exactly the current Children, by reference, in order.
  private func sameChildList(list List[Box]) bool {
    if list.Count != Children.Count { return false }
    var child = 0
    while child < Children.Count {
      if !Object.ReferenceEquals(list[child], Children[child]) { return false }
      child = child + 1
    }
    return true
  }

  private func containsChild(target Box) bool {
    var child = 0
    while child < Children.Count {
      if Object.ReferenceEquals(Children[child], target) { return true }
      child = child + 1
    }
    return false
  }

  private func containsRetained(target Box) bool {
    var current = target
    while current.parent != nil {
      guard let owner = current.parent else { return false }
      if Object.ReferenceEquals(owner, this) { return true }
      current = owner
    }
    return false
  }

  private func detachTree() {
    let root = TreeRoot()
    root.clearMouseCaptureFor(this)
    clearFocus()

    var old = 0
    while old < treeChildren.Count {
      treeChildren[old].detachTree()
      old = old + 1
    }
    var current = 0
    while current < Children.Count {
      let child = Children[current]
      if !hasTreeChild(child) { child.detachTree() }
      current = current + 1
    }
    parent = nil
  }

  private func hasTreeChild(target Box) bool {
    var child = 0
    while child < treeChildren.Count {
      if Object.ReferenceEquals(treeChildren[child], target) { return true }
      child = child + 1
    }
    return false
  }

  private func collect(into List[Box]) {
    if !IsVisible { return }
    if CanFocus { into.Add(this) }
    for kid in Children {
      kid.collect(into)
    }
  }

  private func contentBounds() CellRect {
    var result = Bounds
    if ShowBorder { result = result.Inset(CellInsets.All(1)) }
    result = result.Inset(Padding)
    if ShowScrollbar && !ShowBorder {
      result = result.Inset(CellInsets{ RightCells: 1 })
    }
    if Title != "" && !ShowBorder {
      var height = result.HeightRows - 1
      if height < 0 { height = 0 }
      result = CellRect{
        Column: result.Column,
        Row: result.Row + 1,
        WidthCells: result.WidthCells,
        HeightRows: height,
      }
    }
    return result
  }

  private func paintTree(screen Screen, inherited Style) {
    if !IsVisible { return }
    let resolvedStyle = Style.MergedOver(inherited)

    let chrome = IsFocused ? FocusedStyle.MergedOver(resolvedStyle) : resolvedStyle

    let frame = Bounds
    if !Style.Background.IsInherited || ShowBorder {
      screen.Fill(frame, resolvedStyle)
    }
    if ShowBorder {
      screen.DrawBorder(frame, chrome)
    }
    if Title != "" {
      if ShowBorder {
        screen.WriteCell(frame.Column + 1, frame.Row, " ", chrome)
        screen.WriteClipped(frame, 2, 0, Title, chrome)
        let after = 2 + Glyph.WidthOf(Title)
        if after < frame.WidthCells { screen.WriteCell(frame.Column + after, frame.Row, " ", chrome) }
      } else {
        screen.WriteClipped(frame, 1, 0, Title, chrome)
      }
    }

    Render(screen, ContentBounds, resolvedStyle)
    if ShowScrollbar { bar(screen, chrome) }
    paintChildren(screen, resolvedStyle)
  }

  private func paintChildren(screen Screen, inherited Style) {
    var child = 0
    var hasScope = false
    while child < Children.Count {
      let next = Children[child]
      if next.IsInputScope() { hasScope = true }
      else { next.paintTree(screen, inherited) }
      child = child + 1
    }
    if !hasScope { return }
    child = 0
    while child < Children.Count {
      let next = Children[child]
      if next.IsInputScope() { next.paintTree(screen, inherited) }
      child = child + 1
    }
  }

  private func scroller() Box {
    if ScrollExtentRows() > 0 { return this }
    for kid in Children {
      if !kid.IsVisible { continue }
      let found = kid.scroller()
      if found.ScrollExtentRows() > 0 { return found }
    }
    return this
  }

  private func clearFocus() {
    isFocused = false
    for kid in Children {
      kid.clearFocus()
    }
  }

  private func containsFocused() bool {
    if isFocused { return true }
    for kid in Children {
      if kid.containsFocused() { return true }
    }
    return false
  }

  private func topInputScope() Box? {
    if !IsVisible { return nil }
    var child = Children.Count - 1
    while child >= 0 {
      let nested = Children[child].topInputScope()
      if nested != nil { return nested }
      child = child - 1
    }
    return IsInputScope() ? this : nil
  }

  private func bar(screen Screen, ink Style) {
    let src = scroller()
    let view = src.ContentBounds
    let total = src.ScrollExtentRows()
    if view.HeightRows <= 0 || total <= view.HeightRows { return }

    let frame = Bounds
    let ownView = ContentBounds
    let column = ShowBorder ? frame.Column + frame.WidthCells - 1 : ownView.Column + ownView.WidthCells
    var size = view.HeightRows * view.HeightRows / total
    if size < 1 { size = 1 }
    var at = src.ScrollOffsetRows() * (view.HeightRows - size) / (total - view.HeightRows)
    if at < 0 { at = 0 }
    if at > view.HeightRows - size { at = view.HeightRows - size }

    for i in 0 ... view.HeightRows {
      let on = i >= at && i < at + size
      screen.WriteCell(column, view.Row + i,
        on ? "█" : "│", ink)
    }
  }

  private func build(config Facebook.Yoga.Config) {
    if !IsVisible { return }
    if yoga == nil {
      yoga = YGNodeAPI.YGNodeNewWithConfig(config)
    }
    guard let node = yoga else { return }

    if layoutStyleDirty {
      let left = Padding.LeftCells + (ShowBorder ? 1 : 0)
      let right = Padding.RightCells + (ShowBorder ? 1 : 0)
        + (ShowScrollbar && !ShowBorder ? 1 : 0)
      let bottom = Padding.BottomRows + (ShowBorder ? 1 : 0)
      let top = Padding.TopRows + (ShowBorder ? 1 : 0) + (Title != "" && !ShowBorder ? 1 : 0)
      let absolute = !Placement.IsInFlow
      YGNodeStyleAPI.YGNodeStyleSetPositionType(node,
        absolute ? YGPositionType.Absolute : YGPositionType.Relative)
      YGNodeStyleAPI.YGNodeStyleSetFlexDirection(node,
        LayoutAxis == Axis.Row ? YGFlexDirection.Row : YGFlexDirection.Column)
      YGNodeStyleAPI.YGNodeStyleSetFlexGrow(node, float32(GrowWeight))
      YGNodeStyleAPI.YGNodeStyleSetFlexShrink(node, flexShrink)
      YGNodeStyleAPI.YGNodeStyleSetGap(node, YGGutter.All, float32(GapCells))
      YGNodeStyleAPI.YGNodeStyleSetPadding(node, YGEdge.Left, float32(left))
      YGNodeStyleAPI.YGNodeStyleSetPadding(node, YGEdge.Top, float32(top))
      YGNodeStyleAPI.YGNodeStyleSetPadding(node, YGEdge.Right, float32(right))
      YGNodeStyleAPI.YGNodeStyleSetPadding(node, YGEdge.Bottom, float32(bottom))
      if Width.IsAuto { YGNodeStyleAPI.YGNodeStyleSetWidthAuto(node) }
      else { YGNodeStyleAPI.YGNodeStyleSetWidth(node, float32(Width.CellCount)) }
      if Height.IsAuto { YGNodeStyleAPI.YGNodeStyleSetHeightAuto(node) }
      else { YGNodeStyleAPI.YGNodeStyleSetHeight(node, float32(Height.CellCount)) }
      layoutStyleDirty = false
    }

    var allVisible = !childVisibilityDirty && linked.Count == Children.Count
    if allVisible && !sameChildList(linked) { allVisible = false }
    var same = allVisible

    var visibleCount = Children.Count
    if !allVisible {
      visibleCount = 0
      var visible = 0
      while visible < Children.Count {
        if Children[visible].IsVisible { visibleCount = visibleCount + 1 }
        visible = visible + 1
      }
    }
    let leaf = visibleCount == 0
    let measurable = leaf && MeasuresIntrinsic
    if !measurable && measureInstalled {
      YGNodeAPI.YGNodeSetMeasureFunc(node, nil)
      measureInstalled = false
    }
    if leaf && linked.Count > 0 {
      YGNodeAPI.YGNodeRemoveAllChildren(node)
      linked.Clear()
    }

    var child = 0
    while child < Children.Count {
      if Children[child].IsVisible { Children[child].build(config) }
      child = child + 1
    }

    if !leaf {
      if !same {
        same = linked.Count == visibleCount
      }
      if same && !allVisible {
        var at = 0
        var linkedChild = 0
        while linkedChild < Children.Count {
          let kid = Children[linkedChild]
          if kid.IsVisible {
            if !Object.ReferenceEquals(linked[at], kid) { same = false }
            at = at + 1
          }
          linkedChild = linkedChild + 1
        }
      }
      if !same {
        YGNodeAPI.YGNodeRemoveAllChildren(node)
        linked.Clear()
        var at = 0
        var linkedChild = 0
        while linkedChild < Children.Count {
          let kid = Children[linkedChild]
          let child = kid.yoga
          if kid.IsVisible && child != nil {
            let childNode = child
            YGNodeAPI.YGNodeInsertChild(node, childNode, nuint(at))
            linked.Add(kid)
            at = at + 1
          }
          linkedChild = linkedChild + 1
        }
      }
    } else if measurable && !measureInstalled {
      YGNodeAPI.YGNodeSetContext(node, this)
      if measureCallback == nil { measureCallback = measure }
      YGNodeAPI.YGNodeSetMeasureFunc(node, measureCallback)
      measureInstalled = true
    }
    childVisibilityDirty = false
  }

  private func prepareTree(owner Box?) {
    parent = owner
    if !IsVisible {
      clearBounds()
      return
    }
    PrepareInputScope()
    PrepareLayout()
    var child = 0
    while child < Children.Count {
      Children[child].prepareTree(this)
      child = child + 1
    }
  }

  private func linkTree(owner Box?) {
    parent = owner
    synchronizeChildren()
    var child = 0
    while child < Children.Count {
      Children[child].linkTree(this)
      child = child + 1
    }
  }

  private func measure(node Facebook.Yoga.Node, availableWidth float32, widthMode MeasureMode,
    availableHeight float32, heightMode MeasureMode) YGSize {
    let measured = MeasureIntrinsic(constraint(availableWidth, widthMode),
      constraint(availableHeight, heightMode))
    var width = float32(measured.WidthCells)
    var height = float32(measured.HeightRows)
    if widthMode == MeasureMode.Exactly { width = availableWidth }
    else if widthMode == MeasureMode.AtMost && width > availableWidth { width = availableWidth }
    if heightMode == MeasureMode.Exactly { height = availableHeight }
    else if heightMode == MeasureMode.AtMost && height > availableHeight { height = availableHeight }
    return YGSize{ Width: width, Height: height }
  }

  private func constraint(value float32, mode MeasureMode) int32? {
    if mode == MeasureMode.Undefined { return nil }
    var cells = int32(value)
    if cells < 0 { cells = 0 }
    return cells
  }

  private func read(originColumn float32, originRow float32, parent CellRect) {
    if !IsVisible {
      clearBounds()
      return
    }
    guard let node = yoga else { return }
    var column = originColumn + YGNodeLayoutAPI.YGNodeLayoutGetLeft(node)
    var row = originRow + YGNodeLayoutAPI.YGNodeLayoutGetTop(node)
    let width = int32(YGNodeLayoutAPI.YGNodeLayoutGetWidth(node))
    let height = int32(YGNodeLayoutAPI.YGNodeLayoutGetHeight(node))

    if !Placement.IsInFlow {
      if Placement.IsCentered {
        column = float32(parent.Column + (parent.WidthCells - width) / 2)
        row = float32(parent.Row + (parent.HeightRows - height) / 2)
      } else {
        column = float32(parent.Column + Placement.Point.Column)
        row = float32(parent.Row + Placement.Point.Row)
      }
    }

    bounds = CellRect{
      Column: int32(column),
      Row: int32(row),
      WidthCells: width,
      HeightRows: height,
    }
    var child = 0
    while child < Children.Count {
      if Children[child].IsVisible { Children[child].read(column, row, bounds) }
      else { Children[child].clearBounds() }
      child = child + 1
    }
  }

  private func clearBounds() {
    bounds = CellRect{}
    for kid in Children {
      kid.clearBounds()
    }
  }
}

/// A box that lays its children out left to right.
public class Row : Box {
  /// Sets the layout axis to left-to-right (Row).
  public init() {
    LayoutAxis = Axis.Row
  }
}

/// A box that lays its children out top to bottom.
public open class Column : Box {
  /// Sets the layout axis to top-to-bottom (Column).
  public init() {
    LayoutAxis = Axis.Column
  }
}
