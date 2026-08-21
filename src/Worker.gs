package SharpTui

import System
import System.Threading

/// Cancels and observes one app-owned background operation.
public class Worker {
  private var cancellation CancellationTokenSource
  private var running int32

  internal init() {
    cancellation = CancellationTokenSource()
    running = 1
  }

  internal prop Cancellation CancellationTokenSource { get { return cancellation } }

  /// True until completion, failure, or cancellation reaches the application loop.
  public prop IsRunning bool {
    get { return Interlocked.CompareExchange(ref running, 0, 0) != 0 }
  }

  internal func Start[T](app App, work Func[CancellationToken, T], completed Action[T],
      failed Action[Exception], cancelled Action) {
    let thread = Thread(() -> run(app, work, completed, failed, cancelled))
    thread.IsBackground = true
    thread.Start()
  }

  /// Requests cooperative cancellation.
  public func Cancel() {
    cancellation.Cancel()
  }

  private func run[T](app App, work Func[CancellationToken, T], completed Action[T],
      failed Action[Exception], cancelled Action) {
    defer app.UnregisterWorker(cancellation)
    try {
      let value = work(cancellation.Token)
      deliver(app, () -> {
        if cancellation.IsCancellationRequested { cancelled() }
        else { completed(value) }
      })
    } catch (e OperationCanceledException) {
      deliver(app, cancelled)
    } catch (e Exception) {
      if cancellation.IsCancellationRequested { deliver(app, cancelled) }
      else { deliver(app, () -> failed(e)) }
    }
  }

  private func deliver(app App, callback Action) {
    if !app.DeliverWorker(() -> {
      Interlocked.Exchange(ref running, 0)
      callback()
    }) {
      Interlocked.Exchange(ref running, 0)
    }
  }
}
