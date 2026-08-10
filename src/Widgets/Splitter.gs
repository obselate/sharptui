package SharpTui

import System

/// Which dimension a Splitter resizes: Columns adjusts width by horizontal drag, Rows adjusts height by vertical drag.
public enum SplitterAxis { Columns; Rows }

/// A one-cell divider that resizes a preceding target box by mouse drag.
public open class Splitter : Box {
  private var target Box
  private var axis SplitterAxis
  private var minimumCells int32
  private var maximumCells int32
  private var dragging bool
  private var pressCoordinate int32
  private var initialTargetCells int32
  private var lastTargetCells int32

  /// The smallest size, in cells, the target may be resized to. Throws if set negative or above MaximumCells.
  public prop MinimumCells int32 {
    get { return minimumCells }
    set {
      if value < 0 || value > maximumCells {
        throw ArgumentOutOfRangeException("MinimumCells")
      }
      minimumCells = value
    }
  }

  /// The largest size, in cells, the target may be resized to. Throws if set below MinimumCells.
  public prop MaximumCells int32 {
    get { return maximumCells }
    set {
      if value < minimumCells {
        throw ArgumentOutOfRangeException("MaximumCells")
      }
      maximumCells = value
    }
  }

  /// Creates a one-cell splitter that resizes target along axis. Throws if target is nil or axis is not a valid SplitterAxis.
  /// @param target The box this splitter resizes.
  /// @param axis The dimension this splitter resizes.
  public init(target Box, axis SplitterAxis) {
    if target == nil { throw ArgumentNullException("target") }
    if axis != SplitterAxis.Columns && axis != SplitterAxis.Rows {
      throw ArgumentOutOfRangeException("axis")
    }
    this.target = target
    this.axis = axis
    minimumCells = 1
    maximumCells = Int32.MaxValue
    dragging = false
    pressCoordinate = 0
    initialTargetCells = 0
    lastTargetCells = 0
    CanReceiveMouse = true
    CanFocus = false
    if axis == SplitterAxis.Columns {
      Width = CellLength.Cells(1)
    } else {
      Height = CellLength.Cells(1)
    }
  }

  /// Resizes the target by a relative number of terminal cells.
  /// @param delta The number of cells to grow (positive) or shrink (negative) the target by.
  /// @returns True when the target's size changed.
  public func ResizeBy(delta int32) bool {
    let current = targetCells()
    let desired = clamp(int64(current) + int64(delta))
    return applyTargetCells(desired, current)
  }

  /// Draws a vertical bar for a Columns splitter or a horizontal bar for a Rows splitter, filling r.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if axis == SplitterAxis.Columns {
      var row = 0
      while row < r.HeightRows {
        screen.WriteCell(r.Column, r.Row + row, "│", ink)
        row = row + 1
      }
      return
    }

    var column = 0
    while column < r.WidthCells {
      screen.WriteCell(r.Column + column, r.Row, "─", ink)
      column = column + 1
    }
  }

  /// Captures the mouse on press and resizes the target as the mouse moves or is released, along the configured axis.
  /// @param ev The input event to handle.
  /// @returns Handled when the event was consumed, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind != UiEventKind.Mouse { return EventResult.Continue }

    if ev.Mouse == MouseKind.Press {
      if ev.Button != MouseButton.Left { return EventResult.Continue }
      if !CaptureMouse() { return EventResult.Continue }
      dragging = true
      pressCoordinate = coordinate(ev.Position)
      initialTargetCells = renderedTargetCells()
      lastTargetCells = initialTargetCells
      return EventResult.Handled
    }

    if ev.Mouse == MouseKind.Move {
      if !dragging { return EventResult.Continue }
      applyDrag(ev)
      return EventResult.Handled
    }

    if ev.Mouse == MouseKind.Release {
      if !dragging { return EventResult.Continue }
      applyDrag(ev)
      ReleaseMouseCapture()
      dragging = false
      return EventResult.Handled
    }

    return EventResult.Continue
  }

  /// Stops an in-progress drag if the mouse capture is taken away, such as by another widget.
  protected override func MouseCaptureLost() {
    dragging = false
  }

  private func applyDrag(ev UiEvent) {
    let displacement = int64(coordinate(ev.Position)) - int64(pressCoordinate)
    let desired = clamp(int64(initialTargetCells) + displacement)
    if desired == lastTargetCells { return }
    applyTargetCells(desired, lastTargetCells)
    lastTargetCells = desired
  }

  private func applyTargetCells(value int32, previous int32) bool {
    if value == previous { return false }
    if axis == SplitterAxis.Columns {
      target.Width = CellLength.Cells(value)
    } else {
      target.Height = CellLength.Cells(value)
    }
    return true
  }

  private func targetCells() int32 {
    if axis == SplitterAxis.Columns {
      return target.Width.IsAuto ? target.Bounds.WidthCells : target.Width.CellCount
    }
    return target.Height.IsAuto ? target.Bounds.HeightRows : target.Height.CellCount
  }

  private func renderedTargetCells() int32 {
    return axis == SplitterAxis.Columns ? target.Bounds.WidthCells : target.Bounds.HeightRows
  }

  private func coordinate(point CellPoint) int32 {
    return axis == SplitterAxis.Columns ? point.Column : point.Row
  }

  private func clamp(value int64) int32 {
    if value < int64(MinimumCells) { return MinimumCells }
    if value > int64(MaximumCells) { return MaximumCells }
    return int32(value)
  }
}
