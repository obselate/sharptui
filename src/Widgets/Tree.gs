package SharpTui

import System
import System.Collections.Generic

/// A single node in a tree, with its own text, expansion state, and children.
public open class TreeNode {
  private var isExpanded bool
  private var children List[TreeNode]
  /// Caller-supplied Id values must be unique and stable for selection restoration.
  public prop Id string { get; set; }

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

  /// Creates a collapsed node with a generated Id, no children, and empty text and value.
  public init() {
    isExpanded = false
    children = List[TreeNode]()
    Id = Guid.NewGuid().ToString("N")
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

/// Describes one visible row supplied to a TreeView.
public struct TreeRow {
  /// The node displayed by this row.
  public prop Node TreeNode { get; set; }
  /// The row's zero-based nesting depth.
  public prop Depth int32 { get; set; }
  /// The visible index of the parent row, or negative one for a root.
  public prop ParentIndex int32 { get; set; }
  /// The number of direct children available for expansion.
  public prop ChildCount int32 { get; set; }
}

/// Supplies flattened visible tree rows with stable-node lookup.
public interface TreeSource {
  /// Returns the number of currently visible rows.
  /// @returns The visible row count.
  func Count() int32;

  /// Returns one visible row by zero-based index.
  /// @param index The zero-based visible row index.
  /// @returns The row at index.
  func ItemAt(index int32) TreeRow;

  /// Returns the visible index of a stable node Id, or negative one when absent.
  /// @param key The stable TreeNode Id to find.
  /// @returns The current zero-based index, or negative one.
  func IndexOfKey(key string) int32;

  /// Toggles one expandable row and updates the flattened index.
  /// @param index The zero-based visible row index.
  func Toggle(index int32);
}

/// A collapsible tree view, flattened to the expanded rows for each render.
public open class TreeView : Box {
  private var roots List[TreeNode]
  private var source TreeSource?
  private var treeDirty bool
  private var builtRevision int32
  private var builtRootCount int32
  private var selection SelectionState
  private var selectedId string
  private var selectedNode TreeNode?
  /// Top-level nodes of the tree; setting it replaces the roots and calls Refresh.
  public prop Roots List[TreeNode] {
    get { return roots }
    set {
      source = nil
      roots = value
      Refresh()
    }
  }
  /// An optional indexed visible-row source. When set, the source supplies rows instead of Roots.
  public prop Source TreeSource? {
    get { return source }
    set {
      if Object.ReferenceEquals(source, value) { return }
      source = value
      Refresh()
    }
  }
  /// Index of the selected row among the currently visible (expanded) nodes. Setting it selects programmatically and does not emit a SelectionChange.
  public prop SelectedIndex int32 {
    get { return selection.Index }
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
      if selection.Index < 0 || selection.Index >= rowCount() { return nil }
      return rowAt(selection.Index).Node
    }
  }

  private var visible List[TreeNode]
  private var depths List[int32]
  private var parents List[int32?]
  private var childCounts List[int32]

  /// Creates an empty tree with CanFocus enabled.
  public init() {
    roots = List[TreeNode]()
    source = nil
    treeDirty = true
    builtRevision = -1
    builtRootCount = -1
    selection = SelectionState()
    selectedId = ""
    selectedNode = nil
    FirstVisibleNodeIndex = 0
    SelectedNodeStyle = Style()
    NodeMarkerStyle = Style()
    visible = List[TreeNode]()
    depths = List[int32]()
    parents = List[int32?]()
    childCounts = List[int32]()
    CanFocus = true
    GrowWeight = 1
  }

  /// Rebuilds visible rows after direct mutation of the active Roots or Source data.
  public func Refresh() {
    treeDirty = true
    rebuild()
    selection.Change = nil
  }

  /// Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  /// @returns The pending selection change, or nil when none is pending.
  public func ConsumeSelectionChange() SelectionChange? {
    return selection.Consume()
  }

  /// Paints each visible node's indent, expand marker, and text, highlighting the selected row.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    rebuild()
    let count = rowCount()
    FirstVisibleNodeIndex = clampScroll(FirstVisibleNodeIndex, r.HeightRows)
    let markerStyle = NodeMarkerStyle.MergedOver(ink)
    let selectedStyle = SelectedNodeStyle.MergedOver(ink)

    var i = FirstVisibleNodeIndex
    while i < count {
      let screenRow = i - FirstVisibleNodeIndex
      if screenRow >= r.HeightRows { break }
      let data = rowAt(i)
      let node = data.Node
      let marker = data.ChildCount == 0 ? " " : (node.IsExpanded ? "▾" : "▸")
      let rowStyle = i == selection.Index ? selectedStyle : ink
      var x = 0
      while x < data.Depth * 2 && x < r.WidthCells {
        screen.WriteCell(r.Column + x, r.Row + screenRow, " ", rowStyle)
        x = x + 1
      }
      if i == selection.Index {
        if x < r.WidthCells { screen.WriteCell(r.Column + x, r.Row + screenRow, marker, selectedStyle) }
        if x + 1 < r.WidthCells { screen.WriteCell(r.Column + x + 1, r.Row + screenRow, " ", selectedStyle) }
        screen.WriteClipped(r, x + 2, screenRow, node.Text, selectedStyle)
      } else {
        if x < r.WidthCells { screen.WriteCell(r.Column + x, r.Row + screenRow, marker, markerStyle) }
        if x + 1 < r.WidthCells { screen.WriteCell(r.Column + x + 1, r.Row + screenRow, " ", markerStyle) }
        screen.WriteClipped(r, x + 2, screenRow, node.Text, ink)
      }
      i = i + 1
    }
  }

  /// Rebuilds the visible rows if needed and returns their count.
  /// @returns The visible node count.
  protected override func ScrollExtentRows() int32 {
    rebuild()
    return rowCount()
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

    if ev.Kind == UiEventKind.Key && ev.Key == Key.Up { return result(moveTo(selection.Index - 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Down { return result(moveTo(selection.Index + 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageUp { return result(moveTo(selection.Index - bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.PageDown { return result(moveTo(selection.Index + bounds.HeightRows, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Home { return result(moveTo(0, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.End { return result(moveTo(rowCount() - 1, bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Right { return result(expandOrDescend(bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Left { return result(collapseOrAscend(bounds.HeightRows)) }
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Enter { return result(toggleSelected()) }

    if ev.Kind == UiEventKind.Mouse {
      if !bounds.Contains(ev.Position) { return EventResult.Continue }
      if ev.Mouse == MouseKind.ScrollUp { return result(scrollTo(FirstVisibleNodeIndex - Selection.WheelStep, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.ScrollDown { return result(scrollTo(FirstVisibleNodeIndex + Selection.WheelStep, bounds.HeightRows)) }
      if ev.Mouse == MouseKind.Press { return result(click(ev, bounds)) }
    }
    return EventResult.Continue
  }

  private func click(ev UiEvent, bounds CellRect) bool {
    let i = FirstVisibleNodeIndex + (ev.Position.Row - bounds.Row)
    if i < 0 || i >= rowCount() { return false }
    let data = rowAt(i)
    var changed = false
    if setSelection(i, true) { changed = true }
    let markerX0 = bounds.Column + data.Depth * 2
    let markerX1 = markerX0 + 2
    if ev.Position.Column >= markerX0 && ev.Position.Column < markerX1
        && data.ChildCount > 0 {
      toggleAt(i)
      changed = true
    }
    if changed { FirstVisibleNodeIndex = clampScroll(FirstVisibleNodeIndex, bounds.HeightRows) }
    return changed
  }

  private func toggleSelected() bool {
    if rowCount() == 0 { return false }
    let data = rowAt(selection.Index)
    if data.ChildCount == 0 { return false }
    toggleAt(selection.Index)
    return true
  }

  private func expandOrDescend(height int32) bool {
    if rowCount() == 0 { return false }
    let data = rowAt(selection.Index)
    if data.ChildCount == 0 { return false }
    if !data.Node.IsExpanded {
      toggleAt(selection.Index)
      return true
    }
    return moveTo(selection.Index + 1, height)
  }

  private func collapseOrAscend(height int32) bool {
    if rowCount() == 0 { return false }
    let data = rowAt(selection.Index)
    if data.Node.IsExpanded && data.ChildCount > 0 {
      toggleAt(selection.Index)
      return true
    }
    if data.ParentIndex < 0 { return false }
    return moveTo(data.ParentIndex, height)
  }

  private func moveTo(want int32, height int32) bool {
    let count = rowCount()
    if count == 0 { return false }
    let i = clampIndex(want)
    if !setSelection(i, true) { return false }
    FirstVisibleNodeIndex = Selection.ScrollIntoView(count, selection.Index, FirstVisibleNodeIndex, height)
    return true
  }

  private func scrollTo(want int32, height int32) bool {
    let s = clampScroll(want, height)
    if s == FirstVisibleNodeIndex { return false }
    FirstVisibleNodeIndex = s
    return true
  }

  private func clampIndex(i int32) int32 {
    return Selection.ClampIndex(rowCount(), i)
  }

  private func clampScroll(s int32, height int32) int32 {
    return Selection.ClampScroll(rowCount(), s, height)
  }

  private func rebuild() {
    if source != nil {
      if !treeDirty { return }
      treeDirty = false
      normalizeSelection()
      return
    }
    let revision = TreeNode.StructureRevision()
    let rootCount = roots.Count
    if !treeDirty && builtRevision == revision && builtRootCount == rootCount { return }
    visible.Clear()
    depths.Clear()
    parents.Clear()
    childCounts.Clear()
    var i = 0
    while i < rootCount {
      addNode(roots[i], 0, nil)
      i = i + 1
    }
    builtRevision = revision
    builtRootCount = rootCount
    treeDirty = false
    normalizeSelection()
  }

  private func addNode(node TreeNode, depth int32, parent int32?) {
    let at = visible.Count
    let children = node.Children.Count
    visible.Add(node)
    depths.Add(depth)
    parents.Add(parent)
    childCounts.Add(children)
    if node.IsExpanded && children > 0 {
      var i = 0
      while i < children {
        addNode(node.Children[i], depth + 1, at)
        i = i + 1
      }
    }
  }

  private func rowCount() int32 {
    if source != nil { return source!!.Count() }
    return visible.Count
  }

  private func rowAt(index int32) TreeRow {
    if source != nil { return source!!.ItemAt(index) }
    return TreeRow{
      Node: visible[index],
      Depth: depths[index],
      ParentIndex: parents[index] ?? -1,
      ChildCount: childCounts[index],
    }
  }

  private func toggleAt(index int32) {
    if source != nil {
      source!!.Toggle(index)
    } else {
      visible[index].IsExpanded = !visible[index].IsExpanded
    }
    treeDirty = true
    rebuild()
  }

  private func setSelection(value int32, emit bool) bool {
    if !selection.Set(value, emit) { return false }
    updateSelectionIdentity()
    return true
  }

  private func updateSelectionIdentity() {
    if selection.Index < 0 || selection.Index >= rowCount() {
      selectedNode = nil
      selectedId = ""
      return
    }
    let node = rowAt(selection.Index).Node
    selectedNode = node
    selectedId = node.Id
  }

  private func normalizeSelection() {
    let count = rowCount()
    if count == 0 {
      selection.Index = 0
      selectedNode = nil
      selectedId = ""
      selection.Change = nil
      return
    }
    var normalized = -1
    if selectedId != "" {
      if source != nil {
        normalized = source!!.IndexOfKey(selectedId)
        if normalized < 0 || normalized >= count { normalized = -1 }
      } else {
        var i = 0
        while i < count {
          if rowAt(i).Node.Id == selectedId {
            normalized = i
            break
          }
          i = i + 1
        }
      }
    } else if selectedNode != nil {
      var i = 0
      while i < count {
        if Object.ReferenceEquals(rowAt(i).Node, selectedNode) {
          normalized = i
          break
        }
        i = i + 1
      }
    }
    if normalized < 0 { normalized = clampIndex(selection.Index) }
    if normalized != selection.Index {
      selection.Index = normalized
      selection.Change = nil
    }
    updateSelectionIdentity()
  }

}
