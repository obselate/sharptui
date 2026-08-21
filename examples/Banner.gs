package SharpTui

import SharpTui

import System
import System.Collections.Generic

/// The picker's animated wordmark alone on a blank screen, for recording the
/// README banner from a real terminal. `sharptui --banner`. q quits.
open class Banner : Box {
  private var host App
  private var t float64
  private var mode int32
  private var logo List[string]

  public init(host App) {
    this.host = host
    logo = sharpLogo()
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Tick {
      if mode == 1 {
        mode = 2
        t = 0.0
        host.TickInterval = TimeSpan.FromMilliseconds(33.0)
      } else {
        t = t + 0.033
        if mode == 0 && t >= 2.4 { rest() }
        if mode == 2 && t >= 1.45 { rest() }
      }
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "q" { return EventResult.Exit }
    return EventResult.Continue
  }

  private func rest() {
    mode = 1
    host.TickInterval = TimeSpan.FromMilliseconds(3400.0)
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    let w = screen.Size.WidthCells
    let oy = (screen.Size.HeightRows - 5) / 2
    for row in 0 ... 3 {
      let line = logo[row]
      for i in 0 ... line.Length {
        screen.WriteCell((w - line.Length) / 2 + i, oy + row, line[i].ToString(),
          Style{ Foreground: shade(float64(i), float64(row)), Background: Ink.Back })
      }
    }
    let sub = "a retained-tree TUI for G#"
    var sa = 1.0
    if mode == 0 { sa = Math.Min(Math.Max((t - 1.1) * 1.4, 0.0), 1.0) }
    for i in 0 ... sub.Length {
      screen.WriteCell((w - sub.Length) / 2 + i, oy + 4, sub[i].ToString(),
        Style{ Foreground: Color.Rgb(glow(14.0, 85.0, sa, 0.0), glow(17.0, 92.0, sa, 0.0), glow(23.0, 107.0, sa, 0.0)), Background: Ink.Back })
    }
  }

  /// The colour of one wordmark cell under the current sweep or shine.
  private func shade(fx float64, fy float64) Color {
    var lit = 1.0
    var hot = 0.0
    if mode == 0 {
      let d = (t - 0.45) * 16.0 - fx - 0.8 * fy
      lit = Math.Min(Math.Max(d * 0.7, 0.0), 1.0)
      hot = Math.Exp(-d * d * 0.1)
    }
    if mode == 2 {
      let d = (t - 0.3) * 34.0 - fx - 1.2 * fy
      hot = Math.Exp(-d * d * 0.09) + 0.5 * Math.Exp(-(d - 5.0) * (d - 5.0) * 0.05)
    }
    return Color.Rgb(glow(14.0, 71.0, lit, hot), glow(17.0, 138.0, lit, hot), glow(23.0, 209.0, lit, hot))
  }

  /// One channel: base colour lifted toward full, plus the hot white flash.
  private func glow(base float64, full float64, lit float64, hot float64) int32 {
    return int32(Math.Min(base + lit * (full - base) + hot * 230.0, 255.0))
  }
}
