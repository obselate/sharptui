# API documentation

## 01 Authority

Do not edit [reference.md](reference.md). The API-surface tool generates it from the Release framework assembly and its merged XML documentation. The generated reference is the complete contract: 93 public types and 568 declared members.

`api/` locks the contract. `PublicApi.allowlist.txt` locks exported type names. `PublicApi.snapshot.txt` locks type kinds. `PublicApi.symbols.sha256` locks exported signatures. `PublicApi.documentation.xml` fills compiler XML gaps for interfaces and enums.

## 02 Regenerate

Build the framework first. The inspector rejects a stale assembly.

```sh
dotnet build SharpTui.Framework.gsproj -c Release
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release --no-build
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release --no-build -- --print-docs > docs/api/reference.md
```

Do not hand-edit generated signatures or summaries. Change the exported API or XML documentation, rebuild, validate, then regenerate.

## 03 Guides

The reference states signatures. These guides state use, bounds, and interaction rules.

| Area | Guide | Public API |
| --- | --- | --- |
| Application tree | [Getting started manual](getting-started.pdf) ([HTML](getting-started.html), [Markdown](getting-started.md)) | `App`, `View`, `Box`, `Row`, `Column`, `Screen` |
| Layout and appearance | [Layout and styling](layout-and-styling.md) | Cell geometry, placement, color, style, theme |
| Events and shortcuts | [Input and commands](input-and-commands.md) | `UiEvent`, keys, mouse, `Keymap`, `Command` |
| Text | [Text and rich content](text-and-rich-content.md) | Text controls, Markdown, rich text, syntax |
| Data views | [Collections](collections.md) | List, table, tree, tabs, status bar |
| Interactive controls | [Controls and overlays](controls-and-overlays.md) | Inputs, selection, dialogs, overlays, splitters |
| Drawing and runtime work | [Canvas, animation, and work](canvas-animation-and-work.md) | Canvas, indicators, animation, workers |
| Complete contract | [Reference](reference.md) | All exported types and members |

## 04 Boundaries

`SharpTui.Framework.gsproj` is the reusable library. `SharpTui.Examples.gsproj` builds the example executable against that library. `SharpTui.gsproj` is the monolithic verification executable. It includes framework sources, checks, and allocation benchmarks. It excludes examples.
