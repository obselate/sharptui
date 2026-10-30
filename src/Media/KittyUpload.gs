package SharpTui

import Gsharp.Concurrency
import System
import System.Threading

internal class KittyUpload {
    internal var Draw ImageDraw
    internal let Snapshot ImageSource = ImageSource.FromRgba(1, 1, [4]uint8)
    internal let Output TerminalBuffer = TerminalBuffer(4096)
    internal var Status int32
    internal var Error Exception?
}

internal class KittyUploads {
    private let work Chan[KittyUpload?] = Chan[KittyUpload?](2)
    private let completed Chan[KittyUpload] = Chan[KittyUpload](2)
    private let stopped Chan[bool] = Chan[bool](1)
    private let slots[]KittyUpload = []KittyUpload{KittyUpload(), KittyUpload()}
    private let wake AutoResetEvent

    internal init(wake AutoResetEvent) {
        this.wake = wake
        go Run()
    }

    internal prop Pending bool {
        get {
            for slot in slots {
                if slot.Status != 0 {
                    return true
                }
            }
            return false
        }
    }

    internal func Pump(draws System.Collections.Generic.List[ImageDraw], visible[]bool) bool {
        var job KittyUpload?
        var available bool
        var changed = false
        while completed.TryReceive(out job, out available) && available {
            if let slot = job {
                slot.Status = 2
                changed = true
            }
        }
        for slot in slots {
            if slot.Status != 2 {
                continue
            }
            var needed = false
            for i in 0 ... draws.Count {
                if visible[i] && Matches(slot.Draw, draws[i]) {
                    needed = true
                    break
                }
            }
            if !needed {
                slot.Status = 0
                slot.Draw = ImageDraw{}
            }
        }
        return changed
    }

    internal func Request(draw ImageDraw) {
        for slot in slots {
            if slot.Status != 0 && Matches(slot.Draw, draw) {
                return
            }
        }
        for slot in slots {
            if slot.Status != 0 {
                continue
            }
            slot.Draw = draw
            slot.Snapshot.CopySnapshot(draw.Source)
            slot.Error = nil
            slot.Status = 1
            if !work.TrySend(slot) {
                slot.Status = 0
                slot.Draw = ImageDraw{}
            }
            return
        }
    }

    internal func Take(draw ImageDraw, output TerminalBuffer) int64 {
        for slot in slots {
            if slot.Status != 2 || !Matches(slot.Draw, draw) {
                continue
            }
            slot.Status = 0
            let version = slot.Draw.Version
            slot.Draw = ImageDraw{}
            if let error = slot.Error {
                throw error
            }
            output.AppendBuffer(slot.Output)
            return version
        }
        return 0
    }

    internal func Ready(draw ImageDraw) bool {
        for slot in slots {
            if slot.Status == 2 && Matches(slot.Draw, draw) { return true }
        }
        return false
    }

    internal func Stop() {
        ChannelOps.Send[KittyUpload?](work, nil, CancellationToken.None)
        ChannelOps.Receive[bool](stopped, CancellationToken.None)
        for slot in slots {
            slot.Draw = ImageDraw{}
        }
    }

    internal func Run() {
        using let timer = tick(TimeSpan.FromMilliseconds(4.0))
        while true {
            var next KittyUpload?
            var available bool
            if !work.TryReceive(out next, out available) || !available {
                select {
                    case <- timer { }
                }
                continue
            }
            guard let slot = next else {
                break
            }
            try {
                var draw = slot.Draw
                draw.Source = slot.Snapshot
                slot.Output.Reset()
                KittyEncoder.Upload(slot.Output, draw)
            } catch (error Exception) {
                slot.Error = error
            }
            completed.TrySend(slot)
            wake.Set()
        }
        stopped.TrySend(true)
    }

    shared {
        private func Matches(a ImageDraw, b ImageDraw) bool -> a.Id == b.Id && Object.ReferenceEquals(
            a.Source,
            b.Source
        )
        && ImageRaster.SameRect(a.Crop, b.Crop) && a.RasterWidth == b.RasterWidth && a.RasterHeight == b.RasterHeight
    }
}
