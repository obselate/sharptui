# API documentation

## 01 Authority

Do not edit [reference.md](reference.md). The API-surface tool generates it from the Release framework assembly and its merged XML documentation. The generated reference is the complete contract: 85 public types and 522 declared members.

`api/` locks the contract. `PublicApi.allowlist.txt` locks exported type names. `PublicApi.snapshot.txt` locks type kinds. `PublicApi.symbols.sha256` locks exported signatures. `PublicApi.documentation.xml` fills the remaining compiler XML gaps for enum values.

## 02 Regenerate

Build the framework first. The inspector rejects a stale assembly. HTML rendering requires Python 3 with `beautifulsoup4`, `markdown-it-py`, and `Pygments`.

```sh
dotnet build SharpTui.Framework.gsproj -c Release
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release --no-build -- --print-docs > docs/api/reference.md
python tools/render_api_html.py
```

Do not hand-edit `reference.md` or the HTML editions produced by `render_api_html.py`. Change the exported API or XML documentation, rebuild, validate, then regenerate.

## 03 Guides

The reference states signatures. These guides state use, bounds, and interaction rules.

| Area | Guide | Public API |
| --- | --- | --- |
| Application tree | [Getting started](getting-started.md) ([HTML](getting-started.html)) | `App`, `Box`, `Row`, `Column`, `Screen` |
| Layout and appearance | [Layout and styling](layout-and-styling.md) ([HTML](layout-and-styling.html)) | Cell geometry, placement, color, style, palette patterns |
| Events and shortcuts | [Input and commands](input-and-commands.md) ([HTML](input-and-commands.html)) | `UiEvent`, keys, mouse, `Keymap`, `Bind` |
| Text | [Text and rich content](text-and-rich-content.md) ([HTML](text-and-rich-content.html)) | Text controls, Markdown, rich text, syntax |
| Data views | [Collections](collections.md) ([HTML](collections.html)) | List, table, tree, tabs, status bar |
| Interactive controls | [Controls and overlays](controls-and-overlays.md) ([HTML](controls-and-overlays.html)) | Inputs, selection, dialogs, overlays, splitters |
| Drawing and runtime work | [Canvas, animation, and work](canvas-animation-and-work.md) ([HTML](canvas-animation-and-work.html)) | Canvas, indicators, animation, workers |
| Complete contract | [Reference](reference.md) ([HTML](reference.html)) | All exported types and members |

## 04 Migration

This release replaces polling and user-owned application lifecycle code with a retained `Box` tree and callbacks. Update the consumer project SDK first:

```xml
<Project Sdk="Gsharp.NET.Sdk/0.4.59">
```

Then migrate each removed surface:

| Previous API | Current API |
| --- | --- |
| `View`, `App.Run(View)` | Build a `Box` tree and call `App.Run(root)`. For custom drawing or input, subclass `Box` and override `Render` or `Accept`. The app owns clearing, drawing, and event routing. |
| `TestDriver(View, width, height)` | Pass the retained root to `TestDriver(root, width, height)`. |
| `Command` and `Bind.Consume()` | Register the action directly with `Keymap.Add(gesture, phase, handler)`. Use the overload with `id` and `label` when a command surface needs metadata. Toggle the returned `Bind.IsEnabled` property when availability changes. |
| `Button.IsPressed`, `Button.ConsumePress()` | Assign `Button.OnPress`. |
| `Dialog.Result`, `Dialog.ConsumeResult()` | Assign `Dialog.OnResult`. |
| `Theme`, `ThemeRole`, `ControlState` | Keep application palette entries as ordinary `Style` values and assign them to `Style`, `FocusedStyle`, `SelectedStyle`, `HeaderStyle`, and other control-specific style properties. |
| `Worker[T]`, `WorkerState`, `ConsumeResult`, `ConsumeError` | Call `App.StartWorker(work, completed, failed, cancelled)`. It returns a non-generic `Worker` with `IsRunning` and `Cancel`; terminal callbacks run on the application loop. |

Button, dialog, and key binding work now runs at activation time. Remove the polling loop that previously consumed pending state:

```gsharp
let app = App()
let state = Badge{ Text: "MODIFIED" }
let save = Button{ Text: "Save" }
save.OnPress = () -> state.Text = "SAVED"

let apply = DialogAction{ Text: "Apply" }
let confirm = Dialog{ Message: "Apply changes?", Actions: { apply } }
confirm.OnResult = (action DialogAction) -> {
  state.Text = action.Text
  confirm.IsVisible = false
}

app.Keys.Add(
  "save",
  "Save",
  KeyGesture.Ctrl("s"),
  BindingPhase.BeforeWidgets,
  () -> state.Text = "SAVED")
```

Background work also delivers terminal state through callbacks instead of a state machine:

```gsharp
let app = App()
let status = StatusBar{}
let worker = app.StartWorker[string]((token CancellationToken) -> {
  token.ThrowIfCancellationRequested()
  return "report ready"
},
  (report string) -> status.CenterText = report,
  (error Exception) -> status.CenterText = "failed: " + error.Message,
  () -> status.CenterText = "cancelled")
```

The `completed`, `failed`, and `cancelled` callbacks run on the application loop. Keep only the returned `Worker` when the caller needs `Cancel()` or `IsRunning`.

## 05 Boundaries

`SharpTui.Framework.gsproj` is the reusable library. `SharpTui.Examples.gsproj` builds the example executable against that library. `SharpTui.gsproj` is the monolithic verification executable. It includes framework sources, checks, and allocation benchmarks. It excludes examples.
