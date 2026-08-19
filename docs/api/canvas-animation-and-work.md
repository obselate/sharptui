# Canvas, animation, and work

Canvas keeps pixels. Animation changes retained state. Workers deliver terminal state through the application loop. The complete member list is in [the reference](reference.md).

## Canvas

`CanvasSurface` is retained. Draw into it outside `Draw`, then display it through `CanvasView`. Coordinates are subcells, not terminal cells.

| `CanvasMode` | Packing per terminal cell | Use |
| --- | --- | --- |
| `Braille` | 2 × 4 subcells | Highest compact line detail. |
| `Quadrant` | 2 × 2 subcells | Block-like pixel art. |
| `HalfBlock` | 1 × 2 subcells | Vertical detail with simple glyphs. |
| `Cell` | 1 × 1 subcell | Ordinary cell drawing. |

```gsharp
let canvas = CanvasView(40, 12, CanvasMode.Braille)
canvas.ShowBorder = true
canvas.Title = "signal"
let surface = canvas.Surface
let ink = Style{ Foreground: Color.Rgb("2563EB"), Background: Color.Inherit }

surface.Clear()
surface.Rect(1, 1, surface.SubcellWidth - 2, surface.SubcellHeight - 2, ink)
surface.Line(2, surface.SubcellHeight - 3, surface.SubcellWidth - 3, 2, ink)
```

`WidthCells` and `HeightRows` are terminal dimensions. `SubcellWidth` and `SubcellHeight` are the drawable coordinate bounds. `Point`, `Line`, `Polyline`, `Rect`, `Fill`, `Circle`, and `FillCircle` clip to the surface. Their style overloads retain style per affected terminal cell.

`CanvasView(width, height, mode)` owns its surface. Call `Surface.Resize(width, height)` to change dimensions and clear retained content. Construct and assign a separate `CanvasSurface` only when several views or application components must share it.

## Indicators

`ProgressBar` is one row. `Value` is clamped to the displayed range from zero through `Maximum`. A non-positive maximum leaves the bar empty. `OverlayText` is centered over the fill.

```gsharp
let progress = ProgressBar{
  Value: 3.0,
  Maximum: 5.0,
  OverlayText: "3/5",
  Width: CellLength.Cells(20),
  FillStyle: Style{ Foreground: Color.Rgb("16A34A"), Background: Color.Inherit },
}

let history = Sparkline{
  Values: { 3.0, 7.0, 5.0, 9.0 },
  ValueRange: NumericRange.Fixed(0.0, 10.0),
}
```

`Sparkline` draws one glyph per value, oldest first. `NumericRange.Auto` recalculates from the current values. `NumericRange.Fixed(minimum, maximum)` requires finite bounds and `maximum > minimum`.

### Indicator rules

- Don't animate a number when the value itself is the fact. Set `ProgressBar.Value`.
- Don't use automatic sparkline range when comparable charts need a fixed scale.
- Don't rely on fill color alone. Use `OverlayText`, a nearby label, or both.

## Animation

`Animation` is a reusable recipe. `AnimationController.Play` owns one running instance and returns an `AnimationHandle`.

```gsharp
let app = App()
var phase = 0.0
let pulse = Animation.Tween(
  TimeSpan.FromMilliseconds(150.0),
  func(progress float64) {
    phase = progress
  },
  Easing.CubicOut)

let handle = app.Animations.Play(pulse)
```

| API | Rule |
| --- | --- |
| `Animation.Tween` | Calls its update with eased progress over a duration. |
| `Animation.Wait` | Occupies time without state change. |
| `Animation.Sequence` | Runs child recipes in order. |
| `Animation.Parallel` | Runs child recipes together. |
| `Animation.Repeat` | Repeats forever or for a positive count. |
| `Animation.Lerp` | Interpolates `float64`, `int32`, `Color`, or `CellPoint` with clamped progress. |
| `AnimationController.MotionScale` | Zero completes active animations on the next app turn. |

`AnimationHandle.State` is an `AnimationState` value: `Running`, `Completed`, or `Cancelled`. `Finish()` applies the terminal sample. `Cancel()` stops without another sample.

`Easing` provides linear, sine, cubic, back, bounce, and elastic curves. Match the curve to the state change. `Linear` suits continuous indicators. `CubicOut` suits arrival. Back, bounce, and elastic announce themselves. Use them only when that motion is information.

### Animation rules

- Don't create an animation in `Draw`. Create the recipe once and mutate retained state from its update.
- Don't use `Repeat` without retaining or intentionally discarding the handle's lifetime.
- Don't assume cancellation applies a final value. Call `Finish` when the terminal state is required.
- Don't ignore reduced motion. Set `MotionScale` to zero when the application policy requires instant state changes.

## Background work

`App.StartWorker[T]` starts one app-owned function on a background thread, then posts completed, failed, or cancelled terminal state to the application loop. UI changes belong in the post-delivery path, never in the worker function.

```gsharp
let app = App()
let status = StatusBar{}
let worker = app.StartWorker[string]((token CancellationToken) -> {
  token.ThrowIfCancellationRequested()
  return "report ready"
})

var report string
if worker.ConsumeResult(out report) {
  status.CenterText = report
}
```

| `WorkerState` | Meaning |
| --- | --- |
| `Running` | Background operation is active. |
| `Completed` | One result is ready to consume. |
| `Failed` | One exception is ready to consume. |
| `Cancelled` | The operation exited after cancellation was requested. |

`ConsumeResult(out value)` and `ConsumeError()` consume each terminal payload once. `Cancel()` requests cooperative cancellation. State remains `Running` until the operation exits. The app requests cancellation for its active workers when its loop stops.

### Work rules

- Don't mutate widgets from `work`. Return data, then update retained UI after delivery.
- Don't discard a running handle when the operation may need explicit cancellation or terminal observation.
- Don't report completion before `ConsumeResult` succeeds. `WorkerState.Completed` means a result is ready, not yet applied.
- Don't hide failure. Consume the error and render the fact near the affected work.

For deterministic UI testing, see the [getting-started guide](getting-started.md#03--test-the-same-path) and [the `TestDriver` reference](reference.md#sharptuitestdriver). For exhaustive signatures, see [canvas](reference.md#sharptuicanvasmode), [animation](reference.md#sharptuianimation), and [worker](reference.md#sharptuiworker1).
