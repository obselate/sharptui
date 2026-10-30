package SharpTui

import Gsharp.Concurrency
import System
import System.IO
import System.Text
import System.Threading

internal class TerminalOutput {
    private let frames Chan[TerminalBuffer?] = Chan[TerminalBuffer?](3)
    private let controls Chan[string] = Chan[string](32)
    private let free Chan[TerminalBuffer] = Chan[TerminalBuffer](3)
    private let stopped Chan[bool] = Chan[bool](1)
    private let output Stream
    private let wake AutoResetEvent
    internal var Error Exception?

    internal init(output Stream, wake AutoResetEvent, first TerminalBuffer) {
        this.output = output
        this.wake = wake
        free.TrySend(first)
        free.TrySend(TerminalBuffer(4096))
        free.TrySend(TerminalBuffer(4096))
        go Run()
    }

    internal func Take() TerminalBuffer? {
        var frame TerminalBuffer?
        var available bool
        return free.TryReceive(out frame, out available) && available ? frame: nil
    }

    internal func Return(frame TerminalBuffer) {
        free.TrySend(frame)
    }

    internal func Send(frame TerminalBuffer) {
        frames.TrySend(frame)
    }

    internal func Control(text string) {
        if !controls.TrySend(text) {
            throw IOException("Terminal control queue is full")
        }
    }

    internal func Stop() {
        ChannelOps.Send[TerminalBuffer?](frames, nil, CancellationToken.None)
        ChannelOps.Receive[bool](stopped, CancellationToken.None)
    }

    internal func Run() {
        using let timer = tick(TimeSpan.FromMilliseconds(4.0))
        while true {
            var control string?
            var available bool
            while controls.TryReceive(out control, out available) && available {
                if let text = control {
                    try {
                        let bytes = Encoding.UTF8.GetBytes(text)
                        output.Write(bytes, 0, bytes.Length)
                        output.Flush()
                    } catch (error Exception) {
                        Error = error
                    }
                }
            }
            var next TerminalBuffer?
            if !frames.TryReceive(out next, out available) || !available {
                select {
                    case <- timer { }
                }
                continue
            }
            guard let frame = next else {
                break
            }
            try {
                frame.WriteTo(output)
                output.Flush()
            } catch (error Exception) {
                Error = error
            }
            free.TrySend(frame)
            wake.Set()
        }
        stopped <- true
    }
}
