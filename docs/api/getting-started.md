# Getting started

## Principle

SharpTUI retains a tree. Construct it once. Mutate the same objects when state changes. `App` routes input and draws the tree after each event batch.

Do not rebuild the tree after each event. Do not mirror widget state through an application loop. Change the widget that owns the state.

For every member, see [reference.md](reference.md).

## 01 / Run a tree

`App.Run(root Box)` owns the terminal session. It runs until a handler returns `EventResult.Exit` or a fallback quit gesture matches. New apps use Escape and Ctrl+C as fallback quit gestures.

| Type | Role | Fact |
| --- | --- | --- |
| `App` | Terminal loop | Routes and draws one `Box` tree. |
| `Box` | Retained node | Every drawable control and container derives from it. |
| `Row` | Horizontal container | Lays children on the row axis. |
| `Column` | Vertical container | Lays children on the column axis. |
| `Screen` | Cell frame | Receives clear, write, fill, and border calls. |

```gs
package Demo

import SharpTui

func Main(args []string) int32 {
  let root = Column{
    Padding: CellInsets.All(1),
    GapCells: 1,
    Children: {
      Label{ Text: "SharpTUI" },
      Row{
        GrowWeight: 1,
        Children: {
          Box{ Width: CellLength.Cells(20), ShowBorder: true, Title: "left" },
          Box{ GrowWeight: 1, ShowBorder: true, Title: "right" },
        },
      },
    },
  }

  let app = App()
  app.Run(root)
  return 0
}
```

`CellLength.Cells(20)` uses a fixed 20-cell width. Its count must be 0 or more. `GrowWeight` distributes spare space only within its immediate in-flow parent.

## 02 / Change retained state

Controls invoke application work directly. The callback mutates retained widgets. There is no event-polling loop and no manual draw call.

```gs
package Demo

import SharpTui

func Main(args []string) int32 {
  var count = 0
  let value = Label{ Text: "0" }
  let increment = Button{ Text: "+" }
  increment.OnPress = () -> {
    count = count + 1
    value.Text = count.ToString()
  }
  let root = Column{
    Padding: CellInsets.All(1),
    GapCells: 1,
    Children: { value, increment },
  }
  let app = App()
  app.Run(root)
  return 0
}
```

`App` routes every event through four application stages:

| Stage | Result |
| --- | --- |
| `BeforeWidgets` | The application keymap runs before the tree. A match returns `Handled`. |
| `root.Handle(ev)` | Focused controls and their ancestors receive the event. |
| `AfterWidgets` | The application keymap runs after the tree returns `Continue`. A match returns `Handled`. |
| `QuitGestures` | Fallback quit gestures run last. A match returns `Exit`. |

Mutating `value.Text` retains the new state. The event loop marks accepted input work dirty and draws the next frame. A custom root control can override `Accept` for application-specific fallback input without owning the loop.

`App.StartWorker[T](work, completed, failed, cancelled)` owns one background operation and invokes one terminal callback on the application loop. Use `App.Post(work)` for results from external producers. `App.RequestDraw()` requests one coalesced repaint when no input event already causes one.

## 03 / Test the same path

`TestDriver` runs a `Box` tree without a terminal or clock. Its width and height are terminal cells. Both values must be 0 or more.

| Method | Result |
| --- | --- |
| `Send(ev)` | Routes one event through the normal application pipeline. |
| `Pump()` | Runs posted work and samples animations at the current time. |
| `Draw()` | Paints and returns the ANSI diff. |
| `Resize(width, height)` | Changes the deterministic screen size. |
| `Advance(elapsed)` | Moves caller-controlled time forward. |

```gs
let driver = TestDriver(root, 40, 8)
let result = driver.Send(UiEvent{
  Kind: UiEventKind.Key,
  Key: Key.Enter,
  Phase: KeyPhase.Press,
})
let frame = driver.Draw()
```

The driver exposes its `App`, `Screen`, current `NowMilliseconds`, and the focused element for a driven tree.

## Don't

- Don't recreate widgets to show a value change. Mutate the retained widget.
- Don't mutate the tree from a background thread. Use `App.StartWorker` for app-owned work or `App.Post` for results from an external producer.
- Don't call `screen.Clear()`, `root.Draw()`, or `root.Handle()` from application code. `App` owns those lifecycle calls.
- Don't return `Handled` from a custom root control for an event it did not consume.
