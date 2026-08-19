# Getting started

## Principle

SharpTUI retains a tree. Construct it once. Mutate the same objects when state changes. Draw the tree into a `Screen` after each event batch.

Do not rebuild the tree in `Draw`. Do not draw application state only into a status line. Change the widget that owns the state.

For every member, see [reference.md](reference.md).

## 01 / Run a tree

`App.Run(root Box)` owns the terminal session. It runs until a handler returns `EventResult.Exit` or a fallback quit gesture matches. New apps use Escape and Ctrl+C as fallback quit gestures.

| Type | Role | Fact |
| --- | --- | --- |
| `App` | Terminal loop | Runs a `Box` tree or a custom `View`. |
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

## 02 / Use a view

`View` is for an application that owns state and a retained tree. `Draw(screen)` paints one frame. `Handle(ev)` returns `Continue`, `Handled`, or `Exit`.

| Result | Meaning | Next stage |
| --- | --- | --- |
| `Continue` | The view declined the event. | Later routing may run. |
| `Handled` | The view consumed the event. | Routing stops. |
| `Exit` | The app must stop. | The loop exits. |

```gs
package Demo

import SharpTui

class Counter : View {
  private var root Box
  private var value Label
  private var count int32

  public init() {
    count = 0
    value = Label{ Text: "0" }
    root = Column{
      Padding: CellInsets.All(1),
      Children: { Label{ Text: "press +" }, value },
    }
  }

  public func Draw(screen Screen) {
    screen.Clear()
    root.Draw(screen)
  }

  public func Handle(ev UiEvent) EventResult {
    let routed = root.Handle(ev)
    if routed != EventResult.Continue { return routed }
    if KeyGesture.Character("+").Matches(ev) {
      count = count + 1
      value.Text = count.ToString()
      return EventResult.Handled
    }
    return EventResult.Continue
  }
}

func Main(args []string) int32 {
  let app = App()
  app.Run(Counter())
  return 0
}
```

`App` routes every event through four application stages:

| Stage | Result |
| --- | --- |
| `BeforeWidgets` | The application keymap runs before the view. A match returns `Handled`. |
| `View.Handle(ev)` | The view runs. A non-`Continue` result stops routing. |
| `AfterWidgets` | The application keymap runs after the view returns `Continue`. A match returns `Handled`. |
| `QuitGestures` | Fallback quit gestures run last. A match returns `Exit`. |

Inside a custom `View`, route the retained root before view fallback shortcuts. A focused widget gets its event before that fallback logic. Mutating `value.Text` retains the new state. The event loop marks accepted input work dirty and draws the next frame.

`App.StartWorker[T](work)` owns one background operation and returns its terminal state to the application loop. Use `App.Post(work)` for results from external producers. `App.RequestDraw()` requests one coalesced repaint when no input event already causes one.

## 03 / Test the same path

`TestDriver` runs a `Box` tree or `View` without a terminal or clock. Its width and height are terminal cells. Both values must be 0 or more.

| Method | Result |
| --- | --- |
| `Send(ev)` | Routes one event through the normal application pipeline. |
| `Pump()` | Runs posted work and samples animations at the current time. |
| `Draw()` | Paints and returns the ANSI diff. |
| `Resize(width, height)` | Changes the deterministic screen size. |
| `Advance(elapsed)` | Moves caller-controlled time forward. |

```gs
let driver = TestDriver(Counter(), 40, 8)
let result = driver.Send(UiEvent{
  Kind: UiEventKind.Key,
  Key: Key.Character,
  Text: "+",
  Phase: KeyPhase.Press,
})
let frame = driver.Draw()
```

The driver exposes its `App`, `Screen`, current `NowMilliseconds`, and the focused element for a driven tree.

## Don't

- Don't recreate widgets to show a value change. Mutate the retained widget.
- Don't mutate the tree from a background thread. Use `App.StartWorker` for app-owned work or `App.Post` for results from an external producer.
- Don't omit `screen.Clear()` before drawing a custom `View` unless the view deliberately owns every cell.
- Don't return `Handled` for an event the view did not consume.
