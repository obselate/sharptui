# API documentation

## 01 Authority

Do not edit [reference.md](reference.md). The API-surface tool generates it from the Release framework assembly and its merged XML documentation. The generated reference is the complete contract: 91 public types and 561 declared members.

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
| Application tree | [Getting started](getting-started.md) ([HTML](getting-started.html)) | `App`, `View`, `Box`, `Row`, `Column`, `Screen` |
| Layout and appearance | [Layout and styling](layout-and-styling.md) ([HTML](layout-and-styling.html)) | Cell geometry, placement, color, style, theme |
| Events and shortcuts | [Input and commands](input-and-commands.md) ([HTML](input-and-commands.html)) | `UiEvent`, keys, mouse, `Keymap`, `Command` |
| Text | [Text and rich content](text-and-rich-content.md) ([HTML](text-and-rich-content.html)) | Text controls, Markdown, rich text, syntax |
| Data views | [Collections](collections.md) ([HTML](collections.html)) | List, table, tree, tabs, status bar |
| Interactive controls | [Controls and overlays](controls-and-overlays.md) ([HTML](controls-and-overlays.html)) | Inputs, selection, dialogs, overlays, splitters |
| Drawing and runtime work | [Canvas, animation, and work](canvas-animation-and-work.md) ([HTML](canvas-animation-and-work.html)) | Canvas, indicators, animation, workers |
| Complete contract | [Reference](reference.md) ([HTML](reference.html)) | All exported types and members |

## 04 Boundaries

`SharpTui.Framework.gsproj` is the reusable library. `SharpTui.Examples.gsproj` builds the example executable against that library. `SharpTui.gsproj` is the monolithic verification executable. It includes framework sources, checks, and allocation benchmarks. It excludes examples.
