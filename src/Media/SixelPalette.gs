package SharpTui

import System

internal struct PaletteBox {
    var R0 int32
    var R1 int32
    var G0 int32
    var G1 int32
    var B0 int32
    var B1 int32
    var Count int32
}

internal class SixelPalette {
    private let counts[]int32 = [32768]int32
    private let reds[]int32 = [32768]int32
    private let greens[]int32 = [32768]int32
    private let blues[]int32 = [32768]int32
    private let paletteMap[]int16 = [32768]int16
    private let boxes[]PaletteBox = [256]PaletteBox
    private let colors[]int32 = [256]int32
    private var count int32

    internal prop Count int32 -> count
    internal func ColorAt(index int32) int32 -> colors[index]

    internal func Begin() {
        Array.Clear(counts)
        Array.Clear(reds)
        Array.Clear(greens)
        Array.Clear(blues)
    }

    internal func Add(rgb int32) {
        let r = (rgb >> 16) & 255
        let g = (rgb >> 8) & 255
        let b = rgb & 255
        let index = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
        counts[index]++
        reds[index] += r
        greens[index] += g
        blues[index] += b
    }

    internal func Finish() {
        count = 1
        boxes[0] = tight(PaletteBox{R1: 31, G1: 31, B1: 31})
        while count < 256 {
            var chosen = -1
            var score int64 = 0
            for i in 0 ... count {
                let box = boxes[i]
                let extent = Math.Max(box.R1 - box.R0, Math.Max(box.G1 - box.G0, box.B1 - box.B0))
                let next = int64(extent) * box.Count
                if next > score {
                    chosen = i
                    score = next
                }
            }
            if chosen < 0 {
                break
            }
            let box = boxes[chosen]
            let red = box.R1 - box.R0
            let green = box.G1 - box.G0
            let blue = box.B1 - box.B0
            let axis = red >= green && red >= blue ? 0: green >= blue ? 1: 2
            let lo = axis == 0 ? box.R0: axis == 1 ? box.G0: box.B0
            let hi = axis == 0 ? box.R1: axis == 1 ? box.G1: box.B1
            var total = 0
            var cut = lo
            while cut < hi {
                total += planeCount(box, axis, cut)
                if total >= box.Count / 2 {
                    break
                }
                cut++
            }
            cut = Math.Min(cut, hi - 1)
            var left = box
            var right = box
            if axis == 0 {
                left.R1 = cut
                right.R0 = cut + 1
            } else if axis == 1 {
                left.G1 = cut
                right.G0 = cut + 1
            } else {
                left.B1 = cut
                right.B0 = cut + 1
            }
            boxes[chosen] = tight(left)
            boxes[count] = tight(right)
            count++
        }
        Array.Fill(paletteMap, int16(-1))
        for i in 0 ... count {
            let box = boxes[i]
            var red int64
            var green int64
            var blue int64
            for r in box.R0 ... box.R1 + 1 {
                for g in box.G0 ... box.G1 + 1 {
                    for b in box.B0 ... box.B1 + 1 {
                        let index = (r << 10) | (g << 5) | b
                        red += reds[index]
                        green += greens[index]
                        blue += blues[index]
                    }
                }
            }
            let n = Math.Max(1, box.Count)
            colors[i] = (int32(red / n) << 16) | (int32(green / n) << 8) | int32(blue / n)
        }
    }

    internal func Index(rgb int32) int32 {
        let index = (((rgb >> 19) & 31) << 10) | (((rgb >> 11) & 31) << 5) | ((rgb >> 3) & 31)
        if paletteMap[index] >= 0 {
            return int32(paletteMap[index])
        }
        let r = ((index >> 10) * 8) + 4
        let g = (((index >> 5) & 31) * 8) + 4
        let b = ((index & 31) * 8) + 4
        var best = 0
        var distance = Int32.MaxValue
        for i in 0 ... count {
            let color = colors[i]
            let dr = r - ((color >> 16) & 255)
            let dg = g - ((color >> 8) & 255)
            let db = b - (color & 255)
            let next = dr * dr + dg * dg + db * db
            if next < distance {
                best = i
                distance = next
            }
        }
        paletteMap[index] = int16(best)
        return best
    }

    private func planeCount(box PaletteBox, axis int32, at int32) int32 {
        var total = 0
        for r in box.R0 ... box.R1 + 1 {
            if axis == 0 && r != at {
                continue
            }
            for g in box.G0 ... box.G1 + 1 {
                if axis == 1 && g != at {
                    continue
                }
                for b in box.B0 ... box.B1 + 1 {
                    if axis == 2 && b != at {
                        continue
                    }
                    total += counts[(r << 10) | (g << 5) | b]
                }
            }
        }
        return total
    }

    private func tight(box PaletteBox) PaletteBox {
        var result = PaletteBox{R0: 31, G0: 31, B0: 31}
        for r in box.R0 ... box.R1 + 1 {
            for g in box.G0 ... box.G1 + 1 {
                for b in box.B0 ... box.B1 + 1 {
                    let n = counts[(r << 10) | (g << 5) | b]
                    if n == 0 {
                        continue
                    }
                    result.Count += n
                    result.R0 = Math.Min(result.R0, r)
                    result.R1 = Math.Max(result.R1, r)
                    result.G0 = Math.Min(result.G0, g)
                    result.G1 = Math.Max(result.G1, g)
                    result.B0 = Math.Min(result.B0, b)
                    result.B1 = Math.Max(result.B1, b)
                }
            }
        }
        return result
    }
}
