package SharpTui

import System
import System.Collections.Generic
import System.Threading

internal class GraphicsPlane {
    private var back List[ImageDraw]
    private var front List[ImageDraw]
    private var claims List[int32]
    private var previousClaims List[int32]
    private var width int32
    private var height int32
    private var nextId int32
    private var invalid bool
    private var changed bool
    private var protocol GraphicsProtocol
    private var sixel SixelEncoder?
    private let uploads List[ImageDraw] = List[ImageDraw](64)
    private var uploadPixels int32
    private let visible[]bool = [64]bool
    private var encoder KittyUploads?

    internal prop Pending bool -> encoder?.Pending ?? false

    internal func EnableAsync(wake AutoResetEvent) {
        if encoder == nil { encoder = KittyUploads(wake) }
    }

    internal init(width int32, height int32) {
        back = List[ImageDraw](64)
        front = List[ImageDraw](64)
        claims = List[int32]()
        previousClaims = List[int32]()
        nextId = 1000
        protocol = GraphicsProtocol.HalfBlock
        sixel = nil
        Resize(width, height)
    }

    internal func Resize(width int32, height int32) {
        this.width = width
        this.height = height
        claims.Clear()
        previousClaims.Clear()
        for i in 0 ... width * height {
            claims.Add(0)
            previousClaims.Add(0)
        }
        invalid = true
    }

    internal func Clear() {
        back.Clear()
        for i in 0 ... claims.Count {
            claims[i] = 0
        }
    }

    internal func Cover(index int32) {
        claims[index] = 0
    }

    internal func Invalidate() {
        invalid = true
    }

    internal func Stage(draw ImageDraw, clip CellRect) bool {
        if back.Count == 64 {
            return false
        }
        var next = draw
        next.Id = 0
        for oldIndex in 0 ... front.Count {
            let old = front[oldIndex]
            if !Object.ReferenceEquals(old.Source, draw.Source) {
                continue
            }
            var assigned = false
            for stagedIndex in 0 ... back.Count {
                let staged = back[stagedIndex]
                if staged.Id == old.Id {
                    assigned = true
                    break
                }
            }
            if !assigned {
                next.Id = old.Id
                break
            }
        }
        if next.Id == 0 {
            for oldIndex in 0 ... uploads.Count {
                let old = uploads[oldIndex]
                if Object.ReferenceEquals(old.Source, draw.Source) && ImageRaster.SameRect(old.Crop, draw.Crop) &&
                    old.RasterWidth == draw.RasterWidth &&
                    old.RasterHeight == draw.RasterHeight &&
                    !staged(old.Id) {
                    next.Id = old.Id
                    break
                }
            }
        }
        if next.Id == 0 {
            next.Id = allocateId()
        }
        back.Add(next)
        for y in clip.Row ... clip.Row + clip.HeightRows {
            for x in clip.Column ... clip.Column + clip.WidthCells {
                claims[y * width + x] = back.Count
            }
        }
        return true
    }

    internal func Prepare(screen Screen, output TerminalBuffer) bool {
        let mode = screen.Graphics
        var repaint = invalid || protocol != mode
        for i in 0 ... visible.Length { visible[i] = false }
        for owner in claims {
            if owner > 0 { visible[owner - 1] = true }
        }
        let completed = encoder?.Pump(back, visible) ?? false
        changed = completed || repaint || back.Count != front.Count
        if !changed {
            for i in 0 ... back.Count {
                if !ImageRaster.Same(back[i], front[i]) {
                    changed = true
                    break
                }
            }
        }
        if !repaint {
            for i in 0 ... claims.Count {
                if claims[i] != previousClaims[i] ||
                    (
                    claims[i] != 0 && screen.CellChanged(i)
                ) {
                    changed = true
                    repaint = true
                    break
                }
            }
        }
        if !changed {
            return false
        }
        if back.Count == 0 && front.Count == 0 && uploads.Count == 0 {
            invalid = false
            protocol = mode
            return false
        }
        Ansi.AppendSyncOn(output)
        if protocol == GraphicsProtocol.Kitty && mode != GraphicsProtocol.Kitty {
            for uploadIndex in 0 ... uploads.Count {
                let upload = uploads[uploadIndex]
                KittyEncoder.Delete(output, upload.Id, true)
            }
            uploads.Clear()
            uploadPixels = 0
        }
        for oldIndex in 0 ... front.Count {
            let old = front[oldIndex]
            var retained = false
            for nextIndex in 0 ... back.Count {
                let next = back[nextIndex]
                if old.Id == next.Id {
                    retained = true
                    break
                }
            }
            if protocol == GraphicsProtocol.Kitty && (!retained || mode != GraphicsProtocol.Kitty) {
                KittyEncoder.Delete(output, old.Id, !uploaded(old.Id))
            }
        }
        if mode == GraphicsProtocol.Sixel || protocol == GraphicsProtocol.Sixel {
            output.AppendAscii("\x1b[2J")
            screen.InvalidateCells()
        } else if repaint {
            screen.InvalidateCells()
        }
        return true
    }

    internal func Emit(screen Screen, output TerminalBuffer) {
        if !changed {
            return
        }
        if screen.Graphics == GraphicsProtocol.Kitty {
            for drawIndex in 0 ... back.Count {
                var draw = back[drawIndex]
                if !visible[drawIndex] {
                    for oldIndex in 0 ... front.Count {
                        let old = front[oldIndex]
                        if old.Id == draw.Id {
                            draw.UploadedVersion = old.UploadedVersion
                            break
                        }
                    }
                    back[drawIndex] = draw
                    continue
                }
                var upload = invalid || protocol != GraphicsProtocol.Kitty
                if !upload {
                    upload = true
                    for oldIndex in 0 ... uploads.Count {
                        let old = uploads[oldIndex]
                        if old.Id == draw.Id && old.Version == draw.Version && Object.ReferenceEquals(
                            old.Source,
                            draw.Source
                        )
                        && ImageRaster.SameRect(old.Crop, draw.Crop) && old.RasterWidth == draw.RasterWidth
                        && old.RasterHeight == draw.RasterHeight {
                            upload = false
                            break
                        }
                    }
                }
                if upload && !invalid && protocol == GraphicsProtocol.Kitty {
                    for oldIndex in 0 ... front.Count {
                        let old = front[oldIndex]
                        if old.UploadedVersion == draw.Version && old.Id == draw.Id && Object.ReferenceEquals(old.Source, draw.Source)
                        && ImageRaster.SameRect(old.Crop, draw.Crop) && old.RasterWidth == draw.RasterWidth && old.RasterHeight == draw.RasterHeight {
                            upload = false
                            break
                        }
                    }
                }
                if encoder?.Ready(draw) ?? false { upload = true }
                if upload {
                    if let worker = encoder {
                        let version = worker.Take(draw, output)
                        if version == 0 {
                            worker.Request(draw)
                            for oldIndex in 0 ... front.Count {
                                let old = front[oldIndex]
                                if old.Id == draw.Id && Object.ReferenceEquals(old.Source, draw.Source)
                                && ImageRaster.SameRect(old.Crop, draw.Crop) && old.RasterWidth == draw.RasterWidth && old.RasterHeight == draw.RasterHeight {
                                    draw.UploadedVersion = old.UploadedVersion
                                    break
                                }
                            }
                            if draw.UploadedVersion == 0 {
                                back[drawIndex] = draw
                                continue
                            }
                        } else {
                            draw.UploadedVersion = version
                            if version != draw.Version { worker.Request(draw) }
                        }
                    } else {
                        KittyEncoder.Upload(output, draw)
                        draw.UploadedVersion = draw.Version
                    }
                } else {
                    draw.UploadedVersion = draw.Version
                }
                back[drawIndex] = draw
                retain(output, draw)
                KittyEncoder.Place(output, draw)
            }
        }
        if screen.Graphics == GraphicsProtocol.Kitty || screen.Graphics == GraphicsProtocol.Sixel {
            for y in 0 ... height {
                var x = 0
                while x < width {
                    let owner = claims[y * width + x]
                    if owner == 0 {
                        x++
                        continue
                    }
                    var end = x + 1
                    while end < width && claims[y * width + end] == owner {
                        end++
                    }
                    if y > 0 && sameRun(y - 1, x, end, owner) {
                        x = end
                        continue
                    }
                    var bottom = y + 1
                    while bottom < height && sameRun(bottom, x, end, owner) {
                        bottom++
                    }
                    let rect = CellRect{Column: x, Row: y, WidthCells: end - x, HeightRows: bottom - y}
                    let draw = back[owner - 1]
                    if screen.Graphics == GraphicsProtocol.Kitty && draw.UploadedVersion == 0 {
                        x = end
                        continue
                    }
                    if screen.Graphics == GraphicsProtocol.Kitty {
                        KittyEncoder.Cells(output, draw, rect, screen)
                    } else {
                        if sixel == nil {
                            sixel = SixelEncoder()
                        }
                        if let encoder = sixel {
                            encoder.Emit(output, draw, rect, screen)
                        }
                    }
                    x = end
                }
            }
        }
        front.Clear()
        for drawIndex in 0 ... back.Count {
            let draw = back[drawIndex]
            front.Add(draw)
        }
        for i in 0 ... claims.Count {
            previousClaims[i] = claims[i]
        }
        protocol = screen.Graphics
        invalid = false
        changed = false
    }

    internal func Release(output TerminalBuffer) {
        encoder?.Stop()
        encoder = nil
        if protocol == GraphicsProtocol.Kitty {
            for uploadIndex in 0 ... uploads.Count {
                let upload = uploads[uploadIndex]
                KittyEncoder.Delete(output, upload.Id, true)
            }
            for drawIndex in 0 ... front.Count {
                let draw = front[drawIndex]
                if !uploaded(draw.Id) {
                    KittyEncoder.Delete(output, draw.Id, true)
                }
            }
        }
        uploads.Clear()
        uploadPixels = 0
        back.Clear()
        front.Clear()
        invalid = true
    }

    private func uploaded(id int32) bool {
        for uploadIndex in 0 ... uploads.Count {
            let upload = uploads[uploadIndex]
            if upload.Id == id {
                return true
            }
        }
        return false
    }

    private func staged(id int32) bool {
        for drawIndex in 0 ... back.Count {
            let draw = back[drawIndex]
            if draw.Id == id {
                return true
            }
        }
        return false
    }

    private func retain(output TerminalBuffer, draw ImageDraw) {
        for i in 0 ... uploads.Count {
            if uploads[i].Id == draw.Id {
                let old = uploads[i]
                uploadPixels -= Math.Max(
                    old.Source.Size.Width * old.Source.Size.Height,
                    old.RasterWidth * old.RasterHeight
                )
                uploads.RemoveAt(i)
                break
            }
        }
        let pixels = Math.Max(draw.Source.Size.Width * draw.Source.Size.Height, draw.RasterWidth * draw.RasterHeight)
        if pixels > 4194304 {
            return
        }
        while uploads.Count == 64 || uploadPixels + pixels > 4194304 {
            var victim = -1
            for i in 0 ... uploads.Count {
                if !staged(uploads[i].Id) {
                    victim = i
                    break
                }
            }
            if victim < 0 {
                return
            }
            let old = uploads[victim]
            KittyEncoder.Delete(output, old.Id, true)
            uploadPixels -= Math.Max(old.Source.Size.Width * old.Source.Size.Height, old.RasterWidth * old.RasterHeight)
            uploads.RemoveAt(victim)
        }
        var stored = draw
        stored.Version = draw.UploadedVersion
        uploads.Add(stored)
        uploadPixels += pixels
    }

    private func sameRun(row int32, start int32, end int32, owner int32) bool {
        if start > 0 && claims[row * width + start - 1] == owner {
            return false
        }
        if end < width && claims[row * width + end] == owner {
            return false
        }
        for x in start ... end {
            if claims[row * width + x] != owner {
                return false
            }
        }
        return true
    }

    private func allocateId() int32 {
        while true {
            let candidate = nextId
            nextId++
            if nextId == 0x1000000 {
                nextId = 1000
            }
            var used = false
            for i in 0 ... front.Count {
                if front[i].Id == candidate {
                    used = true
                    break
                }
            }
            for i in 0 ... back.Count {
                if back[i].Id == candidate {
                    used = true
                    break
                }
            }
            for uploadIndex in 0 ... uploads.Count {
                let upload = uploads[uploadIndex]
                if upload.Id == candidate {
                    used = true
                    break
                }
            }
            if !used {
                return candidate
            }
        }
    }
}

internal class KittyEncoder {
    shared {
        internal let Diacritics[]int32 = []int32{
            0x305,
            0x30d,
            0x30e,
            0x310,
            0x312,
            0x33d,
            0x33e,
            0x33f,
            0x346,
            0x34a,
            0x34b,
            0x34c,
            0x350,
            0x351,
            0x352,
            0x357,
            0x35b,
            0x363,
            0x364,
            0x365,
            0x366,
            0x367,
            0x368,
            0x369,
            0x36a,
            0x36b,
            0x36c,
            0x36d,
            0x36e,
            0x36f,
            0x483,
            0x484,
            0x485,
            0x486,
            0x487,
            0x592,
            0x593,
            0x594,
            0x595,
            0x597,
            0x598,
            0x599,
            0x59c,
            0x59d,
            0x59e,
            0x59f,
            0x5a0,
            0x5a1,
            0x5a8,
            0x5a9,
            0x5ab,
            0x5ac,
            0x5af,
            0x5c4,
            0x610,
            0x611,
            0x612,
            0x613,
            0x614,
            0x615,
            0x616,
            0x617,
            0x657,
            0x658,
            0x659,
            0x65a,
            0x65b,
            0x65d,
            0x65e,
            0x6d6,
            0x6d7,
            0x6d8,
            0x6d9,
            0x6da,
            0x6db,
            0x6dc,
            0x6df,
            0x6e0,
            0x6e1,
            0x6e2,
            0x6e4,
            0x6e7,
            0x6e8,
            0x6eb,
            0x6ec,
            0x730,
            0x732,
            0x733,
            0x735,
            0x736,
            0x73a,
            0x73d,
            0x73f,
            0x740,
            0x741,
            0x743,
            0x745,
            0x747,
            0x749,
            0x74a,
            0x7eb,
            0x7ec,
            0x7ed,
            0x7ee,
            0x7ef,
            0x7f0,
            0x7f1,
            0x7f3,
            0x816,
            0x817,
            0x818,
            0x819,
            0x81b,
            0x81c,
            0x81d,
            0x81e,
            0x81f,
            0x820,
            0x821,
            0x822,
            0x823,
            0x825,
            0x826,
            0x827,
            0x829,
            0x82a,
            0x82b,
            0x82c,
            0x82d,
            0x951,
            0x953,
            0x954,
            0xf82,
            0xf83,
            0xf86,
            0xf87,
            0x135d,
            0x135e,
            0x135f,
            0x17dd,
            0x193a,
            0x1a17,
            0x1a75,
            0x1a76,
            0x1a77,
            0x1a78,
            0x1a79,
            0x1a7a,
            0x1a7b,
            0x1a7c,
            0x1b6b,
            0x1b6d,
            0x1b6e,
            0x1b6f,
            0x1b70,
            0x1b71,
            0x1b72,
            0x1b73,
            0x1cd0,
            0x1cd1,
            0x1cd2,
            0x1cda,
            0x1cdb,
            0x1ce0,
            0x1dc0,
            0x1dc1,
            0x1dc3,
            0x1dc4,
            0x1dc5,
            0x1dc6,
            0x1dc7,
            0x1dc8,
            0x1dc9,
            0x1dcb,
            0x1dcc,
            0x1dd1,
            0x1dd2,
            0x1dd3,
            0x1dd4,
            0x1dd5,
            0x1dd6,
            0x1dd7,
            0x1dd8,
            0x1dd9,
            0x1dda,
            0x1ddb,
            0x1ddc,
            0x1ddd,
            0x1dde,
            0x1ddf,
            0x1de0,
            0x1de1,
            0x1de2,
            0x1de3,
            0x1de4,
            0x1de5,
            0x1de6,
            0x1dfe,
            0x20d0,
            0x20d1,
            0x20d4,
            0x20d5,
            0x20d6,
            0x20d7,
            0x20db,
            0x20dc,
            0x20e1,
            0x20e7,
            0x20e9,
            0x20f0,
            0x2cef,
            0x2cf0,
            0x2cf1,
            0x2de0,
            0x2de1,
            0x2de2,
            0x2de3,
            0x2de4,
            0x2de5,
            0x2de6,
            0x2de7,
            0x2de8,
            0x2de9,
            0x2dea,
            0x2deb,
            0x2dec,
            0x2ded,
            0x2dee,
            0x2def,
            0x2df0,
            0x2df1,
            0x2df2,
            0x2df3,
            0x2df4,
            0x2df5,
            0x2df6,
            0x2df7,
            0x2df8,
            0x2df9,
            0x2dfa,
            0x2dfb,
            0x2dfc,
            0x2dfd,
            0x2dfe,
            0x2dff,
            0xa66f,
            0xa67c,
            0xa67d,
            0xa6f0,
            0xa6f1,
            0xa8e0,
            0xa8e1,
            0xa8e2,
            0xa8e3,
            0xa8e4,
            0xa8e5,
            0xa8e6,
            0xa8e7,
            0xa8e8,
            0xa8e9,
            0xa8ea,
            0xa8eb,
            0xa8ec,
            0xa8ed,
            0xa8ee,
            0xa8ef,
            0xa8f0,
            0xa8f1,
            0xaab0,
            0xaab2,
            0xaab3,
            0xaab7,
            0xaab8,
            0xaabe,
            0xaabf,
            0xaac1,
            0xfe20,
            0xfe21,
            0xfe22,
            0xfe23,
            0xfe24,
            0xfe25,
            0xfe26,
            0x10a0f,
            0x10a38,
            0x1d185,
            0x1d186,
            0x1d187,
            0x1d188,
            0x1d189,
            0x1d1aa,
            0x1d1ab,
            0x1d1ac,
            0x1d1ad,
            0x1d242,
            0x1d243,
            0x1d244
        }

        private const Alphabet string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

        internal func Upload(output TerminalBuffer, draw ImageDraw) {
            let channels = draw.Source.IsOpaque ? 3: 4
            let length = draw.RasterWidth * draw.RasterHeight * channels
            var offset = 0
            while offset < length {
                let count = Math.Min(3072, length - offset)
                output.AppendAscii(
                    offset == 0 ? (
                        channels == 3 ? "\x1b_Ga=t,t=d,f=24,q=2,i=": "\x1b_Ga=t,t=d,f=32,q=2,i="
                    ): "\x1b_Gq=2"
                )
                if offset == 0 {
                    output.AppendInt(draw.Id)
                }
                if offset == 0 {
                    output.AppendAscii(",s=")
                    output.AppendInt(draw.RasterWidth)
                    output.AppendAscii(",v=")
                    output.AppendInt(draw.RasterHeight)
                }
                output.AppendAscii(offset + count < length ? ",m=1;": ",m=0;")
                var i = 0
                var pixel uint32
                while i < count {
                    var bits uint32
                    let n = Math.Min(3, count - i)
                    for j in 0 ... n {
                        let index = offset + i + j
                        if index % channels == 0 {
                            let p = index / channels
                            pixel = ImageRaster.Pixel(
                                draw,
                                p % draw.RasterWidth,
                                p / draw.RasterWidth,
                                draw.RasterWidth,
                                draw.RasterHeight
                            )
                        }
                        bits |= ((pixel >> ((index % channels) * 8)) & 255u) << (16 - j * 8)
                    }
                    output.AppendByte(uint8(Alphabet[int32((bits >> 18) & 63u)]))
                    output.AppendByte(uint8(Alphabet[int32((bits >> 12) & 63u)]))
                    output.AppendByte(n > 1 ? uint8(Alphabet[int32((bits >> 6) & 63u)]): uint8(61))
                    output.AppendByte(n > 2 ? uint8(Alphabet[int32(bits & 63u)]): uint8(61))
                    i += n
                }
                output.AppendAscii("\x1b\\")
                offset += count
            }
        }

        internal func Place(output TerminalBuffer, draw ImageDraw) {
            output.AppendAscii("\x1b_Ga=p,U=1,p=1,q=2,i=")
            output.AppendInt(draw.Id)
            output.AppendAscii(",c=")
            output.AppendInt(draw.Target.WidthCells)
            output.AppendAscii(",r=")
            output.AppendInt(draw.Target.HeightRows)
            output.AppendAscii("\x1b\\")
        }

        internal func Cells(output TerminalBuffer, draw ImageDraw, rect CellRect, screen Screen) {
            for y in rect.Row ... rect.Row + rect.HeightRows {
                Ansi.AppendMoveTo(output, rect.Column, y)
                var background = -2
                for x in rect.Column ... rect.Column + rect.WidthCells {
                    let nextBackground = screen.BackgroundAt(x, y)
                    if background != nextBackground {
                        Ansi.AppendStyle(output, draw.Id, nextBackground, 0, TerminalColorMode.TrueColor)
                        output.AppendAscii("\x1b[58;2;0;0;1m")
                        background = nextBackground
                    }
                    codepoint(output, 0x10eeee)
                    codepoint(output, Diacritics[y - draw.Target.Row])
                    codepoint(output, Diacritics[x - draw.Target.Column])
                }
            }
            Ansi.AppendReset(output)
        }

        private func codepoint(output TerminalBuffer, value int32) {
            if value < 0x800 {
                output.AppendByte(uint8(0xc0 | (value >> 6)))
                output.AppendByte(uint8(0x80 | (value & 63)))
            } else if value < 0x10000 {
                output.AppendByte(uint8(0xe0 | (value >> 12)))
                output.AppendByte(uint8(0x80 | ((value >> 6) & 63)))
                output.AppendByte(uint8(0x80 | (value & 63)))
            } else {
                output.AppendByte(uint8(0xf0 | (value >> 18)))
                output.AppendByte(uint8(0x80 | ((value >> 12) & 63)))
                output.AppendByte(uint8(0x80 | ((value >> 6) & 63)))
                output.AppendByte(uint8(0x80 | (value & 63)))
            }
        }

        internal func Delete(output TerminalBuffer, id int32, data bool) {
            output.AppendAscii(data ? "\x1b_Ga=d,d=I,q=2,i=": "\x1b_Ga=d,d=i,q=2,i=")
            output.AppendInt(id)
            output.AppendAscii("\x1b\\")
        }
    }
}
