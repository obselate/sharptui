package SharpTui

import System
import System.Collections.Generic

internal open class OverlayProbe : Box {
  internal prop Marker string { get; set; }
  internal prop TextCount int32 { get; set; }
  internal prop MouseCount int32 { get; set; }

  public init() {
    Marker = "o"
    TextCount = 0
    MouseCount = 0
    CanFocus = true
  }

  protected override prop MeasuresIntrinsic bool -> true

  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    return CellSize{ WidthCells: 3, HeightRows: 1 }
  }

  protected override func Render(screen Screen, r CellRect, ink Style) {
    screen.WriteClipped(r, 0, 0, Marker, ink)
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.TextInput || ev.Kind == UiEventKind.Paste {
      TextCount = TextCount + 1
    }
    if ev.Kind == UiEventKind.Mouse { MouseCount = MouseCount + 1 }
    return EventResult.Continue
  }
}

internal open class OverlayScrollProbe : OverlayProbe {
  protected override func ScrollExtentRows() int32 -> 10
}

internal class DialogKeyProbe : Dialog {
  internal prop ShortcutCount int32 { get; set; }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Key && !inputIsRelease(ev)
        && (ev.Text == "x" || (ev.Text == "c" && ev.Modifiers == KeyModifiers.Ctrl)) {
      ShortcutCount = ShortcutCount + 1
      return EventResult.Handled
    }
    return base.Accept(ev)
  }
}

internal class SelectOverrideProbe : Select {
  protected override func Accept(ev UiEvent) EventResult -> base.Accept(ev)
}

internal class OverlayCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      let background = OverlayProbe{ Marker: "b" }
      let field = OverlayProbe{ Marker: "f" }
      let confirm = Button{ Text: "confirm" }
      let cancel = Button{ Text: "cancel" }
      var confirms = 0
      var cancels = 0
      confirm.OnClick = () -> confirms = confirms + 1
      cancel.OnClick = () -> cancels = cancels + 1
      let panel = Column{ Children: { field, confirm, cancel } }
      let overlay = Overlay{
        Content: panel,
        DefaultAction: confirm,
        CancelAction: cancel,
        DimBackground: true,
      }
      let root = Box{ Children: { background, overlay } }
      root.Focus(background)
      let screen = Screen(30, 10)
      root.Draw(screen)

      failed = failed + Checks.Expect(field.IsFocused,
        "Overlay moves focus into its content when opened")
      failed = failed + Checks.Expect(root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Tab })
          == EventResult.Handled && confirm.IsFocused && !background.IsFocused,
        "Overlay traps Tab inside its content")
      failed = failed + Checks.Expect(root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.BackTab })
          == EventResult.Handled && field.IsFocused,
        "Overlay traps BackTab inside its content")

      root.Handle(UiEvent{ Kind: UiEventKind.TextInput, Key: Key.Character, Text: "x" })
      root.Handle(UiEvent{ Kind: UiEventKind.Paste, Text: "paste" })
      failed = failed + Checks.Expect(field.TextCount == 2 && background.TextCount == 0,
        "Overlay rejects background keyboard and paste input")
      root.Handle(UiEvent{
        Kind: UiEventKind.Mouse,
        Mouse: MouseKind.Press,
        Position: CellPoint{ Column: background.Bounds.Column, Row: background.Bounds.Row },
      })
      failed = failed + Checks.Expect(background.MouseCount == 0,
        "Overlay rejects background mouse input")

      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter })
      failed = failed + Checks.Expect(confirms == 1,
        "Overlay offers Enter to DefaultAction after focused content declines")
      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter, Phase: KeyPhase.Release })
      failed = failed + Checks.Expect(confirms == 1,
        "Overlay ignores DefaultAction key release")
      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Escape })
      failed = failed + Checks.Expect(cancels == 1,
        "Overlay offers Escape to CancelAction")
      failed = failed + Checks.Expect(screen.Flush().Contains(Ansi.Csi + "2m"),
        "Overlay can dim the background")

      overlay.IsVisible = false
      failed = failed + Checks.Expect(!overlay.IsVisible && background.IsFocused,
        "IsVisible false closes Overlay and restores prior focus")
      root.Handle(UiEvent{ Kind: UiEventKind.TextInput, Key: Key.Character, Text: "y" })
      failed = failed + Checks.Expect(background.TextCount == 1,
        "Closed Overlay releases input to the background")
      overlay.IsVisible = true
      failed = failed + Checks.Expect(overlay.IsVisible && field.IsFocused,
        "IsVisible true reopens Overlay and moves focus into its content")
      overlay.IsVisible = false
      failed = failed + Checks.Expect(!overlay.IsVisible && background.IsFocused,
        "IsVisible false keeps Overlay closed and restores prior focus")
      overlay.IsVisible = true
      failed = failed + Checks.Expect(overlay.IsVisible && field.IsFocused,
        "IsVisible true reopens Overlay through the same focus lifecycle")

      let behind = OverlayProbe{ Marker: "b", Placement: Placement.At(CellPoint{}) }
      let front = OverlayProbe{ Marker: "f" }
      let frontOverlay = Overlay{ Content: front, Placement: Placement.At(CellPoint{}) }
      let ordered = Box{ Children: { Form{ Height: CellLength.Cells(1), Children: { frontOverlay } }, behind } }
      let orderedScreen = Screen(8, 3)
      ordered.Draw(orderedScreen)
      failed = failed + Checks.Expect(orderedScreen.Probe(0, 0) == "f",
        "Nested Overlay paints above later branches of the tree")

      let first = OverlayProbe{ Marker: "1" }
      let hidden = OverlayProbe{ Marker: "2" }
      let last = OverlayProbe{ Marker: "3" }
      let row = Row{ Gap: 1, Children: { first, hidden, last } }
      let visibilityScreen = Screen(20, 3)
      row.Draw(visibilityScreen)
      let lastBefore = last.Bounds.Column
      row.Focus(hidden)
      hidden.IsVisible = false
      visibilityScreen.Clear()
      row.Draw(visibilityScreen)
      failed = failed + Checks.Expect(hidden.Bounds.WidthCells == 0 && last.Bounds.Column < lastBefore,
        "IsVisible false removes a subtree from Yoga layout")
      let painted = OverlayProbe{ Marker: "p" }
      let paintRoot = Box{ Children: { painted } }
      let paintScreen = Screen(4, 1)
      paintRoot.Draw(paintScreen)
      painted.IsVisible = false
      paintScreen.Clear()
      paintRoot.Draw(paintScreen)
      failed = failed + Checks.Expect(paintScreen.Probe(0, 0) == " ",
        "Invisible subtrees are excluded from painting")
      failed = failed + Checks.Expect(first.IsFocused && !hidden.IsFocused,
        "Collapsing a focused subtree deterministically moves focus")
      row.Handle(UiEvent{ Kind: UiEventKind.TextInput, Key: Key.Character, Text: "z" })
      failed = failed + Checks.Expect(hidden.TextCount == 0,
        "Invisible subtrees are excluded from focus and input routing")
      hidden.IsVisible = true
      visibilityScreen.Clear()
      row.Draw(visibilityScreen)
      failed = failed + Checks.Expect(hidden.Bounds.WidthCells > 0 && last.Bounds.Column == lastBefore,
        "IsVisible true restores the subtree to Yoga layout")

      let scroll = OverlayScrollProbe{}
      let scrollRoot = Box{
        Width: CellLength.Cells(6),
        Height: CellLength.Cells(2),
        ShowScrollbar: true,
        Children: { scroll },
      }
      let scrollScreen = Screen(6, 2)
      scrollRoot.Draw(scrollScreen)
      scroll.IsVisible = false
      scrollScreen.Clear()
      scrollRoot.Draw(scrollScreen)
      failed = failed + Checks.Expect(scrollScreen.Probe(5, 0) != "│" && scrollScreen.Probe(5, 0) != "█",
        "Invisible subtrees are excluded from scrollbar discovery")

      let stableBackground = OverlayProbe{}
      let stableContent = OverlayProbe{}
      let stableOverlay = Overlay{ Content: stableContent }
      let stableRoot = Box{ Children: { stableBackground, stableOverlay } }
      let stableScreen = Screen(20, 6)
      stableRoot.Focus(stableBackground)
      stableScreen.Clear()
      stableRoot.Draw(stableScreen)
      stableScreen.Flush()
      stableScreen.Clear()
      stableRoot.Draw(stableScreen)
      stableScreen.Flush()
      let before = GC.GetAllocatedBytesForCurrentThread()
      stableRoot.Draw(stableScreen)
      let after = GC.GetAllocatedBytesForCurrentThread()
      failed = failed + Checks.Expect(after == before,
        "Overlay unchanged redraw is allocation-free after warmup")

      failed = failed + checkBoundedChoices()
      failed = failed + checkPopupLayers()
      return failed
    }

    private func checkPopupLayers() int32 {
      var failed = 0
      let chooser = SelectOverrideProbe{
        Width: CellLength.Cells(20),
        Options: List[string]{ "选项零", "选项一", "选项二", "选项三", "选项四", "选项五", "选项六", "选项七" },
      }
      let changes = List[bool](10)
      chooser.OnOpenChange = opened -> changes.Add(opened)
      let form = Form{ LabelWidth: 6, Height: CellLength.Cells(4) }
      form.Add(FormField{ Label: "Choice", Editor: chooser })
      let later = List[OverlayProbe](5)
      for i in 0 ... 5 {
        let editor = OverlayProbe{ Marker: "later row", Width: CellLength.Cells(20) }
        later.Add(editor)
        form.Add(FormField{ Label: "Later", Editor: editor })
      }
      let behind = OverlayProbe{
        Marker: "underlying", Width: CellLength.Cells(40), Height: CellLength.Cells(8),
        Style: Style{ Background: Color.TerminalDefault },
      }
      let root = Box{ Children: { form, behind } }
      let screen = Screen(40, 12)
      screen.ColorMode = TerminalColorMode.NoColor
      root.Draw(screen)
      root.Focus(chooser)
      root.Handle(keyEv(Key.Enter))
      screen.Clear()
      root.Draw(screen)
      let column = chooser.Bounds.Column
      let row = chooser.Bounds.Row
      let edge = form.Bounds.Row + form.Bounds.HeightRows
      failed += Checks.Expect(chooser.IsOpen && screen.Probe(column, row + 1) == "┌"
          && screen.Probe(column + 1, row + 2) == "选"
          && screen.Probe(column + 1, edge) == "选"
          && column >= 0 && column + chooser.Bounds.WidthCells <= 40 && row + 8 < 12
          && screen.Probe(column + chooser.Bounds.WidthCells - 1, row + 8) == "┘",
        "Select in the first of six form rows paints above later rows and beyond the form clip within 40x12")
      root.Draw(screen)
      let before = GC.GetAllocatedBytesForCurrentThread()
      root.Draw(screen)
      failed += Checks.Expect(GC.GetAllocatedBytesForCurrentThread() == before,
        "Clipped form popup repaint allocates no managed memory after warmup")
      root.Handle(mouseEv(column + 1, row + 3))
      failed += Checks.Expect(!chooser.IsOpen && chooser.SelectedIndex == 1 && later[2].MouseCount == 0,
        "Popup item clicks select instead of reaching the form row underneath")
      root.Handle(keyEv(Key.Enter))
      root.Handle(mouseEv(column + 1, edge))
      failed += Checks.Expect(!chooser.IsOpen && chooser.SelectedIndex == edge - row - 2
          && behind.MouseCount == 0,
        "Popup item clicks beyond a clipping parent select before background input")
      root.Handle(keyEv(Key.Enter))
      root.Handle(keyEv(Key.Enter))
      failed += Checks.Expect(!chooser.IsOpen, "Select Enter closes the popup")
      root.Handle(keyEv(Key.Enter))
      root.Handle(keyEv(Key.Escape))
      failed += Checks.Expect(!chooser.IsOpen, "Select Escape closes the popup")
      root.Handle(mouseEv(column, row))
      root.Handle(mouseEv(39, 11))
      failed += Checks.Expect(!chooser.IsOpen && behind.MouseCount == 0,
        "Select outside click closes without reaching the background")
      var notified = changes.Count == 10
      for i in 0 ... changes.Count {
        if changes[i] != (i % 2 == 0) { notified = false }
      }
      failed += Checks.Expect(notified, "Select notifies every open and Enter, Escape, item, or outside-click close")
      return failed
    }

    private func checkBoundedChoices() int32 {
      var failed = 0
      let widths = List[int32]{ 40, 60, 80, 120, 160 }
      let heights = List[int32]{ 12, 18, 24, 36, 48 }
      var size = 0
      while size < widths.Count {
        let width = widths[size]
        let height = heights[size]
        let screen = Screen(width, height)
        screen.ColorMode = TerminalColorMode.NoColor
        let chooser = Select{
          Width: CellLength.Cells(width + 10),
          Height: CellLength.Cells(1),
          Placement: Placement.At(CellPoint{ Column: width - 4, Row: height - 1 }),
        }
        var i = 0
        while i < 24 {
          chooser.Options.Add(i % 2 == 0 ? "English option" : "中文选项")
          i = i + 1
        }
        let root = Box{ Children: { chooser } }
        root.Focus(chooser)
        root.Draw(screen)
        root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter })
        root.Draw(screen)
        failed = failed + Checks.Expect(screen.Probe(0, height - 9) == "┌"
            && screen.Probe(width - 1, height - 2) == "┘",
          "Select flips above and bounds its border to the viewport")
        root.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollDown,
          Position: CellPoint{ Column: 1, Row: height - 8 } })
        root.Draw(screen)
        failed = failed + Checks.Expect(chooser.IsOpen && chooser.SelectedIndex == 0
            && screen.Probe(1, height - 8) == "中",
          "Select wheel scrolls options without changing the selection")
        root.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Button: MouseButton.Right,
          Position: CellPoint{ Column: 1, Row: height - 8 } })
        failed = failed + Checks.Expect(chooser.IsOpen, "Select right click does not choose an option")
        root.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Button: MouseButton.Left,
          Position: CellPoint{ Column: 1, Row: height - 8 } })
        failed = failed + Checks.Expect(!chooser.IsOpen && chooser.SelectedIndex == Selection.WheelStep,
          "Select left click chooses a scrolled option")
        root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter })
        i = chooser.SelectedIndex
        while i < 23 {
          root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Down })
          i = i + 1
        }
        root.Draw(screen)
        root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter })
        failed = failed + Checks.Expect(chooser.SelectedIndex == 23, "Select keys reach the last option")
        let dialog = DialogKeyProbe{
          Message: "A long message wraps inside the available content width. 中文消息必须在内容区域内换行。"
            + " Additional text keeps the body locally scrollable at narrow sizes." + String(char(120), 400),
        }
        i = 0
        while i < 3 {
          dialog.Actions.Add(DialogAction{ Text: i % 2 == 0 ? "English action" : "中文操作", IsCancel: i == 2 })
          i = i + 1
        }
        var result = -1
        dialog.OnResult = action -> result = dialog.Actions.IndexOf(action)
        let dialogBackground = OverlayProbe{}
        let dialogRoot = Box{ Children: { dialogBackground, dialog } }
        dialogRoot.Draw(screen)
        let bounds = dialog.Bounds
        failed = failed + Checks.Expect(bounds.Column >= 0 && bounds.Row >= 0
            && bounds.Column + bounds.WidthCells <= width && bounds.Row + bounds.HeightRows <= height,
          "Dialog bounds include its border and padding inside the viewport")
        if size == 0 {
          dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Character, Text: "x" })
          dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Character, Text: "c",
            Modifiers: KeyModifiers.Ctrl })
          failed = failed + Checks.Expect(dialog.ShortcutCount == 2,
            "Dialog subclasses receive letter shortcuts and Ctrl+C")
          failed = failed + Checks.Expect(dialogRoot.Handle(UiEvent{
              Kind: UiEventKind.TextInput, Key: Key.Character, Text: "z" }) == EventResult.Handled
              && dialogBackground.TextCount == 0,
            "Dialog subclasses keep unhandled input inside the modal scope")
          dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press,
            Button: MouseButton.Left, Position: CellPoint{} })
          failed = failed + Checks.Expect(dialogBackground.MouseCount == 0,
            "Dialog subclasses still block outside clicks")
        }
        let body = dialog.Children[0]
        if size == 0 && body is TextBlock {
          dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.PageDown })
          failed = failed + Checks.Expect(body.FirstVisibleLine > 0, "Dialog PageDown scrolls its body locally")
          dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.PageUp })
          dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollDown,
            Position: CellPoint{ Column: body.Bounds.Column, Row: body.Bounds.Row } })
          failed = failed + Checks.Expect(body.FirstVisibleLine > 0 && dialogRoot.Bounds.Row == 0,
            "Dialog wheel scrolls its body without moving the application")
        }
        i = 0
        while i < dialog.Actions.Count {
          let button = dialog.Children[1].Children[i]
          if i > 0 { dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Tab }) }
          dialogRoot.Draw(screen)
          failed = failed + Checks.Expect(button.IsFocused && button.Bounds.HeightRows == 1
              && button.Bounds.WidthCells == dialog.ContentBounds.WidthCells
              && button.Bounds.Row >= bounds.Row && button.Bounds.Row < bounds.Row + bounds.HeightRows,
            "Dialog keeps every action inside its content region")
          dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter })
          failed = failed + Checks.Expect(result == i, "Dialog action is reachable by key")
          result = -1
          dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Button: MouseButton.Left,
            Position: CellPoint{ Column: button.Bounds.Column, Row: button.Bounds.Row } })
          failed = failed + Checks.Expect(result == i, "Dialog action is reachable by left click")
          i = i + 1
        }
        dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Up })
        failed = failed + Checks.Expect(dialog.Children[1].Children[1].IsFocused,
          "Stacked Dialog Up moves focus to the previous action")
        dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Down })
        failed = failed + Checks.Expect(dialog.Children[1].Children[2].IsFocused,
          "Stacked Dialog Down moves focus to the next action")
        dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Escape })
        failed = failed + Checks.Expect(result == 2, "Dialog preserves the cancel action")
        dialog.Message = ""
        dialogRoot.Draw(screen)
        failed = failed + Checks.Expect(dialog.Children[0].Bounds.HeightRows == 0,
          "Dialog empty message consumes no row")
        for action in dialog.Actions { action.Text = "English action" }
        i = 0
        while i < chooser.Options.Count {
          chooser.Options[i] = "English option"
          i = i + 1
        }
        chooser.Refresh()
        dialog.Message = "A long message that wraps to the actual content width and scrolls locally."
        dialogRoot.Draw(screen)
        root.Draw(screen)
        dialogRoot.Draw(screen)
        root.Draw(screen)
        dialogRoot.Focus(dialog.Children[1].Children[0])
        dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Right })
        dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Left })
        let before = GC.GetAllocatedBytesForCurrentThread()
        dialogRoot.Draw(screen)
        root.Draw(screen)
        dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.PageDown })
        dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Right })
        dialogRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Left })
        root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter })
        root.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollDown,
          Position: CellPoint{ Column: 1, Row: height - 8 } })
        failed = failed + Checks.Expect(GC.GetAllocatedBytesForCurrentThread() == before,
          "Bounded dialog paint and popup wheel routing allocate no managed memory after warmup")
        dialog.Message = ""
        dialog.Actions = List[DialogAction]{
          DialogAction{ Text: "Accept" }, DialogAction{ Text: "取消", IsCancel: true },
        }
        dialogRoot.Draw(screen)
        failed = failed + Checks.Expect(dialog.Children[1].Children[0].Bounds.Row
            == dialog.Children[1].Children[1].Bounds.Row && dialog.Bounds.HeightRows == 5,
          "Dialog places fitting actions in one row without an empty message row")
        size = size + 1
      }
      return failed
    }
  }
}
