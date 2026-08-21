package SharpTui

import System

/// Drives a SharpTUI tree without entering a terminal or reading a clock.
public class TestDriver {
  private var app App
  private var screen Screen
  private var root Box
  private var nowMilliseconds int64

  /// The application used for routing, posted work, and animations.
  public prop App App { get { return app } }
  /// The test screen used for drawing and frame capture.
  public prop Screen Screen { get { return screen } }
  /// The current caller-controlled absolute time in milliseconds.
  public prop NowMilliseconds int64 { get { return nowMilliseconds } }
  /// The focused descendant in the driven tree.
  public prop FocusedElement Box? {
    get { return root.FocusedElement }
  }

  /// Creates a driver for a retained Box tree.
  /// @param root The root box to route and draw.
  /// @param width The screen width in cells.
  /// @param height The screen height in rows.
  public init(root Box, width int32, height int32) {
    if root == nil { throw ArgumentNullException("root") }
    if width < 0 { throw ArgumentOutOfRangeException("width") }
    if height < 0 { throw ArgumentOutOfRangeException("height") }
    app = App()
    this.root = root
    screen = Screen(width, height)
    nowMilliseconds = 0
  }

  /// Routes one event through the normal application pipeline.
  /// @param ev The event to route.
  /// @returns The routing result.
  public func Send(ev UiEvent) EventResult {
    let result = app.Route(root, ev)
    Pump()
    return result
  }

  /// Advances absolute time and pumps posted work and animations.
  /// @param elapsed The non-negative amount of time to advance.
  public func Advance(elapsed TimeSpan) {
    if elapsed.TotalMilliseconds < 0.0 { throw ArgumentOutOfRangeException("elapsed") }
    nowMilliseconds = nowMilliseconds + int64(elapsed.TotalMilliseconds)
    Pump()
  }

  /// Resizes the deterministic screen in terminal cells.
  /// @param width The new screen width in cells.
  /// @param height The new screen height in rows.
  public func Resize(width int32, height int32) {
    if width < 0 { throw ArgumentOutOfRangeException("width") }
    if height < 0 { throw ArgumentOutOfRangeException("height") }
    screen.Resize(width, height)
  }

  /// Runs all currently posted work and samples animations at NowMilliseconds.
  public func Pump() {
    app.DrainPostedWork()
    app.SampleAnimations(nowMilliseconds)
    app.DrainPostedWork()
  }

  /// Draws the tree and returns the ANSI diff emitted by the screen.
  /// @returns The captured ANSI diff for this frame.
  public func Draw() string {
    Pump()
    screen.DefaultStyle = app.DefaultStyle
    screen.Clear()
    root.Draw(screen)
    return screen.Flush()
  }
}
