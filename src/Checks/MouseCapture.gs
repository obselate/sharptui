package SharpTui

import System
import System.Collections.Generic

internal open class MouseCaptureProbe : Box {
  internal prop PressCount int32 { get; set; }
  internal prop MoveCount int32 { get; set; }
  internal prop ReleaseCount int32 { get; set; }
  internal prop LostCount int32 { get; set; }
  internal prop CaptureOnPress bool { get; set; }
  internal prop ConsumeMouse bool { get; set; }
  internal prop ReleaseExplicitly bool { get; set; }
  internal prop ReleaseSawCapture bool { get; set; }
  internal prop CaptureResult bool { get; set; }

  public init() {
    PressCount = 0
    MoveCount = 0
    ReleaseCount = 0
    LostCount = 0
    CaptureOnPress = false
    ConsumeMouse = false
    ReleaseExplicitly = false
    ReleaseSawCapture = false
    CaptureResult = false
    CanReceiveMouse = true
  }

  internal func MakeFocusable() {
    CanFocus = true
  }

  internal func TryCapture() bool {
    return CaptureMouse()
  }

  internal prop Captured bool { get { return HasMouseCapture } }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind != UiEventKind.Mouse { return EventResult.Continue }
    if ev.Mouse == MouseKind.Press {
      PressCount = PressCount + 1
      if CaptureOnPress { CaptureResult = CaptureMouse() }
    }
    if ev.Mouse == MouseKind.Move { MoveCount = MoveCount + 1 }
    if ev.Mouse == MouseKind.Release {
      ReleaseCount = ReleaseCount + 1
      ReleaseSawCapture = HasMouseCapture
      if ReleaseExplicitly { ReleaseMouseCapture() }
    }
    if ConsumeMouse { return EventResult.Handled }
    return EventResult.Continue
  }

  protected override func MouseCaptureLost() {
    LostCount = LostCount + 1
  }
}

internal open class MouseCaptureAncestor : Box {
  internal prop MoveCount int32 { get; set; }
  internal prop ReleaseCount int32 { get; set; }

  public init() {
    MoveCount = 0
    ReleaseCount = 0
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Move {
      MoveCount = MoveCount + 1
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Release {
      ReleaseCount = ReleaseCount + 1
    }
    return EventResult.Continue
  }
}

internal class MouseCaptureCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      let keyboard = MouseCaptureProbe{
        Width: CellLength.Cells(4), Height: CellLength.Cells(1), ConsumeMouse: true,
      }
      keyboard.MakeFocusable()
      let captured = MouseCaptureProbe{
        Width: CellLength.Cells(4),
        Height: CellLength.Cells(1),
        CaptureOnPress: true,
      }
      let ancestor = MouseCaptureAncestor{ Children: { captured } }
      let other = MouseCaptureProbe{ Width: CellLength.Cells(4), Height: CellLength.Cells(1) }
      let focusTarget = MouseCaptureProbe{ Width: CellLength.Cells(4), Height: CellLength.Cells(1) }
      focusTarget.MakeFocusable()
      let root = Row{ Children: { keyboard, ancestor, other, focusTarget } }
      root.Draw(Screen(40, 3))
      root.Focus(keyboard)

      let press = mouseCaptureEvent(MouseKind.Press, captured.Bounds.Column + 1, captured.Bounds.Row)
      root.Handle(press)
      failed = failed + Checks.Expect(captured.PressCount == 1 && captured.CaptureResult
          && captured.Captured && keyboard.IsFocused && keyboard.PressCount == 0,
        "mouse-only press receives input and preserves keyboard focus")

      root.Handle(mouseCaptureEvent(MouseKind.Move, 100, 100))
      root.Handle(mouseCaptureEvent(MouseKind.Move, other.Bounds.Column + 1, other.Bounds.Row))
      failed = failed + Checks.Expect(captured.MoveCount == 2 && ancestor.MoveCount == 2
          && other.MoveCount == 0 && keyboard.MoveCount == 0,
        "captured motion stays on the owner and bubbles outside and over another widget")

      root.Handle(mouseCaptureEvent(MouseKind.Release, 100, 100))
      failed = failed + Checks.Expect(captured.ReleaseCount == 1 && captured.ReleaseSawCapture
          && ancestor.ReleaseCount == 1 && !captured.Captured && captured.LostCount == 0
          && keyboard.ReleaseCount == 0,
        "captured release bubbles before normal release clears capture")

      root.Handle(mouseCaptureEvent(MouseKind.Move, 100, 100))
      failed = failed + Checks.Expect(keyboard.MoveCount == 0,
        "a no-hit mouse move is not delivered to the focused control")
      root.Handle(mouseCaptureEvent(MouseKind.Press, other.Bounds.Column + 1, other.Bounds.Row))
      failed = failed + Checks.Expect(other.PressCount == 1 && keyboard.IsFocused
          && keyboard.PressCount == 0,
        "uncaptured mouse routing remains compatible for mouse-only targets")
      root.Handle(mouseCaptureEvent(MouseKind.Press, focusTarget.Bounds.Column + 1, focusTarget.Bounds.Row))
      failed = failed + Checks.Expect(focusTarget.IsFocused && !keyboard.IsFocused,
        "uncaptured press focuses a focus-capable target")

      let transferA = MouseCaptureProbe{
        Width: CellLength.Cells(4), Height: CellLength.Cells(1), CaptureOnPress: true,
      }
      let transferB = MouseCaptureProbe{
        Width: CellLength.Cells(4), Height: CellLength.Cells(1), CaptureOnPress: true,
      }
      let transferRoot = Row{ Children: { transferA, transferB } }
      transferRoot.Draw(Screen(12, 2))
      transferRoot.Handle(mouseCaptureEvent(MouseKind.Press, transferA.Bounds.Column + 1, transferA.Bounds.Row))
      transferRoot.Handle(mouseCaptureEvent(MouseKind.Press, transferB.Bounds.Column + 1, transferB.Bounds.Row))
      failed = failed + Checks.Expect(transferA.LostCount == 1 && transferB.CaptureResult
          && transferB.Captured,
        "a new owner transfers capture and calls the old lost hook once")
      transferRoot.Handle(mouseCaptureEvent(MouseKind.Release, transferB.Bounds.Column + 1, transferB.Bounds.Row))
      failed = failed + Checks.Expect(transferB.LostCount == 0 && !transferB.Captured,
        "owner release clears capture without a lost hook")

      let hidden = MouseCaptureProbe{
        Width: CellLength.Cells(4), Height: CellLength.Cells(1), CaptureOnPress: true,
      }
      let hiddenRoot = Box{ Children: { hidden } }
      hiddenRoot.Draw(Screen(8, 2))
      hiddenRoot.Handle(mouseCaptureEvent(MouseKind.Press, 1, 0))
      hidden.IsVisible = false
      failed = failed + Checks.Expect(hidden.LostCount == 1 && !hidden.Captured,
        "hiding a capture owner clears capture and calls the lost hook")

      let detached = MouseCaptureProbe{
        Width: CellLength.Cells(4), Height: CellLength.Cells(1), CaptureOnPress: true,
      }
      detached.MakeFocusable()
      let detachedRoot = Box{ Children: { detached } }
      detachedRoot.Draw(Screen(8, 2))
      detachedRoot.Handle(mouseCaptureEvent(MouseKind.Press, 1, 0))
      detachedRoot.Children.RemoveAt(0)
      detachedRoot.Handle(mouseCaptureEvent(MouseKind.Move, 50, 50))
      detachedRoot.Handle(mouseCaptureEvent(MouseKind.Move, 50, 50))
      failed = failed + Checks.Expect(detached.LostCount == 1 && !detached.Captured
          && !detached.IsAttached && !detached.IsFocused && detachedRoot.FocusedElement == nil,
        "detaching a capture owner clears capture, focus, and stale parent state")

      let replaced = MouseCaptureProbe{
        Width: CellLength.Cells(4), Height: CellLength.Cells(1), CaptureOnPress: true,
      }
      replaced.MakeFocusable()
      let replacementRoot = Box{ Children: { replaced } }
      replacementRoot.Draw(Screen(8, 2))
      replacementRoot.Handle(mouseCaptureEvent(MouseKind.Press, 1, 0))
      let emptyChildren = List[Box]()
      replacementRoot.Children = emptyChildren
      failed = failed + Checks.Expect(replaced.LostCount == 1 && !replaced.Captured
          && !replaced.IsAttached && !replaced.IsFocused,
        "children replacement immediately clears capture, focus, and parent state")

      let background = MouseCaptureProbe{
        Width: CellLength.Cells(5), Height: CellLength.Cells(1), CaptureOnPress: true,
      }
      let scopeContent = MouseCaptureProbe{ Width: CellLength.Cells(5), Height: CellLength.Cells(1) }
      let overlay = Overlay{ Content: scopeContent }
      overlay.IsVisible = false
      let scopeRoot = Row{ Children: { background, overlay } }
      scopeRoot.Draw(Screen(20, 3))
      scopeRoot.Handle(mouseCaptureEvent(MouseKind.Press, 1, 0))
      overlay.IsVisible = true
      scopeRoot.Handle(mouseCaptureEvent(MouseKind.Move, 50, 50))
      failed = failed + Checks.Expect(background.LostCount == 1 && background.MoveCount == 0
          && !background.Captured,
        "an active input scope excludes and clears a background capture owner")
      failed = failed + Checks.Expect(!background.TryCapture(),
        "a capture attempt outside the active input scope fails")

      let unattached = MouseCaptureProbe{}
      failed = failed + Checks.Expect(!unattached.TryCapture(),
        "an unattached box cannot capture the mouse")
      let inactive = MouseCaptureProbe{}
      inactive.IsVisible = false
      let inactiveRoot = Box{ Children: { inactive } }
      inactiveRoot.Draw(Screen(8, 2))
      failed = failed + Checks.Expect(!inactive.TryCapture(),
        "an inactive box cannot capture the mouse")

      let allocationProbe = MouseCaptureProbe{
        Width: CellLength.Cells(5), Height: CellLength.Cells(1), CaptureOnPress: true,
      }
      let allocationRoot = Box{ Children: { allocationProbe } }
      allocationRoot.Draw(Screen(8, 2))
      allocationRoot.Handle(mouseCaptureEvent(MouseKind.Press, 1, 0))
      var warm = 0
      while warm < 64 {
        allocationRoot.Handle(mouseCaptureEvent(MouseKind.Move, 100, 100))
        warm = warm + 1
      }
      uiBenchCollect()
      let generationBefore = GC.CollectionCount(0)
      let bytesBefore = GC.GetAllocatedBytesForCurrentThread()
      var motion = 0
      while motion < 10000 {
        allocationRoot.Handle(mouseCaptureEvent(MouseKind.Move, 100, 100))
        motion = motion + 1
      }
      let bytesAfter = GC.GetAllocatedBytesForCurrentThread()
      let generationAfter = GC.CollectionCount(0)
      failed = failed + Checks.Expect(bytesAfter == bytesBefore && generationAfter == generationBefore,
        "warmed captured motion allocates 0 B and causes no Gen0 collections")

      return failed
    }
  }
}

private func mouseCaptureEvent(kind MouseKind, column int32, row int32) UiEvent {
  return mouseButtonEvent(kind, MouseButton.Left, column, row)
}
