package SharpTui

import System
import System.Threading

/// Reports the lifecycle state of one background worker.
public enum WorkerState {
  /// The operation is running on a background thread.
  Running;
  /// The operation completed and has a result to consume.
  Completed;
  /// The operation failed and has an exception to consume.
  Failed;
  /// The operation exited after cancellation was requested.
  Cancelled;
}

/// Runs one typed background operation and marshals its terminal state onto an App.
public class Worker[T] {
  private var app App
  private var work Func[CancellationToken, T]
  private var cancellation CancellationTokenSource
  private var state int32
  private var boxedResult Object?
  private var hasResult bool
  private var error Exception?
  private var resultConsumed int32
  private var errorConsumed int32

  internal init(app App, work Func[CancellationToken, T]) {
    if app == nil { throw ArgumentNullException("app") }
    if work == nil { throw ArgumentNullException("work") }
    this.app = app
    this.work = work
    cancellation = CancellationTokenSource()
    state = 0
    boxedResult = nil
    hasResult = false
    error = nil
    resultConsumed = 0
    errorConsumed = 0
  }

  internal prop Cancellation CancellationTokenSource { get { return cancellation } }

  /// Reports the current worker lifecycle state.
  public prop State WorkerState {
    get {
      let value = Interlocked.CompareExchange(ref state, 0, 0)
      if value == 1 { return WorkerState.Completed }
      if value == 2 { return WorkerState.Failed }
      if value == 3 { return WorkerState.Cancelled }
      return WorkerState.Running
  }
  }

  internal func Start() {
    let thread = Thread(run)
    thread.IsBackground = true
    thread.Start()
  }

  /// Requests cooperative cancellation. State remains Running until the operation exits.
  public func Cancel() {
    cancellation.Cancel()
  }

  /// Consumes the completed result once.
  /// @param value Receives the result when available.
  /// @returns True when a result was consumed.
  public func ConsumeResult(out value T) bool {
    value = default(T)
    if State != WorkerState.Completed || !hasResult { return false }
    if Interlocked.CompareExchange(ref resultConsumed, 1, 0) != 0 { return false }
    value = T(boxedResult)
    return true
  }

  /// Consumes the failure exception once.
  /// @returns The exception, or nil when no unconsumed failure exists.
  public func ConsumeError() Exception? {
    if State != WorkerState.Failed { return nil }
    if Interlocked.CompareExchange(ref errorConsumed, 1, 0) != 0 { return nil }
    return error
  }


  private func run() {
    defer app.UnregisterWorker(cancellation)
    try {
      let value = work(cancellation.Token)
      app.DeliverWorker(() -> publishResult(value))
    } catch (e OperationCanceledException) {
      app.DeliverWorker(publishCancellation)
    } catch (e Exception) {
      app.DeliverWorker(() -> publishError(e))
    }
  }

  private func publishResult(value T) {
    if cancellation.IsCancellationRequested {
      publishCancellation()
      return
    }
    boxedResult = value
    hasResult = true
    Interlocked.CompareExchange(ref state, 1, 0)
  }

  private func publishError(value Exception) {
    if cancellation.IsCancellationRequested {
      publishCancellation()
      return
    }
    error = value
    Interlocked.CompareExchange(ref state, 2, 0)
  }

  private func publishCancellation() {
    cancellation.Cancel()
    Interlocked.CompareExchange(ref state, 3, 0)
  }
}
