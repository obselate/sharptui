package SharpTui

import System

internal class TerminalColors {
  shared {
    internal func Resolve(mode TerminalColorMode) TerminalColorMode {
      if mode != TerminalColorMode.Auto { return mode }
      if (Environment.GetEnvironmentVariable("NO_COLOR") ?? "") != "" { return TerminalColorMode.NoColor }
      let colorTerm = Environment.GetEnvironmentVariable("COLORTERM") ?? ""
      if colorTerm.Equals("truecolor", StringComparison.OrdinalIgnoreCase)
          || colorTerm.Equals("24bit", StringComparison.OrdinalIgnoreCase) {
        return TerminalColorMode.TrueColor
      }
      let term = Environment.GetEnvironmentVariable("TERM") ?? ""
      if term.Contains("256color", StringComparison.OrdinalIgnoreCase) {
        return TerminalColorMode.Palette256
      }
      return TerminalColorMode.Palette16
    }

    internal func PaletteIndex(color int32) int32 -> color - 0x01000000

    internal func To256(rgb int32) int32 {
      let red = (rgb >> 16) & 255
      let green = (rgb >> 8) & 255
      let blue = rgb & 255
      let cubeRed = channel6(red)
      let cubeGreen = channel6(green)
      let cubeBlue = channel6(blue)
      let cube = 16 + 36 * cubeRed + 6 * cubeGreen + cubeBlue
      let cubeRgb = indexedRgb(cube)
      let average = (red + green + blue) / 3
      var gray = (average - 8 + 5) / 10
      if gray < 0 { gray = 0 }
      if gray > 23 { gray = 23 }
      let grayIndex = 232 + gray
      let grayRgb = indexedRgb(grayIndex)
      return distance(rgb, grayRgb) < distance(rgb, cubeRgb) ? grayIndex : cube
    }

    internal func To16(rgb int32) int32 {
      var best = 0
      var bestDistance = Int32.MaxValue
      for index in 0 ... 16 {
        let next = distance(rgb, indexedRgb(index))
        if next < bestDistance {
          best = index
          bestDistance = next
        }
      }
      return best
    }

    internal func IndexedTo16(index int32) int32 {
      if index < 16 { return index }
      return To16(indexedRgb(index))
    }

    private func channel6(value int32) int32 -> (value * 5 + 127) / 255

    private func distance(a int32, b int32) int32 {
      let red = ((a >> 16) & 255) - ((b >> 16) & 255)
      let green = ((a >> 8) & 255) - ((b >> 8) & 255)
      let blue = (a & 255) - (b & 255)
      return red * red + green * green + blue * blue
    }

    private func indexedRgb(index int32) int32 {
      if index < 16 { return ansiRgb(index) }
      if index >= 232 {
        let value = 8 + (index - 232) * 10
        return (value << 16) | (value << 8) | value
      }
      let value = index - 16
      let red = cubeChannel(value / 36)
      let green = cubeChannel((value / 6) % 6)
      let blue = cubeChannel(value % 6)
      return (red << 16) | (green << 8) | blue
    }

    private func cubeChannel(value int32) int32 -> value == 0 ? 0 : 55 + value * 40

    private func ansiRgb(index int32) int32 {
      if index == 0 { return 0x000000 }
      if index == 1 { return 0x800000 }
      if index == 2 { return 0x008000 }
      if index == 3 { return 0x808000 }
      if index == 4 { return 0x000080 }
      if index == 5 { return 0x800080 }
      if index == 6 { return 0x008080 }
      if index == 7 { return 0xc0c0c0 }
      if index == 8 { return 0x808080 }
      if index == 9 { return 0xff0000 }
      if index == 10 { return 0x00ff00 }
      if index == 11 { return 0xffff00 }
      if index == 12 { return 0x0000ff }
      if index == 13 { return 0xff00ff }
      if index == 14 { return 0x00ffff }
      return 0xffffff
    }
  }
}
