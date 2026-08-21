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

open class InputRoot : Box {
  private var status Label

  public init() {
    status = Label{ Text: "ready" }
    Padding = CellInsets.All(1)
    Children.Add(status)
  }

  public func Configure(app App) {
    app.Keys.Add("save", "Save", KeyGesture.Ctrl("s"),
      BindingPhase.AfterWidgets, () -> status.Text = "saved")
  }

  protected override func Accept(ev UiEvent) EventResult {
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
  let root = InputRoot()
  root.Configure(app)
  app.Run(root)
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

`KeyGesture.Ctrl("s").Matches(ev)` tests the same gesture used by the binding above.

Do not compare a typed character through an assumed keyboard layout. `Key.Character` and `UiEvent.Text` carry the decoded input.

## 03 / Bind a command

`Bind` carries a stable `Id`, display `Label`, `KeyGesture`, routing phase, enabled state, and callback. `Keymap` owns bindings in registration order.

| API | Result |
| --- | --- |
| `Keymap.Add(id, label, gesture, phase, handler)` | Adds and returns a named binding. |
| `Keymap.Add(gesture, phase, handler)` | Adds and returns an unnamed binding. |
| `Keymap.Offer(ev, phase)` | Offers one routing phase directly. |

The example invokes its save callback after the retained tree declines Ctrl+S. The callback mutates the status directly. There is no pending command state to poll during drawing.

`Bind.IsEnabled = false` rejects activation. A disabled binding does not consume the event.

## 04 / Keep routing ordered

`App` routes every event in this order:

| Stage | Result |
| --- | --- |
| 1 | `Keymap` offers `BeforeWidgets`. A match returns `Handled`. |
| 2 | `root.Handle(ev)` runs. A non-`Continue` result stops routing. |
| 3 | `Keymap` offers `AfterWidgets`. A match returns `Handled`. |
| 4 | `QuitGestures` run. A match returns `Exit`. |

`App.Run(root)` routes the tree directly. A custom root control receives fallback input through its `Accept` override after focused descendants decline it.

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
- Don't poll a flag for a binding match. Put the state transition in the binding handler.
- Don't remove or obscure focus when a keyboard user changes controls.
