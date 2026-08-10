package SharpTui

import System

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

  protected override prop MeasuresIntrinsic bool { get { return true } }

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
  protected override func ScrollExtentRows() int32 { return 10 }
}

internal class OverlayCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      let background = OverlayProbe{ Marker: "b" }
      let field = OverlayProbe{ Marker: "f" }
      let confirm = Button{ Text: "confirm" }
      let cancel = Button{ Text: "cancel" }
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
      failed = failed + Checks.Expect(confirm.ConsumePress(),
        "Overlay offers Enter to DefaultAction after focused content declines")
      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter, Phase: KeyPhase.Release })
      failed = failed + Checks.Expect(!confirm.ConsumePress(),
        "Overlay ignores DefaultAction key release")
      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Escape })
      failed = failed + Checks.Expect(cancel.ConsumePress(),
        "Overlay offers Escape to CancelAction")
      failed = failed + Checks.Expect(screen.Flush().Contains(Ansi.Csi + "2m"),
        "Overlay can dim the background")

      overlay.IsOpen = false
      failed = failed + Checks.Expect(!overlay.IsOpen && !overlay.IsVisible && background.IsFocused,
        "IsOpen closes Overlay through its single visibility state")
      root.Handle(UiEvent{ Kind: UiEventKind.TextInput, Key: Key.Character, Text: "y" })
      failed = failed + Checks.Expect(background.TextCount == 1,
        "Closed Overlay releases input to the background")
      overlay.IsOpen = true
      failed = failed + Checks.Expect(overlay.IsVisible && field.IsFocused,
        "IsOpen reopens Overlay and moves focus into its content")
      overlay.IsVisible = false
      failed = failed + Checks.Expect(!overlay.IsOpen && background.IsFocused,
        "IsVisible false closes Overlay and restores prior focus")
      overlay.IsVisible = true
      failed = failed + Checks.Expect(overlay.IsOpen && field.IsFocused,
        "IsVisible true reopens Overlay through the same focus lifecycle")

      let behind = OverlayProbe{ Marker: "b" }
      let front = OverlayProbe{ Marker: "f" }
      let frontOverlay = Overlay{ Content: front, Placement: Placement.At(CellPoint{}) }
      let ordered = Box{ Children: { frontOverlay, behind } }
      let orderedScreen = Screen(8, 3)
      ordered.Draw(orderedScreen)
      failed = failed + Checks.Expect(orderedScreen.Probe(0, 0) == "f",
        "Overlay paints above normal siblings regardless of child order")

      let first = OverlayProbe{ Marker: "1" }
      let hidden = OverlayProbe{ Marker: "2" }
      let last = OverlayProbe{ Marker: "3" }
      let row = Row{ GapCells: 1, Children: { first, hidden, last } }
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

      return failed
    }
  }
}
