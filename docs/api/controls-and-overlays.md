# Controls and overlays

Controls state the current fact. Overlays own the active input scope. The complete member list is in [the reference](reference.md).

## Basic controls

| Type | State | Use |
| --- | --- | --- |
| `Label` | `Text`, `Alignment` | One clipped line of non-interactive text. |
| `Button` | `OnPress` | Invokes one explicit action. |
| `Toggle` | `IsChecked` | Independent Boolean choice. |
| `RadioGroup` | `SelectedToggle` | One choice among toggles. |
| `Select` | `SelectedIndex`, `IsOpen` | One choice from a compact option list. |
| `Badge` | `Text` | A short inverted label, not a button. |
| `Separator` | `Glyph`, `Orientation` | Structural division. |

```gsharp
let autosave = Toggle{ Text: "Autosave", IsChecked: true }
let mode = Select{ Options: { "Draft", "Review", "Final" }, Placeholder: "choose mode" }
let state = Badge{ Text: "MODIFIED" }
let save = Button{ Text: "Save", OnPress: () -> state.Text = "SAVED" }

if mode.ConsumeSelectionChange() != nil {
  state.Text = mode.Options[mode.SelectedIndex]
}
```

`Button.OnPress` runs on Enter, space, or click. `Toggle` flips on the same inputs. Set `CheckedGlyph` and `UncheckedGlyph` only when the default bracket glyphs do not convey state.

`RadioGroup.Add(toggle)` gives its toggles radio behavior. `Select` opens a keyboard- and mouse-navigable option list. Set `Options`, then call `Refresh()` after direct list mutation. Programmatic `SelectedIndex` changes do not produce `SelectionChange`.

`SeparatorOrientation.Horizontal` divides rows. `SeparatorOrientation.Vertical` divides columns. `Separator.Glyph` is the visible rule. Keep it structural.

## Focus and state

Every interactive control needs a visible focus state. SharpTUI controls inherit `Box.FocusedStyle`; selected collection controls also have selected styles. Do not draw a second status echo for the active field or choice.

```gsharp
let choice = RadioGroup{}
choice.Add(Toggle{ Text: "Compact" })
choice.Add(Toggle{ Text: "Comfortable" })

let name = Label{ Text: "Profile" }
let rule = Separator{ Orientation: SeparatorOrientation.Horizontal }
```

`RadioGroup.Select(toggle)` selects a member. `ClearSelection()` clears the group. `SelectedToggle` is nil when no toggle is selected.

### Control rules

- Don't use `Badge` as a button. It has no activation state.
- Don't use a `Label` where an editable value is required. Use `TextInput` or `TextArea`.
- Don't treat `SelectedIndex` as a user event. Consume `SelectionChange`.
- Don't communicate checked, selected, or disabled state by color alone. Keep the glyph, marker, or label truthful.

## Overlays

`Overlay` paints above normal siblings and traps input while open. It remembers the previous focus, moves focus into its content, and restores the prior visible target when it closes.

```gsharp
let confirm = Button{ Text: "Delete" }
let cancel = Button{ Text: "Cancel" }
let overlay = Overlay{
  IsVisible: false,
  DimBackground: true,
  Content: Row{ Children: { confirm, cancel } },
  DefaultAction: confirm,
  CancelAction: cancel,
}

overlay.IsVisible = true
```

`Content` is one `Box`. Assigning it replaces the existing content. `IsVisible` controls the overlay lifecycle. `DefaultAction` receives Enter after focused content declines it. `CancelAction` receives Enter after Escape reaches the scope. Both targets must be visible descendants.

`Dialog` is a centered, dimmed, bordered `Overlay` with a wrapped `Message` and a row of action buttons. Set `Actions` or mutate its list. `OnResult` receives the selected `DialogAction`.

```gsharp
let apply = DialogAction{ Text: "Apply" }
let dismiss = DialogAction{ Text: "Cancel", IsCancel: true }
let dialog = Dialog{
  Message: "Replace the selected text?",
  Actions: { apply, dismiss },
}
dialog.OnResult = (action DialogAction) -> {
  if action.IsCancel { dialog.IsVisible = false }
}
```

`DialogAction.IsCancel` names the Escape action. One activation invokes `OnResult` once. The dialog does not keep a second pending-result state.

### Overlay rules

- Don't leave an overlay visible when the decision ends. Set `IsVisible` false.
- Don't route plain-key commands around an open overlay. The overlay is the input scope.
- Don't use an overlay for an inline edit. Keep the edit in its field.
- Don't make a destructive dialog ambiguous. Give it a cancel action and an explicit action label.

## Spinners and splitters

`Spinner` advances only when `Advance()` is called. Its `Frames` list and `Text` are caller state. `FrameIndex` is derived and read-only.

```gsharp
let spinner = Spinner{ Text: "loading" }
spinner.Advance()

let left = Box{ Width: CellLength.Cells(24) }
let splitter = Splitter(left, SplitterAxis.Columns)
splitter.MinimumCells = 12
splitter.MaximumCells = 48
```

`Splitter(target, SplitterAxis.Columns)` is a one-cell vertical drag divider that adjusts the target width. `SplitterAxis.Rows` is a horizontal divider that adjusts target height. `ResizeBy(delta)` applies the same clamped resize and reports whether a size changed.

For exhaustive signatures, see [controls](reference.md#sharptuilabel), [overlay and dialog](reference.md#sharptuioverlay), and [splitter](reference.md#sharptuisplitter).
