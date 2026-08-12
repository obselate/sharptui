package SharpTui

import System

internal class SplitterCheck {
  shared {
    internal func Run() int32 {
      var failed = 0
      failed = failed + checkColumns()
      failed = failed + checkRows()
      failed = failed + checkValidation()
      failed = failed + checkUnchangedMotion()
      failed = failed + checkUnchangedRedraw()
      return failed
    }
  }
}

private func checkColumns() int32 {
  var failed = 0
  let target = Box{ Width: CellLength.Cells(10), Height: CellLength.Cells(2) }
  let focus = TextInput{ Width: CellLength.Cells(6), Height: CellLength.Cells(1) }
  let splitter = Splitter(target, SplitterAxis.Columns)
  splitter.MinimumCells = 5
  splitter.MaximumCells = 12
  let root = Row{ Children: { target, splitter, focus } }
  let screen = Screen(32, 4)
  root.Draw(screen)
  root.Focus(focus)

  failed = failed + Checks.Expect(splitter.Bounds.WidthCells == 1 && splitter.Bounds.HeightRows == 4,
    "Columns splitter renders a one-cell vertical divider")
  failed = failed + Checks.Expect(focus.IsFocused && !splitter.IsFocused,
    "Splitter is mouse-capable without taking focus")

  let pressColumn = splitter.Bounds.Column
  root.Handle(splitterMouse(MouseKind.Press, MouseButton.Right, pressColumn, splitter.Bounds.Row))
  root.Handle(splitterMouse(MouseKind.Move, MouseButton.Right, pressColumn + 20, splitter.Bounds.Row))
  failed = failed + Checks.Expect(target.Width.CellCount == 10,
    "right-button press does not start a column drag")

  root.Handle(splitterMouse(MouseKind.Press, MouseButton.Middle, pressColumn, splitter.Bounds.Row))
  root.Handle(splitterMouse(MouseKind.Move, MouseButton.Middle, pressColumn + 20, splitter.Bounds.Row))
  failed = failed + Checks.Expect(target.Width.CellCount == 10,
    "middle-button press does not start a column drag")

  root.Handle(splitterMouse(MouseKind.Press, MouseButton.Left, pressColumn, splitter.Bounds.Row))
  root.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, pressColumn + 3, splitter.Bounds.Row))
  failed = failed + Checks.Expect(target.Width.CellCount == 12,
    "positive column movement grows the target and applies the maximum clamp")
  root.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, 0, splitter.Bounds.Row))
  failed = failed + Checks.Expect(target.Width.CellCount == 5,
    "negative column movement applies the minimum clamp outside the divider bounds")
  root.Handle(splitterMouse(MouseKind.Release, MouseButton.Left, 0, splitter.Bounds.Row))
  let released = target.Width.CellCount
  root.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, pressColumn + 20, splitter.Bounds.Row))
  failed = failed + Checks.Expect(released == 5 && target.Width.CellCount == 5,
    "release finalizes the column drag and post-release motion is ignored")
  failed = failed + Checks.Expect(focus.IsFocused,
    "column drag preserves the focused sibling")

  let autoTarget = Column{ Children: { Label{ Text: "auto" } } }
  let autoSplitter = Splitter(autoTarget, SplitterAxis.Columns)
  let autoRoot = Row{ Children: { autoTarget, autoSplitter, Label{ Text: "tail", GrowWeight: 1 } } }
  autoRoot.Draw(Screen(24, 4))
  let autoStart = autoTarget.Bounds.WidthCells
  autoRoot.Handle(splitterMouse(MouseKind.Press, MouseButton.Left, autoSplitter.Bounds.Column, autoSplitter.Bounds.Row))
  autoRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, autoSplitter.Bounds.Column + 2, autoSplitter.Bounds.Row))
  failed = failed + Checks.Expect(autoTarget.Width.CellCount == autoStart + 2,
    "an automatic column target starts from its rendered width")

  return failed
}

private func checkRows() int32 {
  var failed = 0
  let target = Column{
    Width: CellLength.Cells(8),
    Height: CellLength.Cells(6),
    Children: { Label{ Text: "top" }, Label{ Text: "bottom" } },
  }
  let splitter = Splitter(target, SplitterAxis.Rows)
  splitter.MinimumCells = 3
  splitter.MaximumCells = 8
  let root = Column{ Children: { target, splitter, Label{ Text: "tail", GrowWeight: 1 } } }
  let screen = Screen(12, 14)
  root.Draw(screen)

  failed = failed + Checks.Expect(splitter.Bounds.HeightRows == 1 && splitter.Bounds.WidthCells == 12,
    "Rows splitter renders a one-cell horizontal divider")
  let pressRow = splitter.Bounds.Row
  root.Handle(splitterMouse(MouseKind.Press, MouseButton.Left, splitter.Bounds.Column, pressRow))
  root.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, splitter.Bounds.Column, pressRow + 2))
  failed = failed + Checks.Expect(target.Height.CellCount == 8,
    "positive row movement grows the target and applies the maximum clamp")
  root.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, splitter.Bounds.Column, 0))
  failed = failed + Checks.Expect(target.Height.CellCount == 3,
    "negative row movement applies the minimum clamp outside the divider bounds")
  root.Handle(splitterMouse(MouseKind.Release, MouseButton.Left, splitter.Bounds.Column, 0))

  let autoTarget = Column{ Children: { Label{ Text: "one" }, Label{ Text: "two" } } }
  let autoSplitter = Splitter(autoTarget, SplitterAxis.Rows)
  let autoRoot = Column{ Children: { autoTarget, autoSplitter, Label{ Text: "tail", GrowWeight: 1 } } }
  autoRoot.Draw(Screen(12, 10))
  let autoStart = autoTarget.Bounds.HeightRows
  autoRoot.Handle(splitterMouse(MouseKind.Press, MouseButton.Left, autoSplitter.Bounds.Column, autoSplitter.Bounds.Row))
  autoRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, autoSplitter.Bounds.Column, autoSplitter.Bounds.Row + 1))
  failed = failed + Checks.Expect(autoTarget.Height.CellCount == autoStart + 1,
    "an automatic row target starts from its rendered height")

  let lostTarget = Box{ Width: CellLength.Cells(6), Height: CellLength.Cells(2) }
  let lostSplitter = Splitter(lostTarget, SplitterAxis.Columns)
  let lostRoot = Row{ Children: { lostTarget, lostSplitter, Label{ Text: "tail", GrowWeight: 1 } } }
  lostRoot.Draw(Screen(20, 4))
  let lostColumn = lostSplitter.Bounds.Column
  lostRoot.Handle(splitterMouse(MouseKind.Press, MouseButton.Left, lostColumn, 0))
  lostSplitter.IsVisible = false
  lostRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, lostColumn + 5, 0))
  lostRoot.Handle(splitterMouse(MouseKind.Release, MouseButton.Left, lostColumn + 5, 0))
  failed = failed + Checks.Expect(lostTarget.Width.CellCount == 6,
    "mouse capture loss ends dragging without a further resize")

  let resizeTarget = Box{ Width: CellLength.Cells(4), Height: CellLength.Cells(2) }
  let resizeSplitter = Splitter(resizeTarget, SplitterAxis.Columns)
  resizeSplitter.MinimumCells = 3
  resizeSplitter.MaximumCells = 6
  failed = failed + Checks.Expect(resizeSplitter.ResizeBy(2) && resizeTarget.Width.CellCount == 6,
    "ResizeBy applies a positive clamped column resize")
  failed = failed + Checks.Expect(resizeSplitter.ResizeBy(-10) && resizeTarget.Width.CellCount == 3,
    "ResizeBy applies a negative clamped column resize")
  failed = failed + Checks.Expect(!resizeSplitter.ResizeBy(0) && resizeTarget.Width.CellCount == 3,
    "ResizeBy reports an unchanged clamped cell")

  return failed
}

private func checkValidation() int32 {
  var failed = 0
  let target = Box{}
  let splitter = Splitter(target, SplitterAxis.Columns)
  failed = failed + Checks.Expect(splitter.MinimumCells == 1
      && splitter.MaximumCells == Int32.MaxValue,
    "Splitter uses safe default cell clamps")
  failed = failed + Checks.Expect(rejectsSplitterMinimum(splitter, -1),
    "negative MinimumCells is rejected")
  failed = failed + Checks.Expect(rejectsSplitterMaximum(splitter, 0),
    "MaximumCells below MinimumCells is rejected")
  failed = failed + Checks.Expect(rejectsSplitterMinimumAfterMaximum(splitter, Int32.MaxValue),
    "MinimumCells above MaximumCells is rejected")
  return failed
}

private func checkUnchangedMotion() int32 {
  let target = Box{ Width: CellLength.Cells(8), Height: CellLength.Cells(2) }
  let splitter = Splitter(target, SplitterAxis.Columns)
  let root = Row{ Children: { target, splitter, Label{ Text: "tail", GrowWeight: 1 } } }
  root.Draw(Screen(24, 4))
  let column = splitter.Bounds.Column
  root.Handle(splitterMouse(MouseKind.Press, MouseButton.Left, column, splitter.Bounds.Row))
  var warm = 0
  while warm < 64 {
    root.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, column, splitter.Bounds.Row))
    warm = warm + 1
  }
  uiBenchCollect()
  let generationBefore = GC.CollectionCount(0)
  let bytesBefore = GC.GetAllocatedBytesForCurrentThread()
  var motion = 0
  while motion < 10000 {
    root.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, column, splitter.Bounds.Row))
    motion = motion + 1
  }
  let bytesAfter = GC.GetAllocatedBytesForCurrentThread()
  let generationAfter = GC.CollectionCount(0)
  return Checks.Expect(bytesAfter == bytesBefore && generationAfter == generationBefore
      && target.Width.CellCount == 8,
    "unchanged-cell splitter motion allocates 0 B and causes no Gen0 collections")
}

private func checkUnchangedRedraw() int32 {
  let target = Box{ Width: CellLength.Cells(8), Height: CellLength.Cells(2) }
  let splitter = Splitter(target, SplitterAxis.Columns)
  let root = Row{ Children: { target, splitter, Label{ Text: "tail", GrowWeight: 1 } } }
  let screen = Screen(24, 4)
  root.Draw(screen)
  screen.Flush()
  root.Draw(screen)
  return Checks.Expect(screen.Flush().Length == 0,
    "unchanged splitter redraw emits 0 terminal bytes")
}

private func rejectsSplitterMinimum(splitter Splitter, value int32) bool {
  try {
    splitter.MinimumCells = value
    return false
  } catch (error ArgumentOutOfRangeException) {
    return true
  }
}

private func rejectsSplitterMaximum(splitter Splitter, value int32) bool {
  try {
    splitter.MaximumCells = value
    return false
  } catch (error ArgumentOutOfRangeException) {
    return true
  }
}

private func rejectsSplitterMinimumAfterMaximum(splitter Splitter, value int32) bool {
  try {
    splitter.MaximumCells = 4
    splitter.MinimumCells = value
    return false
  } catch (error ArgumentOutOfRangeException) {
    return true
  }
}

func mouseButtonEvent(kind MouseKind, button MouseButton, column int32, row int32) UiEvent {
  return UiEvent{
    Kind: UiEventKind.Mouse,
    Mouse: kind,
    Button: button,
    Position: CellPoint{ Column: column, Row: row },
  }
}

private func splitterMouse(kind MouseKind, button MouseButton, column int32, row int32) UiEvent {
  return mouseButtonEvent(kind, button, column, row)
}
