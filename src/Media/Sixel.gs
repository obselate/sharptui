package SharpTui

import System

internal class SixelEncoder {
    private let columns[]uint8 = [8192 * 256]uint8
    private var errorRow[]int32 = [8194 * 3]int32
    private var nextError[]int32 = [8194 * 3]int32
    private var used[]bool
    private let palette SixelPalette = SixelPalette()

    internal init() {
        used = [256]bool
    }

    internal func Emit(output TerminalBuffer, draw ImageDraw, rect CellRect, screen Screen) {
        let cell = screen.CellPixels
        let w = Math.Min(8192, rect.WidthCells * cell.Width)
        let h = Math.Min(8192, rect.HeightRows * cell.Height)
        let offsetX = rect.Column * cell.Width
        let offsetY = rect.Row * cell.Height
        let firstBand = offsetY / 6
        let lastBand = (offsetY + h + 5) / 6
        palette.Begin()
        for y in 0 ... h {
            for x in 0 ... w {
                palette.Add(pixel(draw, rect, screen, x, y))
            }
        }
        palette.Finish()
        Array.Clear(errorRow)
        Array.Clear(nextError)
        output.AppendAscii("\x1b[?80h\x1bP0;1q\"1;1;")
        output.AppendInt(offsetX + w)
        output.AppendByte(59)
        output.AppendInt(offsetY + h)
        for color in 0 ... palette.Count {
            let rgb = palette.ColorAt(color)
            output.AppendByte(35)
            output.AppendInt(color)
            output.AppendAscii(";2;")
            output.AppendInt(((rgb >> 16) & 255) * 100 / 255)
            output.AppendByte(59)
            output.AppendInt(((rgb >> 8) & 255) * 100 / 255)
            output.AppendByte(59)
            output.AppendInt((rgb & 255) * 100 / 255)
        }
        for i in 0 ... firstBand {
            output.AppendByte(45)
        }
        for row in firstBand ... lastBand {
            Array.Clear(columns, 0, w * palette.Count)
            for color in 0 ... 256 {
                used[color] = false
            }
            for y in 0 ... 6 {
                let py = row * 6 + y - offsetY
                for x in 0 ... w {
                    if py < 0 || py >= h {
                        continue
                    }
                    let original = pixel(draw, rect, screen, x, py)
                    var adjusted = 0
                    let at = (x + 1) * 3
                    for channel in 0 ... 3 {
                        let shift = (2 - channel) * 8
                        adjusted |= Math.Clamp(
                            ((original >> shift) & 255) + errorRow[at + channel] / 16,
                            0,
                            255
                        ) << shift
                    }
                    let color = palette.Index(adjusted)
                    let quantized = palette.ColorAt(color)
                    for channel in 0 ... 3 {
                        let shift = (2 - channel) * 8
                        let error = ((adjusted >> shift) & 255) - ((quantized >> shift) & 255)
                        errorRow[at + 3 + channel] += error * 7
                        nextError[at - 3 + channel] += error * 3
                        nextError[at + channel] += error * 5
                        nextError[at + 3 + channel] += error
                    }
                    columns[color * w + x] |= uint8(1 << y)
                    used[color] = true
                }
                if py >= 0 && py < h {
                    let swap = errorRow
                    errorRow = nextError
                    nextError = swap
                    Array.Clear(nextError, 0, (w + 2) * 3)
                }
            }
            for color in 0 ... palette.Count {
                if !used[color] {
                    continue
                }
                output.AppendByte(35)
                output.AppendInt(color)
                if offsetX > 0 {
                    repeat(output, 63, offsetX)
                }
                var run = -1
                var length = 0
                for x in 0 ... w {
                    let value = int32(columns[color * w + x]) + 63
                    if value == run {
                        length++
                    } else {
                        if length > 0 {
                            repeat(output, run, length)
                        }
                        run = value
                        length = 1
                    }
                }
                if length > 0 {
                    repeat(output, run, length)
                }
                output.AppendByte(36)
            }
            if row + 1 < lastBand {
                output.AppendByte(45)
            }
        }
        output.AppendAscii("\x1b\\")
    }

    private func repeat(output TerminalBuffer, value int32, count int32) {
        if count > 3 {
            output.AppendByte(33)
            output.AppendInt(count)
            output.AppendByte(uint8(value))
        } else {
            for i in 0 ... count {
                output.AppendByte(uint8(value))
            }
        }
    }

    private func pixel(draw ImageDraw, rect CellRect, screen Screen, x int32, y int32) int32 {
        let cell = screen.CellPixels
        let tx = x + (rect.Column - draw.Target.Column) * cell.Width
        let ty = y + (rect.Row - draw.Target.Row) * cell.Height
        let rgba = ImageRaster.Pixel(
            draw,
            tx,
            ty,
            draw.Target.WidthCells * cell.Width,
            draw.Target.HeightRows * cell.Height
        )
        return ImageRaster.Opaque(rgba, screen.BackgroundAt(rect.Column + x / cell.Width, rect.Row + y / cell.Height))
    }
}
