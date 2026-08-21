package SharpTui
import SharpTui
import System

/// An endlessly morphing Julia set, diving along its own boundary.
/// `sharptui --julia`. Drag to steer the shape, scroll to dive. q quits.
open class Julia : Box {
  private var t float64
  private var pfx float64
  private var pfy float64
  private var mcr float64
  private var mci float64
  private var mix float64
  private var zoff float64
  private var lw float64
  private var lr float64
  public init() { t = 0.0 }
  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Tick {
      t = t + 0.008
      mix = Math.Max(0.0, mix - 0.006)
    }
    if ev.Kind == UiEventKind.Mouse {
      if ev.Mouse == MouseKind.ScrollUp { zoff = Math.Min(zoff + 0.2, 2.8) }
      else if ev.Mouse == MouseKind.ScrollDown { zoff = Math.Max(zoff - 0.2, -0.8) }
      else if ev.Mouse != MouseKind.Release && lr > 0.0 {
        mcr = 2.6 * (float64(ev.Position.Column) / lw - 0.5)
        mci = 2.0 * (float64(ev.Position.Row) / lr - 0.5)
        mix = 1.0
      }
    }
    if ev.Key == Key.Character && ev.Text == "q" { return EventResult.Exit }
    return EventResult.Continue
  }
  protected override func Render(screen Screen, bounds CellRect, style Style) {
    let w = screen.Size.WidthCells
    let rows = screen.Size.HeightRows
    lw = float64(w)
    lr = float64(rows)
    let cr = mix * mcr + (1.0 - mix) * (0.62 + 0.24 * Math.Sin(0.37 * t)) * Math.Cos(t)
    let ci = mix * mci + (1.0 - mix) * (0.62 + 0.24 * Math.Sin(0.41 * t)) * Math.Sin(t)
    let zm = Math.Exp(1.6 * (1.0 - Math.Cos(0.21 * t)) + zoff)
    let m = Math.Sqrt((1.0 - 4.0 * cr) * (1.0 - 4.0 * cr) + 16.0 * ci * ci)
    let a = Math.Sqrt(Math.Max((m + 1.0 - 4.0 * cr) * 0.5, 0.0))
    let b = (ci > 0.0 ? -1.0 : 1.0) * Math.Sqrt(Math.Max((m - 1.0 + 4.0 * cr) * 0.5, 0.0))
    let s2 = ((1.0 - a) * 0.5 - pfx) * ((1.0 - a) * 0.5 - pfx) + (-b * 0.5 - pfy) * (-b * 0.5 - pfy) < ((1.0 + a) * 0.5 - pfx) * ((1.0 + a) * 0.5 - pfx) + (b * 0.5 - pfy) * (b * 0.5 - pfy) && (1.0 - a) * (1.0 - a) + b * b > 1.0
    if s2 { pfx = (1.0 - a) * 0.5 } else { pfx = (1.0 + a) * 0.5 }
    if s2 { pfy = -b * 0.5 } else { pfy = b * 0.5 }
    screen.WriteCell(0, 0, "▀", Style())
    System.Threading.Tasks.Parallel.For(0, rows, func(y int32) {
      for x in 0 ... w {
        screen.WriteCell(x, y, "▀", Style{ Foreground: shade(x, y * 2, w, rows * 2, cr, ci, zm), Background: shade(x, y * 2 + 1, w, rows * 2, cr, ci, zm) })
      }
    })
  }
  private func shade(px int32, py int32, w int32, h int32, cr float64, ci float64, zm float64) Color {
    let li = 220 + int32(90.0 * Math.Log(zm))
    var r = 0.0
    var g = 0.0
    var b = 0.0
    for k in 0 ... 4 {
      let v = escape(pfx * (1.0 - 1.0 / zm) + Math.Cos(0.06 * t) * ((float64(px) + float64(k % 2) * 0.5 - float64(w) * 0.5) * 2.6 / (float64(h) * zm)) - Math.Sin(0.06 * t) * ((float64(py) + float64(k / 2) * 0.5 - float64(h) * 0.5) * 2.6 / (float64(h) * zm)), pfy * (1.0 - 1.0 / zm) + Math.Sin(0.06 * t) * ((float64(px) + float64(k % 2) * 0.5 - float64(w) * 0.5) * 2.6 / (float64(h) * zm)) + Math.Cos(0.06 * t) * ((float64(py) + float64(k / 2) * 0.5 - float64(h) * 0.5) * 2.6 / (float64(h) * zm)), cr, ci, li)
      let glow = v >= 0.0 ? 235.0 * Math.Pow((v + 1.0) / float64(li), 5.0) : 0.0
      r = r + hue(v, 0.0, 90.0) + glow
      g = g + hue(v, 2.1, 40.0) + glow
      b = b + hue(v, 4.2, 160.0) + glow * 1.08
    }
    return Color.Rgb(int32(Math.Min(r * 0.25, 255.0)), int32(Math.Min(g * 0.25, 255.0)), int32(Math.Min(b * 0.25, 255.0)))
  }
  private func hue(v float64, p float64, a float64) float64 { return v >= 0.0 ? 127.5 + 127.5 * Math.Sin(0.07 * v + p + 0.05 * t) : a * Math.Exp(2.5 * v) }
  private func escape(ar float64, ai float64, cr float64, ci float64, lim int32) float64 {
    var zr = ar
    var zi = ai
    var mn = 1.0e9
    var n = 0
    while n < lim && zr * zr + zi * zi < 65536.0 {
      let r = zr * zr - zi * zi + cr
      zi = 2.0 * zr * zi + ci
      zr = r
      mn = Math.Min(mn, zr * zr + zi * zi)
      n = n + 1
    }
    if n == lim { return -Math.Sqrt(Math.Sqrt(mn)) - 0.001 }
    return float64(n) + 1.0 - Math.Log2(Math.Log(zr * zr + zi * zi) * 0.5)
  }
}
