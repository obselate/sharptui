<p align="center"><img src="docs/banner.gif" alt="sharptui" width="720"></p>

# sharptui

<p>
  <a href="https://github.com/obselate/sharptui/actions/workflows/ci.yml"><img src="https://github.com/obselate/sharptui/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <img src="https://img.shields.io/badge/.NET-10.0-512BD4" alt=".NET 10">
  <a href="https://github.com/DavidOBando/gsharp"><img src="https://img.shields.io/badge/G%23-0.3.633-8A2BE2" alt="G#"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-97CA00" alt="MIT"></a>
</p>

A small retained-tree TUI framework for G#.

## Install

Clone sharptui next to your application and reference the framework project
from your own `.gsproj`. The G# compiler, `Gsharp.NET.Sdk`, restores from
NuGet and needs only the .NET 10 SDK.

```sh
git clone https://github.com/obselate/sharptui
```

```xml
<Project Sdk="Gsharp.NET.Sdk/0.3.633">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../sharptui/SharpTui.Framework.gsproj" />
  </ItemGroup>

</Project>
```

## Documentation

- [G# language and tooling](https://github.com/DavidOBando/gsharp)
- [Performance and allocation numbers](docs/performance.md)
- [examples/](examples/): seven complete applications, from a file browser to a git workbench
- [LICENSE](LICENSE): MIT, with vendored Yoga.Net provenance in [vendor/Yoga.Net/UPSTREAM.md](vendor/Yoga.Net/UPSTREAM.md)

## Example

Save this as `Main.gs` beside the project file above and `dotnet run`.

```gs
package Demo

import SharpTui

func Main(args []string) int32 {
  let root = Column{
    Padding: CellInsets.All(1),
    GapCells: 1,
    Children: {
      Label{ Text: "sharptui" },
      Row{
        GrowWeight: 1,
        Children: {
          Box{ Width: CellLength.Cells(24), ShowBorder: true, Title: "Files" },
          MarkdownView{ GrowWeight: 1, Source: "# Hello" },
        },
      },
    },
  }
  let app = App()
  app.Run(root)
  return 0
}
```

Escape or Ctrl+C quits. Run the bundled examples with
`dotnet run -c Release --project SharpTui.Examples.gsproj`.
