# Input and commands

## Principle

Input is typed. A key, text payload, paste, mouse action, and tick are different `UiEventKind` values. Inspect the kind before reading the fields that belong to it.

Do not steal editing keys in a before-widget binding. The focused widget must receive its input first unless the command is global by definition.

For every member, see [reference.md](reference.md).

## 01 / Read an event

| Type | Values | Fact |
| --- | --- | --- |
| `UiEventKind` | `Key`, `TextInput`, `Paste`, `Mouse`, `Tick`, `Unknown` | Selects the meaningful event fields. |
| `Key` | Named keys plus `Character` | Printable text is in `UiEvent.Text`. |
| `KeyPhase` | `Press`, `Repeat`, `Release` | Gestures match `Press` only. |
| `KeyModifiers` | Shift, Alt, Ctrl, Super, Hyper, Meta, lock flags | Caps Lock and Num Lock do not affect shortcut matching. |
| `MouseKind` | Press, Release, Move, ScrollUp, ScrollDown, None | Describes the mouse action. |
| `MouseButton` | None, Left, Middle, Right | Identifies the physical button. |

```gs
package Demo

import SharpTui

class InputView : View {
  private var root Box
  private var status Label
  private var save Command

  public init() {
    status = Label{ Text: "ready" }
    root = Box{ Padding: CellInsets.All(1), Children: { status } }
    save = Command("save", "Save", KeyGesture.Ctrl("s"))
  }

  public func Configure(app App) {
    app.Keys.Add(save, BindingPhase.AfterWidgets)
  }

  public func Draw(screen Screen) {
    if save.Consume() { status.Text = "saved" }
    screen.Clear()
    root.Draw(screen)
  }

  public func Handle(ev UiEvent) EventResult {
    let routed = root.Handle(ev)
    if routed != EventResult.Continue { return routed }
    if ev.Kind == UiEventKind.Paste {
      status.Text = ev.Text
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press
        && ev.Button == MouseButton.Left {
      status.Text = ev.Position.Column.ToString() + "," + ev.Position.Row.ToString()
      return EventResult.Handled
    }
    if KeyGesture.Ctrl("q").Matches(ev) { return EventResult.Exit }
    return EventResult.Continue
  }
}

func Main(args []string) int32 {
  let app = App()
  let view = InputView()
  view.Configure(app)
  app.Run(view)
  return 0
}
```

`UiEvent.Position` is a terminal `CellPoint`. Key-code fields are protocol values. Use `Key` and `Text` for normal application behavior.

## 02 / Match a gesture

`KeyGesture.Character(text)` accepts exactly 1 grapheme. `KeyGesture.Ctrl(text)` adds Ctrl. Both match character text case-insensitively.

| Gesture field | Matching rule |
| --- | --- |
| `Key` | Must equal the event key. |
| `Text` | Used only for `Key.Character`. |
| `Modifiers` | Lock flags are ignored. |
| `Phase` | Must be `Press`. |

`KeyGesture.Ctrl("s").Matches(ev)` tests the same gesture used by the command above.

Do not compare a typed character through an assumed keyboard layout. `Key.Character` and `UiEvent.Text` carry the decoded input.

## 03 / Bind a command

`Command` carries a stable `Id`, a display `Label`, a `KeyGesture`, enabled state, and one consumable pending activation. `Bind` records a gesture and a routing phase. `Keymap` owns bindings in registration order.

| API | Result |
| --- | --- |
| `Command(id, label, gesture)` | Creates an enabled command. |
| `Command.Consume()` | Reports and clears one command activation. |
| `Keymap.Add(command, phase)` | Activates the command when its gesture matches. |
| `Keymap.Add(gesture, phase)` | Returns a `Bind` whose `Consume()` reports one match. |
| `Keymap.Offer(ev, phase)` | Offers one routing phase directly. |

The example above consumes `save` in `Draw`. `AfterWidgets` activates it after `View.Handle` returns, then the event loop draws the updated retained state.

`Command.IsEnabled = false` rejects activation. A disabled command does not consume the event.

## 04 / Keep routing ordered

`App` routes every event in this order:

| Stage | Result |
| --- | --- |
| 1 | `Keymap` offers `BeforeWidgets`. A match returns `Handled`. |
| 2 | `View.Handle(ev)` runs. A non-`Continue` result stops routing. |
| 3 | `Keymap` offers `AfterWidgets`. A match returns `Handled`. |
| 4 | `QuitGestures` run. A match returns `Exit`. |

`App.Run(root)` wraps the tree as a view. Its view handler calls `root.Handle(ev)`. A custom view must route its retained root before its fallback shortcuts.

Use `BeforeWidgets` only for a command that must preempt all controls. Use `AfterWidgets` for application shortcuts that must not interrupt text entry.

## 05 / Keep focus visible

`Box.Handle(ev)` routes keyboard and text input to the focused descendant. If there is no focused control, input routing selects the first focusable box. Tab moves forward. BackTab moves backward. Both wrap in tree order.

| API | Focus effect |
| --- | --- |
| `Focus(target)` | Clears the tree's other focus, then focuses `target`. |
| `FocusNext()` | Moves to the next focusable visible box. |
| `FocusPrevious()` | Moves to the previous focusable visible box. |
| `FocusedElement` | Returns the visible focused descendant, or nil. |
| `FocusedStyle` | Applies only when that exact box has focus. |

Mouse reporting is opt-in through `App.MouseTracking`: `Disabled`, `Click`, `Drag`, or `AllMotion`. New apps use `Drag`. A press on a focusable hit target focuses it before routing the mouse event.

Focus is an accessibility state. Give every focusable control a distinct `FocusedStyle`. Do not use color as its only signal. Do not hide the state behind hover or a mouse-only interaction.

## Don't

- Don't read `Mouse`, `Button`, or `Position` from a non-mouse event.
- Don't treat `Repeat` or `Release` as a shortcut gesture match.
- Don't bind ordinary editing keys in `BeforeWidgets`.
- Don't consume a `Command` or `Bind` twice. `Consume()` clears its pending activation.
- Don't remove or obscure focus when a keyboard user changes controls.
