package SharpTui

import System
import System.Collections.Generic

internal class FormEditorProbe : Box {
  internal var Presses int32
  internal var Wheels int32

  public init() {
    CanFocus = true
    Width = CellLength.Cells(32)
    Height = CellLength.Cells(3)
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind != UiEventKind.Mouse { return EventResult.Continue }
    if ev.Mouse == MouseKind.Press { Presses = Presses + 1 }
    if ev.Mouse == MouseKind.ScrollUp || ev.Mouse == MouseKind.ScrollDown { Wheels = Wheels + 1 }
    return EventResult.Handled
  }
}

internal class FormCheck {
  shared {
    internal func Run() int32 {
      let constrained = Box{ Width: CellLength.Cells(64), Height: CellLength.Cells(1), ConstrainWidth: true }
      let constraintRoot = Box{ Children: { constrained } }
      constraintRoot.Compute(32, 1)
      let constrainedWidth = constrained.Bounds.WidthCells
      constrained.ConstrainWidth = false
      constraintRoot.Compute(32, 1)
      var failed = 0
      failed = failed + Checks.Expect(constrainedWidth == 32 && constrained.Bounds.WidthCells == 64,
        "Disabling a form width constraint restores the editor's requested width")
      let first = TextInput{ Text: "保留文本", Width: CellLength.Cells(32), CaretGraphemeIndex: 2 }
      let probe = FormEditorProbe{}
      let last = TextInput{ Text: "末行", CaretGraphemeIndex: 1 }
      let field = FormField{
        Label: "名称", Editor: first, IsModified: true, StateText: "!",
        StateStyle: Style{ Foreground: Color.Rgb("FF0000"), Attributes: TextAttributes.Bold },
      }
      let form = Form{ Grow: 1, ShowBorder: true, ShowScrollbar: true, LabelWidth: 10 }
      form.Add(field)
      form.Add(FormField{ Label: "多行", Editor: probe })
      for i in 0 ... 18 {
        form.Add(FormField{ Label: "字段", Editor: TextInput{ Text: "值" } })
      }
      let lastField = FormField{ Label: "末尾", Editor: last }
      form.Add(lastField)
      let footer = Label{ Text: "bottom", Height: CellLength.Cells(1) }
      let root = Column{ Children: { Label{ Text: "top", Height: CellLength.Cells(1) }, form, footer } }
      let screen = Screen(40, 12)
      root.Draw(screen)
      failed = failed + Checks.Expect(first.Bounds.Row > field.Bounds.Row
        && first.Bounds.WidthCells <= form.ContentBounds.WidthCells,
        "Form stacks a label above an editor when their widths do not fit")
      failed = failed + Checks.Expect(screen.Probe(field.Bounds.Column, field.Bounds.Row) == "名"
        && screen.Probe(field.Bounds.Column + 2, field.Bounds.Row) == "称",
        "Form paints double-width labels at terminal-cell boundaries")
      let label = field.Children[0]
      let valueRow = field.Children[1]
      let originalChildren = form.Children
      let widths = List[int32]{ 40, 60, 80, 120, 160 }
      let heights = List[int32]{ 12, 18, 24, 36, 48 }
      for width in widths {
        for height in heights {
          screen.Resize(width, height)
          screen.Clear()
          root.Draw(screen)
          let view = form.ContentBounds
          failed = failed + Checks.Expect(footer.Bounds.Row == height - 1
            && screen.Probe(0, height - 1) == "b" && view.Row >= 1
            && view.Row + view.HeightRows <= footer.Bounds.Row,
            "Form keeps scrolling inside its region at supported terminal sizes")
          for child in form.Children {
            if child is FormField && child.Editor != nil {
              let editor = child.Editor!!
              failed = failed + Checks.Expect(editor.Bounds.Column >= view.Column
                && editor.Bounds.Column + editor.Bounds.WidthCells <= view.Column + view.WidthCells,
                "Form fits retained editor widths at supported terminal sizes")
            }
          }
          if width >= 60 {
            failed = failed + Checks.Expect(first.Bounds.Row == field.Bounds.Row,
              "Form keeps labels beside editors when their measured widths fit")
          }
        }
      }
      screen.Resize(40, 12)
      root.Draw(screen)
      root.Focus(first)
      root.Handle(UiEvent{ Kind: UiEventKind.TextInput, Key: Key.Character, Text: "A" })
      failed = failed + Checks.Expect(first.Text == "保留A文本" && first.CaretGraphemeIndex == 3,
        "Form sends text edits to its retained focused editor")
      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Backspace })
      for i in 0 ... form.Children.Count - 1 {
        root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Tab })
        root.Draw(screen)
      }
      failed = failed + Checks.Expect(Object.ReferenceEquals(root.FocusedElement, last)
        && form.FirstVisibleRow > 0 && form.ContentBounds.Contains(last.Bounds.Column, last.Bounds.Row),
        "Form reveals an editor reached by normal Tab focus near the bottom")
      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.BackTab })
      root.Draw(screen)
      failed = failed + Checks.Expect(!Object.ReferenceEquals(root.FocusedElement, last),
        "Form uses normal BackTab traversal")
      let offset = form.FirstVisibleRow
      let wheel = UiEvent{
        Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollUp,
        Position: CellPoint{ Column: form.ContentBounds.Column, Row: form.ContentBounds.Row },
      }
      failed = failed + Checks.Expect(root.Handle(wheel) == EventResult.Handled
        && form.FirstVisibleRow == Math.Max(0, offset - 3), "Form consumes wheel input inside its viewport")
      root.Draw(screen)
      let scrolled = form.FirstVisibleRow
      root.Handle(UiEvent{
        Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollDown,
        Position: CellPoint{ Column: 0, Row: footer.Bounds.Row },
      })
      failed = failed + Checks.Expect(form.FirstVisibleRow == scrolled,
        "Form ignores wheel input outside its region")
      form.FirstVisibleRow = 0
      root.Draw(screen)
      root.Handle(UiEvent{
        Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollDown,
        Position: CellPoint{ Column: probe.Bounds.Column, Row: probe.Bounds.Row },
      })
      failed = failed + Checks.Expect(probe.Wheels == 0 && form.FirstVisibleRow == 3,
        "Form owns wheel scrolling over a child editor")
      root.Draw(screen)
      let presses = probe.Presses
      root.Handle(UiEvent{
        Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Button: MouseButton.Left,
        Position: CellPoint{ Column: probe.Bounds.Column, Row: probe.Bounds.Row },
      })
      root.Draw(screen)
      failed = failed + Checks.Expect(probe.Presses == presses + 1
        && Object.ReferenceEquals(root.FocusedElement, probe), "Form editors use normal click focus")
      let oldProbeBounds = probe.Bounds
      form.Children[1].IsVisible = false
      root.Draw(screen)
      root.Handle(UiEvent{
        Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Button: MouseButton.Left,
        Position: CellPoint{ Column: oldProbeBounds.Column, Row: oldProbeBounds.Row },
      })
      failed = failed + Checks.Expect(probe.Bounds.WidthCells == 0 && probe.Presses == presses + 1
        && !Object.ReferenceEquals(root.FocusedElement, probe), "Form never hit-tests hidden fields")
      root.Focus(last)
      root.Draw(screen)
      field.Height = CellLength.Cells(8)
      root.Draw(screen)
      failed = failed + Checks.Expect(form.ContentBounds.Contains(last.Bounds.Column, last.Bounds.Row),
        "Form keeps the focused editor visible after preceding field heights change")
      field.Height = CellLength.Auto
      root.Draw(screen)
      let offscreenPresses = probe.Presses
      root.Handle(UiEvent{
        Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Button: MouseButton.Left,
        Position: CellPoint{ Column: first.Bounds.Column, Row: form.Bounds.Row },
      })
      failed = failed + Checks.Expect(Object.ReferenceEquals(root.FocusedElement, last)
        && probe.Presses == offscreenPresses, "Form never hit-tests fields outside its viewport")
      failed = failed + Checks.Expect(first.Text == "保留文本" && first.CaretGraphemeIndex == 2
        && last.Text == "末行" && last.CaretGraphemeIndex == 1
        && Object.ReferenceEquals(form.Children, originalChildren)
        && Object.ReferenceEquals(field.Children[0], label) && Object.ReferenceEquals(field.Children[1], valueRow)
        && Object.ReferenceEquals(field.Editor, first), "Form retains editor state and child instances across scrolling and resizing")
      root.ClearFocus()
      form.FirstVisibleRow = 0
      screen.Resize(160, 48)
      screen.ColorMode = TerminalColorMode.NoColor
      screen.Clear()
      root.Draw(screen)
      let output = screen.Flush()
      failed = failed + Checks.Expect(output.Contains("*") && output.Contains("!")
        && output.Contains("[1m") && !output.Contains("[38;2;") && !output.Contains("[48;2;"),
        "Form modified and state symbols remain visible without color")
      field.Editor = Label{ Text: "保留文本" }
      lastField.Editor = Label{ Text: "末行" }
      let allocationWidths = List[int32]{ 40, 160 }
      for width in allocationWidths {
        screen.Resize(width, 12)
        let wheelDown = UiEvent{
          Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollDown, Position: wheel.Position,
        }
        for i in 0 ... 64 {
          root.Draw(screen)
          root.Handle(wheel)
          root.Handle(wheelDown)
        }
        let before = GC.GetAllocatedBytesForCurrentThread()
        for i in 0 ... 64 {
          root.Draw(screen)
          root.Handle(wheel)
          root.Handle(wheelDown)
        }
        let allocated = GC.GetAllocatedBytesForCurrentThread() - before
        failed = failed + Checks.Expect(allocated == 0,
          "Form steady ZH label paint and wheel input allocate zero bytes: " + allocated.ToString())
      }
      return failed
    }
  }
}
