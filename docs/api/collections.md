# Collections

A collection owns one current selection. Keep stable identities. Consume user changes once. The complete member list is in [the reference](reference.md).

## Choose the view

| Need | Type | Data shape |
| --- | --- | --- |
| One selectable text row per item | `ListView` | `ListItem` values or a `KeyedSource[ListItem, string]`. |
| Columns with a header | `TableView` | `TableRow` values or a `KeyedSource[TableRow, string]`. |
| Expandable hierarchy | `TreeView` | `TreeNode` roots or a flattened `TreeSource`. |
| One active content section | `Tabs` | Ordered title strings. |
| Persistent context | `StatusBar` | Left, center, and right text. |

## Lists

`ListItem` carries `Id`, `Text`, optional `Runs`, `Style`, and `IsSelectable`. When `Runs` is non-empty, it takes precedence over `Text`. Use a unique, stable `Id` when replacement or filtering must restore selection.

```gsharp
let list = ListView{
  Items: {
    ListItem{ Id: "build", Text: "build", IsSelectable: true },
    ListItem{ Id: "summary", Text: "3 targets", IsSelectable: false },
    ListItem{ Id: "test", Text: "test", IsSelectable: true },
  },
  SelectionMarker: "> ",
  GrowWeight: 1,
}

let changed = list.ConsumeSelectionChange()
if changed != nil {
  let selected = list.SelectedItem
}
```

`SelectedIndex` is programmatic selection. It does not emit `SelectionChange`. `ConsumeSelectionChange` returns and clears a user-navigation change with `PreviousIndex` and `SelectedIndex`. `SelectedId` and `SelectedItem` report the current item.

Set `Source` to a `KeyedSource[ListItem, string]` for indexed data. It provides `Count()`, zero-based `ItemAt(index)`, and `IndexOfKey(id)`. Item data and counts are read live. Before selection is observed, routed, or rendered, the list preserves the selected stable Id through `IndexOfKey` or a fallback `Items` scan. `Refresh()` is only needed to discover a same-count `IsSelectable` change away from a non-selectable fallback selection.

`FollowTail` is for logs. It selects the last selectable row and keeps the viewport at the end. Upward navigation, upward scrolling, Home, PageUp, or a click turns it off. It does not re-enable itself.

## Tables

`TableView` separates columns, rows, and cells. `ColumnWidth.Cells(count)` fixes a width. `ColumnWidth.Share(weight)` divides remaining width after fixed columns and gaps.

```gsharp
let table = TableView{
  Columns: {
    TableColumn{ Header: "NAME", ColumnWidth: ColumnWidth.Share(2) },
    TableColumn{ Header: "STATE", ColumnWidth: ColumnWidth.Cells(8) },
  },
  Rows: {
    TableRow{ Id: "api", Cells: { TableCell("api"), TableCell("ready") } },
    TableRow{ Id: "web", Cells: { TableCell("web"), TableCell("queued") } },
  },
  ColumnGapCells: 1,
  ColumnSeparator: "│",
}
```

| Type | Rule |
| --- | --- |
| `TableColumn` | Set `Header`, `ColumnWidth`, and optional body/header alignment. |
| `TableCell` | Use `Text` or immutable styled `Runs`. |
| `TableRow` | Give selectable rows a stable unique `Id`. `IsSelectable: false` remains visible but skips selection. |
| `KeyedSource[TableRow, string]` | Provide `Count()`, zero-based `ItemAt(index)`, and `IndexOfKey(id)`. |
| `TableView` | `Rows` and `Source` are read live. Stable selection reconciles automatically after direct changes. |

`SelectedRowIndex` is programmatic and silent. `ConsumeSelectionChange` is user input. `SelectedRowId` restores identity across replacement when possible. `FirstVisibleRowIndex` and `FirstVisibleColumnIndex` are the explicit viewports. `Refresh()` is only needed to discover a same-count `IsSelectable` change away from a non-selectable fallback selection.

## Trees

`TreeView` flattens expanded rows for every render. `TreeNode.Id` is stable selection identity. `Text` is displayed. `Value` is unrestricted application data, such as a path. `IsLeaf` reports whether the node has children.

```gsharp
let tree = TreeView{
  Roots: {
    TreeNode{
      Text: "src",
      Id: "src",
      IsExpanded: true,
      Children: {
        TreeNode{ Id: "src/App.gs", Text: "App.gs", Value: "src/App.gs" },
      },
    },
  },
  GrowWeight: 1,
}

tree.Refresh()
```

Direct changes to `Roots`, `TreeNode.Children`, or the active `TreeSource` need `Refresh()`. A source supplies flattened `TreeRow` values and implements `Count`, `ItemAt`, `IndexOfKey`, and `Toggle`. `TreeRow.Depth`, `ParentIndex`, and `ChildCount` describe one visible row. `SelectedIndex` is relative to visible, expanded rows.

## Tabs and status

```gsharp
let tabs = Tabs{ Titles: { "FILES", "SEARCH", "LOG" } }
let status = StatusBar{
  LeftText: "project",
  CenterText: "ready",
  RightText: "3/12",
}

if tabs.ConsumeSelectionChange() != nil {
  status.CenterText = tabs.Titles[tabs.SelectedIndex]
}
```

`Tabs.Refresh()` re-resolves selection after direct title-list mutation. `StatusBar` has no hidden state: set `LeftText`, `CenterText`, and `RightText` to the current facts.

### Collection rules

- Don't use list index as a durable identity. Use `Id` for list, table, and tree restoration.
- Don't infer a user action from `SelectedIndex`. Read `ConsumeSelectionChange`.
- Don't make headings selectable. Use `IsSelectable: false`.
- Call `Refresh()` only where the widget documents explicit cache invalidation. `ListView` and `TableView` reconcile live data automatically.
- Don't let a selected row be color-only. Keep `SelectionMarker`, hierarchy markers, or focus state visible.

For exhaustive signatures, see [list types](reference.md#sharptuilistitem), [table types](reference.md#sharptuitablecell), and [tree types](reference.md#sharptuitreenode).
