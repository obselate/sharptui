<p align="center"><img src="https://raw.githubusercontent.com/obselate/sharptui/main/docs/banner.gif" alt="sharptui" width="720"></p>

# sharptui

<p>
  <a href="https://github.com/obselate/sharptui/actions/workflows/ci.yml"><img src="https://github.com/obselate/sharptui/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <img src="https://img.shields.io/badge/.NET-10.0-512BD4" alt=".NET 10">
  <a href="https://github.com/DavidOBando/gsharp"><img src="https://img.shields.io/badge/G%23-0.5.26-8A2BE2" alt="G#"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-97CA00" alt="MIT"></a>
</p>

A small retained-tree TUI framework for G#. The 0.2 API uses `App.Root`, `OnClick`, `OnChange`, `Gap` and `Grow`, with Kitty/Sixel images and media playback.

## Install

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0). Version 0.2.0 is built from this checkout. Use a project reference until the package is published.

```sh
dotnet new install Gsharp.Templates@0.5.26
dotnet new gsharp-console -n MyApp
dotnet add MyApp/MyApp.gsproj reference /path/to/sharptui/SharpTui.Framework.gsproj
dotnet run --project MyApp/MyApp.gsproj
```

## Example

Replace `MyApp/Main.gs` with:

```gs
package Demo

import SharpTui

func Main(args []string) int32 {
  App{ Root: Column{
    Padding: 1,
    Gap: 1,
    Children: {
      Label{ Text: "sharptui" },
      Row{
        Grow: 1,
        Children: {
          Box{ Width: 24, ShowBorder: true, Title: "Files" },
          MarkdownView{ Grow: 1, Source: "# Hello" },
        },
      },
    },
  } }.Run()
  return 0
}
```

Escape or Ctrl+C quits.

## Documentation

- [API guides and reference](docs/api/README.md)
- [HTML manual](docs/api/README.html)
- [Examples](examples/)
- [Performance](docs/performance.md)
- [G#](https://github.com/DavidOBando/gsharp)

Run the bundled example picker with `dotnet run -c Release --project SharpTui.Examples.gsproj`. Install its Linux x64 NativeAOT build with `./tools/install-tuitool`.

## ChatGPT plugin

```sh
codex plugin marketplace add obselate/sharptui
codex plugin add sharptui@sharptui
```

See the [privacy policy](docs/plugin-privacy.md) and [terms](docs/plugin-terms.md).

## License

[MIT](LICENSE). Yoga.Net provenance is recorded in [UPSTREAM.md](vendor/Yoga.Net/UPSTREAM.md).
