package SharpTui

import System
import System.Collections.Generic

/// A single node in a tree, with its own text, expansion state, and children.
public open class TreeNode {
  private var isExpanded bool
  private var children List[TreeNode]

  /// Text drawn for this node.
  public prop Text string { get; set; }
  /// Whether this node's children are shown. Changing it advances the shared structure revision, forcing every TreeView to rebuild its visible rows.
  public prop IsExpanded bool {
    get { return isExpanded }
    set {
      if isExpanded == value { return }
      isExpanded = value
      TreeNode.AdvanceStructureRevision()
    }
  }
  /// True when this node has no children.
  public prop IsLeaf bool { get { return Children.Count == 0 } }
  /// This node's child nodes. Setting it advances the shared structure revision, forcing every TreeView to rebuild its visible rows.
  public prop Children List[TreeNode] {
    get { return children }
    set {
      children = value
      TreeNode.AdvanceStructureRevision()
    }
  }
  /// Application-defined string value, such as a filesystem path.
  public prop Value string { get; set; }

  /// Creates a collapsed node with no children, empty text, and empty value.
  public init() {
    isExpanded = false
    children = List[TreeNode]()
    Text = ""
    Value = ""
  }

  shared {
    private var structureRevision int32

    init { structureRevision = 0 }

    internal func StructureRevision() int32 { return structureRevision }
    internal func AdvanceStructureRevision() { structureRevision = structureRevision + 1 }
  }
}

/// A collapsible tree view, flattened to the expanded rows for each render.
public open class TreeView : Box {
  private var roots List[TreeNode]
  private var treeDirty bool
  private var builtRevision int32
  private var builtRootCount int32
  private var selectedIndex int32
  private var selectionChange SelectionChange?

  /// Top-level nodes of the tree; setting it replaces the roots and calls RefreshNodes.
  public prop Roots List[TreeNode] {
    get { return roots }
    set {
      roots = value
      RefreshNodes()
    }
  }
  /// Index of the selected row among the currently visible (expanded) nodes. Setting it selects programmatically and does not emit a SelectionChange.
  public prop SelectedIndex int32 {
    get { return selectedIndex }
    set {
      rebuild()
      setSelection(clampIndex(value), false)
    }
  }
  /// Index of the first visible tree node.
  public prop FirstVisibleNodeIndex int32 { get; set; }
  /// Style merged over the selected row's inherited style.
  public prop SelectedNodeStyle Style { get; set; }
  /// Style applied to the expand/collapse marker on unselected rows.
  public prop NodeMarkerStyle Style { get; set; }
  /// The currently selected node among visible rows, or nil when there are none.
  public prop SelectedNode TreeNode? {
    get {
      rebuild()
      if selectedIndex < 0 || selectedIndex >= visible.Count { return nil }
      return visible[selectedIndex]
    }
  }

  private var visible List[TreeNode]
  private var depths List[int32]
  private var parents List[int32?]

  /// Creates an empty tree with CanFocus enabled.
  public init() {
    roots = List[TreeNode]()
    treeDirty = true
    builtRevision = -1
    builtRootCount = -1
    selectedIndex = 0
    selectionChange = nil
    FirstVisibleNodeIndex = 0
    SelectedNodeStyle = Style()
    NodeMarkerStyle = Style()
    visible = List[TreeNode]()
    depths = List[int32]()
    parents = List[int32?]()
    CanFocus = true
    GrowWeight = 1
  }

  /// Rebuilds visible rows after direct changes to Roots or TreeNode.Children.
  public func RefreshNodes() {
    treeDirty = true
    rebuild()
    selectionChange = nil
  }

  /// Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  /// @returns The pending selection change, or nil when none is pending.
  public func ConsumeSelectionChange() SelectionChange? {
    let pending = selectionChange
    selectionChange = nil
    return pending
  }

  /// Paints each visible node's indent, expand marker, and text, highlighting the selected row.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    rebuild()
    FirstVisibleNodeIndex = clampScroll(FirstVisibleNodeIndex, r.HeightRows)
    let markerStyle = resolvedStyle(NodeMarkerStyle, ink)
    let selectedStyle = resolvedStyle(SelectedNodeStyle, ink)

    var i = FirstVisibleNodeIndex
    while i < visible.Count {
      let row = i - FirstVisibleNodeIndex
      if row >= r.HeightRows { break }
      let node = visible[i]
      let depth = depths[i]
      let marker = node.IsLeaf ? " " : (node.IsExpanded ? "▾" : "▸")
      let rowStyle = i == selectedIndex ? selectedStyle : ink
      var x = 0
      while x < depth * 2 && x < r.WidthCells {
        screen.WriteCell(r.Column + x, r.Row + row, " ", rowStyle)
        x = x + 1
      }
      if i == selectedIndex {
        if x < r.WidthCells { screen.WriteCell(r.Column + x, r.Row + row, marker, selectedStyle) }
        if x + 1 < r.WidthCells { screen.WriteCell(r.Column + x + 1, r.Row + row, " ", selectedStyle) }
        screen.WriteClipped(r, x + 2, row, node.Text, selectedStyle)
      } else {
        if x < r.WidthCells { screen.WriteCell(r.Column + x, r.Row + row, marker, markerStyle) }
        if x + 1 < r.WidthCells { screen.WriteCell(r.Column + x + 1, r.Row + row, " ", markerStyle) }
        screen.WriteClipped(r, x + 2, row, node.Text, ink)
      }
      i = i + 1
    }
  }

  /// Rebuilds the visible rows if needed and returns their count.
  /// @returns The visible node count.
  protected override func ScrollExtentRows() int32 {
    rebuild()
    return visible.Count
  }

  /// Returns FirstVisibleNodeIndex as the current scroll offset.
  /// @returns The topmost visible node index.
  protected override func ScrollOffsetRows() int32 {
    return FirstVisibleNodeIndex
  }

  /// Handles keyboard navigation, expand/collapse, mouse-wheel scrolling, and click-to-select within the content bounds.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) { return EventResult.Continue }
    let bounds = ContentBounds
    if bounds.HeightRows <= 0 { return EventResult.Continue }
    rebuild()

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up { return result(moveTo(selectedIndex - 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down { return result(moveTo(selectedIndex + 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp { return result(moveTo(selectedIndex - bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown { return result(moveTo(selectedIndex + bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home { return result(moveTo(0, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End { return result(moveTo(visible.Count - 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Right { return result(expandOrDescend(bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Left { return result(collapseOrAscend(bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter { return result(toggleSelected()) }

    if ev.Kind == UiEventKind.Mouse {
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      if ev.Mouse == MouseKind.ScrollUp { return result(scrollTo(FirstVisibleNodeIndex - 3, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(scrollTo(FirstVisibleNodeIndex + 3, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.Press { return result(click(ev, bounds)) }
    }
    return EventResult.Continue
  }

  private func click(ev UiEvent, bounds CellRect) bool {
    let i = FirstVisibleNodeIndex + (ev.Position.Row - bounds.Row)
    if i < 0 || i >= visible.Count { return false }
    var changed = false
    if setSelection(i, true) { changed = true }
    let depth = depths[i]
    let markerX0 = bounds.Column + depth * 2
    let markerX1 = markerX0 + 2
    if ev.Position.Column >= markerX0 && ev.Position.Column < markerX1 {
      let node = visible[i]
      if !node.IsLeaf {
        node.IsExpanded = !node.IsExpanded
        changed = true
      }
    }
    if changed { FirstVisibleNodeIndex = clampScroll(FirstVisibleNodeIndex, bounds.HeightRows) }
    return changed
  }

  private func toggleSelected() bool {
    if visible.Count == 0 { return false }
    let node = visible[selectedIndex]
    if node.IsLeaf { return false }
    node.IsExpanded = !node.IsExpanded
    return true
  }

  private func expandOrDescend(height int32) bool {
    if visible.Count == 0 { return false }
    let node = visible[selectedIndex]
    if node.IsLeaf { return false }
    if !node.IsExpanded {
      node.IsExpanded = true
      return true
    }
    if node.Children.Count == 0 { return false }
    return moveTo(selectedIndex + 1, height)
  }

  private func collapseOrAscend(height int32) bool {
    if visible.Count == 0 { return false }
    let node = visible[selectedIndex]
    if node.IsExpanded && !node.IsLeaf {
      node.IsExpanded = false
      return true
    }
    guard let parent = parents[selectedIndex] else { return false }
    return moveTo(parent, height)
  }

  private func moveTo(want int32, height int32) bool {
    if visible.Count == 0 { return false }
    let i = clampIndex(want)
    if !setSelection(i, true) { return false }
    if selectedIndex < FirstVisibleNodeIndex { FirstVisibleNodeIndex = selectedIndex }
    if selectedIndex >= FirstVisibleNodeIndex + height {
      FirstVisibleNodeIndex = selectedIndex - height + 1
    }
    FirstVisibleNodeIndex = clampScroll(FirstVisibleNodeIndex, height)
    return true
  }

  private func scrollTo(want int32, height int32) bool {
    let s = clampScroll(want, height)
    if s == FirstVisibleNodeIndex { return false }
    FirstVisibleNodeIndex = s
    return true
  }

  private func clampIndex(i int32) int32 {
    if visible.Count == 0 { return 0 }
    if i < 0 { return 0 }
    if i >= visible.Count { return visible.Count - 1 }
    return i
  }

  private func clampScroll(s int32, height int32) int32 {
    var max = visible.Count - height
    if max < 0 { max = 0 }
    if s > max { return max }
    if s < 0 { return 0 }
    return s
  }

  private func rebuild() {
    let revision = TreeNode.StructureRevision()
    if !treeDirty && builtRevision == revision && builtRootCount == Roots.Count { return }
    visible.Clear()
    depths.Clear()
    parents.Clear()
    var i = 0
    while i < Roots.Count {
      addNode(Roots[i], 0, nil)
      i = i + 1
    }
    builtRevision = revision
    builtRootCount = Roots.Count
    treeDirty = false
    normalizeSelection()
  }

  private func addNode(node TreeNode, depth int32, parent int32?) {
    let at = visible.Count
    visible.Add(node)
    depths.Add(depth)
    parents.Add(parent)
    if node.IsExpanded && !node.IsLeaf {
      var i = 0
      while i < node.Children.Count {
        addNode(node.Children[i], depth + 1, at)
        i = i + 1
      }
    }
  }

  private func resolvedStyle(own Style, inherited Style) Style {
    return Style{
      Foreground: own.Foreground.IsInherited ? inherited.Foreground : own.Foreground,
      Background: own.Background.IsInherited ? inherited.Background : own.Background,
      Attributes: TextAttributes(int32(inherited.Attributes) | int32(own.Attributes)),
    }
  }

  private func setSelection(value int32, emit bool) bool {
    if selectedIndex == value {
      if !emit { selectionChange = nil }
      return false
    }
    let previous = selectedIndex
    selectedIndex = value
    selectionChange = emit ? SelectionChange(previous, value) : nil
    return true
  }

  private func normalizeSelection() {
    let normalized = clampIndex(selectedIndex)
    if normalized == selectedIndex { return }
    selectedIndex = normalized
    selectionChange = nil
  }

  private func result(handled bool) EventResult {
    return handled ? EventResult.Handled : EventResult.Continue
  }
}
