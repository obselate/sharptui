package SharpTui

import SharpTui
import System

/// A retained packed-subcell canvas animated by the application controller.
open class CanvasDemo : Column {
  private var surface CanvasSurface
  private var phase float64

  public init(animations AnimationController) {
    let canvas = CanvasView(1, 1, CanvasMode.Braille)
    canvas.GrowWeight = 1
    canvas.ShowBorder = true
    canvas.Title = "canvas / braille"
    canvas.Style = Style{ Foreground: Ink.Accent, Background: Color.Inherit }
    surface = canvas.Surface
    let title = Label{ Text: "retained subcells", Style: Style{ Foreground: Ink.Text, Background: Color.Inherit } }
    let footer = Label{ Text: "animation controller · q quits", Style: Style{ Foreground: Ink.Dim, Background: Color.Inherit } }
    Children.Add(title)
    Children.Add(canvas)
    Children.Add(footer)
    phase = 0.0
    paint()
    animations.Play(Animation.Repeat(Animation.Tween(
      TimeSpan.FromMilliseconds(2200.0),
      func(progress float64) {
        phase = progress * Math.PI * 2.0
        paint()
      }, Easing.CubicInOut)))
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    var width = screen.Size.WidthCells - 2
    var height = screen.Size.HeightRows - 4
    if width < 1 { width = 1 }
    if height < 1 { height = 1 }
    if surface.WidthCells != width || surface.HeightRows != height {
      surface.Resize(width, height)
      paint()
    }
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Key == Key.Character && ev.Text == "q" { return EventResult.Exit }
    return EventResult.Continue
  }

  private func paint() {
    let ink = Style{ Foreground: Ink.Good, Background: Color.Inherit }
    let warm = Style{ Foreground: Ink.Warm, Background: Color.Inherit }
    let w = surface.SubcellWidth
    let h = surface.SubcellHeight
    surface.Clear()
    surface.Rect(1, 1, w - 2, h - 2, Style{ Foreground: Ink.Dim, Background: Color.Inherit })
    let cx = w / 2 + int32(Math.Cos(phase) * float64(w / 4))
    let cy = h / 2 + int32(Math.Sin(phase * 1.7) * float64(h / 4))
    surface.Circle(cx, cy, h / 5, warm)
    surface.Line(2, h - 3, w - 3, 2, ink)
    surface.Line(2, 2, w - 3, h - 3, ink)
    surface.Fill(cx - 1, cy - 1, 3, 3, warm)
  }
}

func canvas() int32 {
  let app = App()
  app.DefaultStyle = Style{ Foreground: Ink.Text, Background: Ink.Back }
  app.Run(CanvasDemo(app.Animations))
  return 0
}
