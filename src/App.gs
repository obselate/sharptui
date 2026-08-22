package SharpTui

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Threading

/// Controls how an event affects app routing and lifetime.
public enum EventResult { Continue; Handled; Exit }

/// Owns the terminal session and drives the paint and input loop for a Box tree.
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
  private var animations AnimationController
  private var postGate Object
  private var posted Queue[Action]
  private var postsPending int32
  private var workerPostsAccepted bool
  private var workerGate Object
  private var workerCancellations List[CancellationTokenSource]

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
      wake.Set()
    }
  }

  /// Owns animations and their shared frame deadline.
  public prop Animations AnimationController { get { return animations } }

  /// Terminal mouse reporting selected when Run enters the terminal.
  public prop MouseTracking MouseTracking {
    get { return mouseTracking }
    set { mouseTracking = value }
  }

  /// Application bindings offered before and after tree event handling.
  public prop Keys Keymap {
    get { return keys }
    set { keys = value }
  }

  /// Fallback quit gestures. The tree receives each event before these are tested.
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
    postGate = Object()
    posted = Queue[Action]()
    postsPending = 0
    workerPostsAccepted = true
    workerGate = Object()
    workerCancellations = List[CancellationTokenSource]()
    animations = AnimationController(wake)
    screen = Screen(term.Columns(), term.Rows())
  }

  /// Runs a retained tree. Escape and Ctrl+C quit.
  /// @param root The root box of the tree to run.
  public func Run(root Box) {
    if !term.IsTty() {
      Console.Error.WriteLine("sharptui: standard input and output must be terminals")
      return
    }

    Trace.Open()
    defer Trace.Close()
    screen.DefaultStyle = DefaultStyle
    try {
      term.Enter(input, mouseTracking)
    } catch (e IOException) {
      Console.Error.WriteLine("sharptui: could not enter the terminal: " + e.Message)
      return
    }
    defer term.Restore()

    try {
      loop(root)
    } catch (e IOException) {
      Console.Error.WriteLine("sharptui: lost the terminal: " + e.Message)
    }
  }

  /// Wakes the app for one repaint. Repeated pending calls coalesce.
  public func RequestDraw() {
    if Interlocked.Exchange(ref invalidated, 1) == 0 {
      wake.Set()
    }
  }

  /// Posts no-argument UI work for execution on the application loop.
  /// Repeated pending posts share one wakeup and one repaint.
  /// @param work The callback to run on the loop thread.
  public func Post(work Action) {
    if work == nil { throw ArgumentNullException("work") }
    lock postGate { posted.Enqueue(work) }
    if Interlocked.Exchange(ref postsPending, 1) == 0 { wake.Set() }
  }

  /// Starts one app-owned background operation and delivers its terminal callback on the app loop.
  /// @param work The operation to run with a cooperative cancellation token.
  /// @param completed Work invoked with the completed result.
  /// @param failed Work invoked with an unhandled operation error.
  /// @param cancelled Work invoked when cancellation wins completion.
  /// @returns A running cancellation handle.
  public func StartWorker[T](work Func[CancellationToken, T], completed Action[T],
      failed Action[Exception], cancelled Action) Worker {
    if work == nil { throw ArgumentNullException("work") }
    if completed == nil { throw ArgumentNullException("completed") }
    if failed == nil { throw ArgumentNullException("failed") }
    if cancelled == nil { throw ArgumentNullException("cancelled") }
    let worker = Worker()
    lock workerGate { workerCancellations.Add(worker.Cancellation) }
    worker.Start(this, work, completed, failed, cancelled)
    return worker
  }

  internal func DeliverWorker(work Action) bool {
    lock postGate {
      if !workerPostsAccepted { return false }
      posted.Enqueue(work)
    }
    if Interlocked.Exchange(ref postsPending, 1) == 0 { wake.Set() }
    return true
  }

  private func loop(root Box) {
    lock postGate { workerPostsAccepted = true }
    defer StopWorkers()
    var running = true
    var dirty = true
    let clock = Stopwatch()
    clock.Start()
    var scheduledInterval = tickMilliseconds()
    var nextTick = scheduledInterval
    if nextTick > 0 { nextTick = clock.ElapsedMilliseconds + nextTick }
    while running {
      let now = clock.ElapsedMilliseconds
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
      animations.Observe(now)

      if Interlocked.Exchange(ref invalidated, 0) != 0 {
        dirty = true
      }
      if DrainPostedWork() {
        dirty = true
      }

      var interval = tickMilliseconds()
      if interval <= 0 {
        nextTick = 0
        scheduledInterval = 0
      } else {
        if interval != scheduledInterval || nextTick <= 0 {
          nextTick = now + interval
          scheduledInterval = interval
        }
        if now >= nextTick {
          dirty = true
          if Route(root, tickEvent()) == EventResult.Exit { running = false }
          interval = tickMilliseconds()
          scheduledInterval = interval
          nextTick = interval > 0 ? clock.ElapsedMilliseconds + interval : 0
        }
      }

      var ev = UiEvent{}
      while running && input.TryDequeue(out ev) {
        dirty = true
        if Route(root, ev) == EventResult.Exit {
          running = false
          break
        }
      }

      let animationNow = clock.ElapsedMilliseconds
      if running && animations.Sample(animationNow) {
        dirty = true
      }

      if running && dirty {
        screen.Clear()
        root.Draw(screen)
        let written = term.Present(screen)
        if Trace.Enabled() {
          Trace.Mark("painted " + written.ToString() + " bytes")
        }
        dirty = false
      }

      if !running { continue }

      var deadline int64 = -1
      if interval > 0 { deadline = nextTick }
      let animationDeadline = animations.NextDeadline(clock.ElapsedMilliseconds)
      if animationDeadline >= 0 && (deadline < 0 || animationDeadline < deadline) {
        deadline = animationDeadline
      }
      var wait = -1
      if deadline >= 0 {
        let left = deadline - clock.ElapsedMilliseconds
        let bounded = left < int64(1) ? int64(1) : left
        wait = bounded > int64(Int32.MaxValue) ? Int32.MaxValue : int32(bounded)
      }
      if Interlocked.CompareExchange(ref invalidated, 0, 0) != 0
          || Interlocked.CompareExchange(ref postsPending, 0, 0) != 0 {
        wait = 0
      }
      wake.WaitOne(wait)
    }
  }

  internal func DrainPostedWork() bool {
    var ran = false
    while true {
      var work Action?
      lock postGate {
        if posted.Count == 0 {
          Interlocked.Exchange(ref postsPending, 0)
          return ran
        }
        work = posted.Dequeue()
      }
      work!!()
      ran = true
    }
  }

  internal func UnregisterWorker(cancellation CancellationTokenSource) {
    lock workerGate { workerCancellations.Remove(cancellation) }
  }

  internal func CancelWorkers() {
    let active = List[CancellationTokenSource]()
    lock workerGate {
      for cancellation in workerCancellations { active.Add(cancellation) }
    }
    for cancellation in active { cancellation.Cancel() }
  }

  private func StopWorkers() {
    lock postGate { workerPostsAccepted = false }
    CancelWorkers()
    DrainPostedWork()
  }

  internal func SampleAnimations(nowMilliseconds int64) bool {
    return animations.Sample(nowMilliseconds)
  }

  internal func AnimationDeadline(nowMilliseconds int64) int64 {
    return animations.NextDeadline(nowMilliseconds)
  }

  internal func Route(root Box, ev UiEvent) EventResult {
    if Keys.Offer(ev, BindingPhase.BeforeWidgets) { return EventResult.Handled }

    let result = root.Handle(ev)
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
