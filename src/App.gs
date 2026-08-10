package SharpTui

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Threading

/// Controls how an event affects app routing and lifetime.
public enum EventResult { Continue; Handled; Exit }

/// A drawable application surface.
public interface View {
  /// Paints one frame. Called after every batch of events.
  /// @param screen The screen to paint into.
  func Draw(screen Screen);

  /// Handles one typed user-interface event.
  func Handle(ev UiEvent) EventResult {
    return EventResult.Continue
  }
}

/// Wraps a Box tree as a View, so an app that is just a tree needs no class.
internal class Shell : View {
  private var root Box

  public prop Root Box {
    get { return root }
    set { root = value }
  }

  public init(root Box) {
    this.root = root
  }

  public func Draw(screen Screen) {
    screen.Clear()
    Root.Draw(screen)
  }

  public func Handle(ev UiEvent) EventResult {
    return Root.Handle(ev)
  }

}

/// Owns the terminal session and drives the paint and input loop for a View or Box tree.
public class App {
  private var term Terminal
  private var input Input
  private var screen Screen
  private var wake AutoResetEvent
  private var invalidated int32
  private var defaultStyle Style
  private var tickInterval TimeSpan
  private var mouseTracking MouseTracking
  private var keys Keymap
  private var quitGestures List[KeyGesture]

  /// The style used for unstyled drawing in the application.
  public prop DefaultStyle Style {
    get { return defaultStyle }
    set { defaultStyle = value }
  }

  /// The interval between tick events. TimeSpan.Zero disables ticks.
  public prop TickInterval TimeSpan {
    get { return tickInterval }
    set {
      if value.TotalMilliseconds < 0.0 {
        throw ArgumentOutOfRangeException("TickInterval")
      }
      tickInterval = value
    }
  }

  /// Terminal mouse reporting selected when Run enters the terminal.
  public prop MouseTracking MouseTracking {
    get { return mouseTracking }
    set { mouseTracking = value }
  }

  /// Application bindings offered before and after View event handling.
  public prop Keys Keymap {
    get { return keys }
    set { keys = value }
  }

  /// Fallback quit gestures. Views receive each event before these are tested.
  public prop QuitGestures List[KeyGesture] { get { return quitGestures } }

  internal prop IsDrawRequested bool { get { return invalidated != 0 } }

  /// Creates an app with terminal-default colors, no ticking, drag mouse tracking, and
  /// Escape/Ctrl+C as quit gestures.
  public init() {
    wake = AutoResetEvent(false)
    term = Terminal(wake)
    input = Input(wake)
    invalidated = 0
    defaultStyle = Style{
      Foreground: Color.TerminalDefault,
      Background: Color.TerminalDefault,
      Attributes: TextAttributes.None,
    }
    tickInterval = TimeSpan.Zero
    mouseTracking = MouseTracking.Drag
    keys = Keymap()
    quitGestures = List[KeyGesture]()
    quitGestures.Add(KeyGesture{ Key: Key.Escape })
    quitGestures.Add(KeyGesture.Ctrl("c"))
    screen = Screen(term.Columns(), term.Rows())
  }

  /// Runs a bare tree. Escape and Ctrl+C quit.
  /// @param root The root box of the tree to run.
  public func Run(root Box) {
    Run(Shell(root))
  }

  /// Wakes the app for one repaint. Repeated pending calls coalesce.
  public func RequestDraw() {
    if Interlocked.Exchange(ref invalidated, 1) == 0 {
      wake.Set()
    }
  }

  /// Runs an advanced custom View.
  /// @param view The view to run as the application.
  public func Run(view View) {
    if !term.IsTty() {
      Console.Error.WriteLine("sharptui: standard input and output must be terminals")
      return
    }

    Trace.Open()
    defer Trace.Close()
    screen.DefaultStyle = DefaultStyle
    term.Background = DefaultStyle.Background.Packed
    try {
      term.Enter(input, mouseTracking)
    } catch (e IOException) {
      Console.Error.WriteLine("sharptui: could not enter the terminal: " + e.Message)
      return
    }
    defer term.Restore()

    try {
      loop(view)
    } catch (e IOException) {
      Console.Error.WriteLine("sharptui: lost the terminal: " + e.Message)
    }
  }

  private func loop(view View) {
    var running = true
    var dirty = true
    let clock = Stopwatch()
    clock.Start()
    var nextTick = tickMilliseconds()
    while running {
      if term.ConsumeExit() {
        running = false
        continue
      }

      if term.ConsumeResize() {
        let cols = term.Columns()
        let rows = term.Rows()
        if Trace.Enabled() {
          Trace.Mark("resize seen " + cols.ToString() + "x" + rows.ToString())
        }
        screen.Resize(cols, rows)
        dirty = true
      }

      if dirty {
        view.Draw(screen)
        let written = term.Present(screen)
        if Trace.Enabled() {
          Trace.Mark("painted " + written.ToString() + " bytes")
        }
        dirty = false
      }

      let interval = tickMilliseconds()
      var wait = -1
      if interval > 0 {
        let left = nextTick - clock.ElapsedMilliseconds
        let bounded = left < int64(1) ? int64(1) : left
        wait = bounded > int64(Int32.MaxValue) ? Int32.MaxValue : int32(bounded)
      }
      let woke = wake.WaitOne(wait)
      if woke && Interlocked.Exchange(ref invalidated, 0) == 1 {
        dirty = true
      }

      if interval > 0 && clock.ElapsedMilliseconds >= nextTick {
        nextTick = clock.ElapsedMilliseconds + interval
        dirty = true
        if Route(view, tickEvent()) == EventResult.Exit { running = false }
      }

      var ev = UiEvent{}
      while input.TryDequeue(out ev) {
        dirty = true
        if Route(view, ev) == EventResult.Exit {
          running = false
          break
        }
      }
    }
  }

  internal func Route(view View, ev UiEvent) EventResult {
    if Keys.Offer(ev, BindingPhase.BeforeWidgets) { return EventResult.Handled }

    let result = view.Handle(ev)
    if result != EventResult.Continue { return result }

    if Keys.Offer(ev, BindingPhase.AfterWidgets) { return EventResult.Handled }
    for gesture in QuitGestures {
      if gesture.Matches(ev) { return EventResult.Exit }
    }
    return EventResult.Continue
  }

  private func tickMilliseconds() int64 {
    let milliseconds = TickInterval.TotalMilliseconds
    if milliseconds <= 0.0 { return 0 }
    return milliseconds < 1.0 ? 1 : int64(milliseconds)
  }

  private func tickEvent() UiEvent {
    return UiEvent{ Kind: UiEventKind.Tick, Key: Key.Unknown, Mouse: MouseKind.None }
  }
}
