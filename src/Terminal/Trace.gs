package SharpTui

import System
import System.Diagnostics
import System.IO
import System.Text

internal class Trace {
  shared {
    private var writer StreamWriter?
    private var clock Stopwatch?

    /// Opens the trace log at the path in SHARPTUI_TRACE if it is set to a
    /// non-empty value; a no-op otherwise.
    public func Open() {
      guard let path = Environment.GetEnvironmentVariable("SHARPTUI_TRACE") else { return }
      if path == "" { return }
      writer = StreamWriter(path, false)
      let sw = Stopwatch()
      sw.Start()
      clock = sw
    }

    /// Appends a timestamped line to the trace log; a no-op when tracing was
    /// never opened.
    public func Mark(what string) {
      guard let w = writer else { return }
      guard let c = clock else { return }
      w.WriteLine(DateTime.UtcNow.ToString("HH:mm:ss.fff") + "  "
        + c.Elapsed.TotalMilliseconds.ToString("0.000") + "  " + what)
      w.Flush()
    }

    internal func Enabled() bool {
      return writer != nil && clock != nil
    }

    /// Flushes and closes the trace log; a no-op when tracing was never
    /// opened.
    public func Close() {
      guard let w = writer else { return }
      w.Flush()
      w.Dispose()
      writer = nil
    }
  }
}
