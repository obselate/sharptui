package SharpTui

import System

/// A short label, a retained editor, and optional field state.
public class FormField : Box {
  private let label Label
  private let modified Label
  private let state Label
  private let valueRow Row
  private var editor Box?

  /// The single-line field label. Measured in terminal cells.
  public prop Label string {
    get -> label.Text
    set {
      label.Text = value
      label.MarkMeasureDirty()
    }
  }

  /// The retained editor. Any box can be used. Replacing it detaches the previous editor.
  public prop Editor Box? {
    get -> editor
    set {
      if Object.ReferenceEquals(editor, value) { return }
      valueRow.Children.Clear()
      editor = value
      if value != nil {
        value.ConstrainWidth = true
        value.FlexShrink = 1.0F
        valueRow.Add(value)
      }
      valueRow.Add(modified)
      valueRow.Add(state)
    }
  }

  /// Whether a visible asterisk is drawn beside the editor. The caller owns modified state.
  public prop IsModified bool {
    get -> modified.IsVisible
    set -> modified.IsVisible = value
  }

  /// A short state symbol or value beside the editor. Empty text hides it.
  public prop StateText string {
    get -> state.Text
    set {
      state.Text = value
      state.MarkMeasureDirty()
      state.IsVisible = value != ""
    }
  }

  /// The style applied to StateText.
  public prop StateStyle Style {
    get -> state.Style
    set -> state.Style = value
  }

  /// Creates an empty field. Labels wrap above editors when their combined width does not fit.
  public init() {
    label = Label{}
    modified = Label{ Text: "*", IsVisible: false }
    state = Label{ IsVisible: false }
    valueRow = Row{ Grow: 1, ConstrainWidth: true }
    LayoutAxis = Axis.Row
    WrapChildren = true
    ConstrainWidth = true
    Gap = 1
    label.ConstrainWidth = true
    valueRow.Gap = 1
    valueRow.Add(modified)
    valueRow.Add(state)
    Add(label)
    Add(valueRow)
  }

  internal func SetLabelWidth(cells int32) {
    if cells == 0 && label.Width.IsAuto { return }
    if cells != 0 && !label.Width.IsAuto && label.Width.CellCount == cells { return }
    label.Width = cells == 0 ? CellLength.Auto : CellLength.Cells(cells)
  }
}

/// A retained field layout with a local, focus-aware vertical viewport.
public open class Form : Box {
  private var labelWidth int32
  private var firstVisibleRow int32
  private var extentRows int32
  private var previousFocus Box?
  private var previousSize CellSize
  private var previousFocusRow int32
  private var previousFocusHeight int32

  /// The label column width in cells. Zero uses each label's natural width. Defaults to zero.
  public prop LabelWidth int32 {
    get -> labelWidth
    set {
      if value < 0 { throw ArgumentOutOfRangeException("LabelWidth") }
      labelWidth = value
    }
  }

  /// The first visible content row. Clamped to the content range during layout.
  public prop FirstVisibleRow int32 {
    get -> firstVisibleRow
    set -> firstVisibleRow = Math.Max(0, value)
  }

  /// Creates a form. Add FormField children in display order. Editors keep their state while scrolling.
  public init() {
    FlexShrink = 1.0F
    CanReceiveMouse = true
  }

  /// Applies the label column width without rebuilding fields or editors.
  protected override func PrepareLayout() {
    var index = 0
    while index < Children.Count {
      let child = Children[index]
      if child is FormField { child.SetLabelWidth(labelWidth) }
      index = index + 1
    }
  }

  internal override prop ClipChildren bool -> true

  internal override func PreviewMouse(ev UiEvent) EventResult -> Accept(ev)

  internal override func LayoutCompleted() {
    let view = ContentBounds
    extentRows = 0
    var index = 0
    while index < Children.Count {
      let child = Children[index]
      if child.IsVisible {
        extentRows = Math.Max(extentRows, child.Bounds.Row + child.Bounds.HeightRows - view.Row)
      }
      index = index + 1
    }
    let focused = FocusedElement
    let size = CellSize{ WidthCells: view.WidthCells, HeightRows: view.HeightRows }
    if focused != nil {
      let top = focused.Bounds.Row - view.Row
      let bottom = top + focused.Bounds.HeightRows
      if !Object.ReferenceEquals(focused, previousFocus)
          || size.WidthCells != previousSize.WidthCells || size.HeightRows != previousSize.HeightRows
          || top != previousFocusRow || focused.Bounds.HeightRows != previousFocusHeight {
        if top < firstVisibleRow { firstVisibleRow = top }
        else if bottom > firstVisibleRow + view.HeightRows {
          firstVisibleRow = Math.Min(top, bottom - view.HeightRows)
        }
      }
      previousFocusRow = top
      previousFocusHeight = focused.Bounds.HeightRows
    }
    previousFocus = focused
    previousSize = size
    firstVisibleRow = Math.Clamp(firstVisibleRow, 0, Math.Max(0, extentRows - view.HeightRows))
    if firstVisibleRow == 0 { return }
    index = 0
    while index < Children.Count {
      let child = Children[index]
      if child.IsVisible { child.OffsetRows(-firstVisibleRow) }
      index = index + 1
    }
  }

  /// Scrolls only this form when the pointer wheel is inside its content.
  /// @param ev The input event.
  /// @returns Handled for a wheel event inside the form, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind != UiEventKind.Mouse || !ContentBounds.Contains(ev.Position) { return EventResult.Continue }
    if ev.Mouse == MouseKind.ScrollUp { FirstVisibleRow = firstVisibleRow - 3 }
    else if ev.Mouse == MouseKind.ScrollDown {
      FirstVisibleRow = Math.Min(firstVisibleRow + 3, Math.Max(0, extentRows - ContentBounds.HeightRows))
    } else { return EventResult.Continue }
    return EventResult.Handled
  }

  /// Returns the total field height in rows.
  /// @returns The content row count.
  protected override func ScrollExtentRows() int32 -> extentRows

  /// Returns the first visible content row.
  /// @returns The viewport row offset.
  protected override func ScrollOffsetRows() int32 -> firstVisibleRow
}
