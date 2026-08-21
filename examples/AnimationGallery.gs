package SharpTui

import SharpTui
import System
import System.Collections.Generic

struct EasingSpec {
  var Curve Easing
  var Name string
  var DurationMilliseconds float64
}

/// Four interactive scenes built from the public animation and canvas APIs.
open class AnimationGallery : Column {
  private var title Label
  private var caption Label
  private var canvas CanvasView
  private var surface CanvasSurface
  private var bar StatusBar
  private var animations AnimationController
  private var easings List[EasingSpec]
  private var active AnimationHandle?
  private var scene int32
  private var easingIndex int32
  private var speedIndex int32
  private var motion bool
  private var chromeMode int32

  private var eased float64
  private var orbitA float64
  private var orbitB float64
  private var breath float64
  private var leader float64
  private var wingA float64
  private var wingB float64
  private var pulse float64
  private var sweep float64
  private var wave float64
  private var colorPhase float64

  public init(animations AnimationController) {
    this.animations = animations
    easings = List[EasingSpec]{
      EasingSpec{ Curve: Easing.Linear, Name: "LINEAR", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.SineIn, Name: "SINE IN", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.SineOut, Name: "SINE OUT", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.SineInOut, Name: "SINE IN-OUT", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.CubicIn, Name: "CUBIC IN", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.CubicOut, Name: "CUBIC OUT", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.CubicInOut, Name: "CUBIC IN-OUT", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.BackIn, Name: "BACK IN", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.BackOut, Name: "BACK OUT", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.BackInOut, Name: "BACK IN-OUT", DurationMilliseconds: 900.0 },
      EasingSpec{ Curve: Easing.BounceIn, Name: "BOUNCE IN", DurationMilliseconds: 1200.0 },
      EasingSpec{ Curve: Easing.BounceOut, Name: "BOUNCE OUT", DurationMilliseconds: 1200.0 },
      EasingSpec{ Curve: Easing.BounceInOut, Name: "BOUNCE IN-OUT", DurationMilliseconds: 1200.0 },
      EasingSpec{ Curve: Easing.ElasticIn, Name: "ELASTIC IN", DurationMilliseconds: 1800.0 },
      EasingSpec{ Curve: Easing.ElasticOut, Name: "ELASTIC OUT", DurationMilliseconds: 1800.0 },
      EasingSpec{ Curve: Easing.ElasticInOut, Name: "ELASTIC IN-OUT", DurationMilliseconds: 1800.0 },
    }
    title = Label{ Style: paint(Ink.Text), Height: CellLength.Cells(1) }
    caption = Label{ Style: paint(Ink.Dim), Height: CellLength.Cells(1) }
    canvas = CanvasView(1, 1, CanvasMode.Braille)
    canvas.GrowWeight = 1
    canvas.ShowBorder = true
    canvas.Style = paint(Ink.Accent)
    surface = canvas.Surface
    bar = dimStatusBar()
    Children.Add(title)
    Children.Add(caption)
    Children.Add(canvas)
    Children.Add(bar)
    scene = 0
    easingIndex = 5
    speedIndex = 1
    motion = true
    chromeMode = -1
    startScene()
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    let width = Math.Max(screen.Size.WidthCells - 2, 1)
    let height = Math.Max(screen.Size.HeightRows - 5, 1)
    if surface.WidthCells != width || surface.HeightRows != height {
      surface.Resize(width, height)
    }
    updateChrome(screen.Size.WidthCells)
    paintScene()
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Phase == KeyPhase.Release { return EventResult.Continue }

    if ev.Key == Key.Escape { return EventResult.Exit }
    if ev.Key == Key.Right {
      showScene(scene + 1)
      return EventResult.Handled
    }
    if ev.Key == Key.Left {
      showScene(scene - 1)
      return EventResult.Handled
    }
    if ev.Key == Key.Up && scene == 0 {
      showEasing(easingIndex - 1)
      return EventResult.Handled
    }
    if ev.Key == Key.Down && scene == 0 {
      showEasing(easingIndex + 1)
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "1" {
      showScene(0)
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "2" {
      showScene(1)
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "3" {
      showScene(2)
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "4" {
      showScene(3)
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "r" {
      motion = true
      startScene()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "s" {
      speedIndex = speedIndex + 1
      if speedIndex > 2 { speedIndex = 0 }
      startScene()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "m" {
      toggleMotion()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "q" { return EventResult.Exit }
    return EventResult.Continue
  }

  private func showScene(value int32) {
    scene = value
    if scene < 0 { scene = 3 }
    if scene > 3 { scene = 0 }
    startScene()
  }

  private func showEasing(value int32) {
    easingIndex = value
    if easingIndex < 0 { easingIndex = easings.Count - 1 }
    if easingIndex >= easings.Count { easingIndex = 0 }
    startScene()
  }

  private func toggleMotion() {
    motion = !motion
    if motion {
      startScene()
      return
    }
    stopAnimation()
    updateLabels()
  }

  private func startScene() {
    stopAnimation()
    resetState()
    updateLabels()
    if !motion { return }
    animations.MotionScale = speedScale()
    var recipe = easingRecipe()
    if scene == 1 {
      recipe = orbitalRecipe()
    } else if scene == 2 {
      recipe = choreographyRecipe()
    } else if scene == 3 {
      recipe = signalRecipe()
    }
    active = animations.Play(recipe)
  }

  private func stopAnimation() {
    if let handle = active { handle.Cancel() }
    active = nil
  }

  private func resetState() {
    eased = 0.0
    orbitA = 0.0
    orbitB = 0.0
    breath = 0.0
    leader = 0.0
    wingA = 0.0
    wingB = 0.0
    pulse = 0.0
    sweep = 0.0
    wave = 0.0
    colorPhase = 0.0
  }

  private func easingRecipe() Animation {
    let easing = easings[easingIndex]
    let duration = TimeSpan.FromMilliseconds(easing.DurationMilliseconds)
    return Animation.Repeat(Animation.Sequence(
      Animation.Tween(duration, func(progress float64) {
        eased = progress
      }, easing.Curve),
      Animation.Wait(TimeSpan.FromMilliseconds(180.0)),
      Animation.Tween(duration, func(progress float64) {
        eased = 1.0 - progress
      }, easing.Curve),
      Animation.Wait(TimeSpan.FromMilliseconds(180.0))))
  }

  private func orbitalRecipe() Animation {
    return Animation.Parallel(
      Animation.Repeat(Animation.Tween(TimeSpan.FromMilliseconds(3800.0), func(progress float64) {
        orbitA = progress * Math.PI * 2.0
      }, Easing.Linear)),
      Animation.Repeat(Animation.Tween(TimeSpan.FromMilliseconds(2300.0), func(progress float64) {
        orbitB = progress * Math.PI * 2.0
      }, Easing.Linear)),
      Animation.Repeat(Animation.Sequence(
        Animation.Tween(TimeSpan.FromMilliseconds(900.0), func(progress float64) {
          breath = progress
        }, Easing.SineOut),
        Animation.Tween(TimeSpan.FromMilliseconds(900.0), func(progress float64) {
          breath = 1.0 - progress
        }, Easing.SineIn))))
  }

  private func choreographyRecipe() Animation {
    return Animation.Repeat(Animation.Sequence(
      Animation.Tween(TimeSpan.FromMilliseconds(620.0), func(progress float64) {
        leader = progress
        wingA = 0.0
        wingB = 0.0
        pulse = 0.0
      }, Easing.CubicOut),
      Animation.Wait(TimeSpan.FromMilliseconds(120.0)),
      Animation.Parallel(
        Animation.Tween(TimeSpan.FromMilliseconds(1200.0), func(progress float64) {
          wingA = progress
        }, Easing.BounceOut),
        Animation.Tween(TimeSpan.FromMilliseconds(1600.0), func(progress float64) {
          wingB = progress
        }, Easing.ElasticOut)),
      Animation.Repeat(Animation.Sequence(
        Animation.Tween(TimeSpan.FromMilliseconds(170.0), func(progress float64) {
          pulse = progress
        }, Easing.SineOut),
        Animation.Tween(TimeSpan.FromMilliseconds(170.0), func(progress float64) {
          pulse = 1.0 - progress
        }, Easing.SineIn)), 3),
      Animation.Wait(TimeSpan.FromMilliseconds(220.0)),
      Animation.Tween(TimeSpan.FromMilliseconds(620.0), func(progress float64) {
        leader = 1.0 - progress
        wingA = 1.0 - progress
        wingB = 1.0 - progress
        pulse = 0.0
      }, Easing.CubicIn)))
  }

  private func signalRecipe() Animation {
    return Animation.Parallel(
      Animation.Repeat(Animation.Tween(TimeSpan.FromMilliseconds(2600.0), func(progress float64) {
        sweep = progress
      }, Easing.Linear)),
      Animation.Repeat(Animation.Tween(TimeSpan.FromMilliseconds(1800.0), func(progress float64) {
        wave = progress
      }, Easing.SineInOut)),
      Animation.Repeat(Animation.Sequence(
        Animation.Tween(TimeSpan.FromMilliseconds(1400.0), func(progress float64) {
          colorPhase = progress
        }, Easing.CubicInOut),
        Animation.Tween(TimeSpan.FromMilliseconds(1400.0), func(progress float64) {
          colorPhase = 1.0 - progress
        }, Easing.CubicInOut))))
  }

  private func paintScene() {
    surface.Clear()
    let width = surface.SubcellWidth
    let height = surface.SubcellHeight
    if width < 8 || height < 8 { return }
    surface.Rect(1, 1, width - 2, height - 2, paint(Ink.Dim))
    if scene == 0 {
      paintEasing(width, height)
    } else if scene == 1 {
      paintOrbitals(width, height)
    } else if scene == 2 {
      paintChoreography(width, height)
    } else {
      paintSignals(width, height)
    }
  }

  private func paintEasing(width int32, height int32) {
    let left = width * 3 / 10
    let right = width * 7 / 10
    let middle = height / 2
    let dim = paint(Ink.Dim)
    let activePaint = paint(Animation.Lerp(Ink.Accent, Ink.Warm, eased))
    surface.Line(left, middle, right, middle, dim)
    for index in 0 ... 9 {
      let x = left + (right - left) * index / 8
      surface.Line(x, middle - 1, x, middle + 1, dim)
    }
    let radius = Math.Max(height / 18, 2)
    let x = Animation.Lerp(left, right, eased)
    let y = middle - int32(Math.Sin(eased * Math.PI) * float64(height / 5))
    surface.Circle(left, middle, radius, dim)
    surface.Circle(right, middle, radius, dim)
    surface.Line(left, middle, x, middle, paint(Ink.Good))
    surface.FillCircle(x, y, radius, activePaint)
    surface.Circle(x, y, radius + 2, paint(Ink.Warm))
  }

  private func paintOrbitals(width int32, height int32) {
    let cx = width / 2
    let cy = height / 2
    let outer = Math.Max(Math.Min(width / 4, height / 3), 4)
    let inner = outer / 2
    surface.Circle(cx, cy, outer, paint(Ink.Dim))
    surface.Circle(cx, cy, inner, paint(Ink.Dim))
    for index in 0 ... 18 {
      let angle = orbitA + float64(index) * Math.PI * 2.0 / 18.0
      let drift = int32(Math.Sin(orbitB + float64(index) * 0.8) * float64(outer / 4))
      let radius = outer + drift
      let x = cx + int32(Math.Cos(angle) * float64(radius))
      let y = cy + int32(Math.Sin(angle) * float64(radius))
      let mix = (Math.Sin(angle + orbitB) + 1.0) / 2.0
      surface.FillCircle(x, y, 1 + index % 2, paint(Animation.Lerp(Ink.Accent, Ink.Warm, mix)))
    }
    let ax = cx + int32(Math.Cos(orbitA) * float64(outer))
    let ay = cy + int32(Math.Sin(orbitA) * float64(outer))
    let bx = cx + int32(Math.Cos(-orbitB) * float64(inner))
    let by = cy + int32(Math.Sin(-orbitB) * float64(inner))
    surface.Line(cx, cy, ax, ay, paint(Ink.Accent))
    surface.Line(cx, cy, bx, by, paint(Ink.Good))
    surface.FillCircle(ax, ay, 3, paint(Ink.Warm))
    surface.FillCircle(bx, by, 2, paint(Ink.Good))
    surface.Circle(cx, cy, 2 + int32(breath * float64(inner / 2)), paint(Ink.Accent))
    surface.FillCircle(cx, cy, 2, paint(Ink.Text))
  }

  private func paintChoreography(width int32, height int32) {
    let start = CellPoint{ Column: width / 8, Row: height / 2 }
    let hub = CellPoint{ Column: width / 2, Row: height / 2 }
    let upper = CellPoint{ Column: width * 4 / 5, Row: height / 4 }
    let lower = CellPoint{ Column: width * 4 / 5, Row: height * 3 / 4 }
    let lead = Animation.Lerp(start, hub, leader)
    let first = Animation.Lerp(hub, upper, wingA)
    let second = Animation.Lerp(hub, lower, wingB)
    let dim = paint(Ink.Dim)
    surface.Line(start.Column, start.Row, hub.Column, hub.Row, dim)
    surface.Line(hub.Column, hub.Row, upper.Column, upper.Row, dim)
    surface.Line(hub.Column, hub.Row, lower.Column, lower.Row, dim)
    surface.FillCircle(start.Column, start.Row, 2, paint(Ink.Text))
    surface.FillCircle(lead.Column, lead.Row, 3, paint(Ink.Accent))
    surface.FillCircle(first.Column, first.Row, 3, paint(Ink.Good))
    surface.FillCircle(second.Column, second.Row, 3, paint(Ink.Warm))
    if pulse > 0.0 {
      let maximum = Math.Min(height / 6, width / 10)
      surface.Circle(hub.Column, hub.Row, 2 + int32(pulse * float64(maximum)), paint(Ink.Warm))
      surface.Circle(hub.Column, hub.Row, 4 + int32(pulse * float64(maximum)), paint(Ink.Accent))
    }
  }

  private func paintSignals(width int32, height int32) {
    let columns = 7
    let rows = 4
    let maximum = Math.Max(Math.Min(width / (columns * 5), height / (rows * 5)), 2)
    for row in 0 ... rows {
      for column in 0 ... columns {
        let phase = sweep * Math.PI * 2.0 - float64(column) * 0.72 - float64(row) * 0.46
        let energy = (Math.Sin(phase) + 1.0) / 2.0
        let mix = (Math.Sin(phase + colorPhase * Math.PI * 2.0) + 1.0) / 2.0
        let cx = (column + 1) * width / (columns + 1)
        let baseY = (row + 1) * height / (rows + 1)
        let cy = baseY + int32(Math.Sin(wave * Math.PI * 2.0 + float64(column) * 0.7) * float64(height / 30))
        let radius = 1 + int32(energy * float64(maximum))
        surface.Circle(cx, cy, radius + 2, paint(Ink.Dim))
        surface.FillCircle(cx, cy, radius, paint(Animation.Lerp(Ink.Accent, Ink.Warm, mix)))
      }
    }
    let scan = Animation.Lerp(2, width - 2, sweep)
    surface.Line(scan, 2, scan, height - 3, paint(Ink.Good))
  }

  private func updateLabels() {
    let name = sceneName()
    title.Text = "ANIMATION GALLERY / " + (scene + 1).ToString() + " OF 4 / " + name
    if scene == 0 {
      caption.Text = "EASING LAB / " + easings[easingIndex].Name + " / UP-DOWN CHANGES CURVE"
    } else if scene == 1 {
      caption.Text = "ORBITALS / PARALLEL CLOCKS / INDEFINITE REPEAT / RGB LERP"
    } else if scene == 2 {
      caption.Text = "CHOREOGRAPHY / SEQUENCE / WAIT / PARALLEL / FINITE REPEAT"
    } else {
      caption.Text = "SIGNAL FIELD / LINEAR SWEEP / COLOR AND POSITION COMPOSITION"
    }
    if !motion { caption.Text = caption.Text + " / MOTION OFF" }
    canvas.Title = name.ToLowerInvariant()
    bar.CenterText = motion ? speedName() + " MOTION" : "MOTION OFF"
  }

  private func updateChrome(width int32) {
    var next = 2
    if width < 70 { next = 0 } else if width < 100 { next = 1 }
    if next == chromeMode { return }
    chromeMode = next
    if next == 0 {
      bar.LeftText = "[←/→]SCENE"
      bar.RightText = "[r/s/m]CTRL [q]QUIT"
    } else if next == 1 {
      bar.LeftText = "[←/→] SCENE [↑/↓] EASING"
      bar.RightText = "[r]PLAY [s]SPD [m]MOT [q]QUIT"
    } else {
      bar.LeftText = "[←/→/1-4] SCENE [↑/↓] EASING"
      bar.RightText = "[r] REPLAY [s] SPEED [m] MOTION [q] QUIT"
    }
  }

  private func sceneName() string {
    if scene == 0 { return "EASING LAB" }
    if scene == 1 { return "ORBITALS" }
    if scene == 2 { return "CHOREOGRAPHY" }
    return "SIGNAL FIELD"
  }

  private func speedScale() float64 {
    if speedIndex == 0 { return 0.5 }
    if speedIndex == 2 { return 2.0 }
    return 1.0
  }

  private func speedName() string {
    if speedIndex == 0 { return "0.5x" }
    if speedIndex == 2 { return "2.0x" }
    return "1.0x"
  }

  private func paint(color Color) Style {
    return Style{ Foreground: color, Background: Color.Inherit }
  }
}

func animationGallery() int32 {
  let app = App()
  app.DefaultStyle = Style{ Foreground: Ink.Text, Background: Ink.Back }
  app.Run(AnimationGallery(app.Animations))
  return 0
}
