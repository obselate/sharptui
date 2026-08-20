<p align="center"><img src="docs/banner.gif" alt="sharptui" width="720"></p>

# sharptui

<p>
  <a href="https://github.com/obselate/sharptui/actions/workflows/ci.yml"><img src="https://github.com/obselate/sharptui/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <img src="https://img.shields.io/badge/.NET-10.0-512BD4" alt=".NET 10">
  <a href="https://github.com/DavidOBando/gsharp"><img src="https://img.shields.io/badge/G%23-0.4.59-8A2BE2" alt="G#"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-97CA00" alt="MIT"></a>
</p>

A small retained-tree TUI framework for G#.

## Install

SharpTUI uses `Gsharp.NET.Sdk/0.4.59` and requires the .NET 10 SDK. When
starting a new application, install the matching G# template package:

```sh
dotnet new install Gsharp.Templates@0.4.59
dotnet new gsharp-console -n MyApp
git clone https://github.com/obselate/sharptui
```

Keep the generated application and `sharptui` beside each other, then add the
framework project reference to the application's `.gsproj`. The G# SDK and
compiler restore from NuGet.

```xml
<Project Sdk="Gsharp.NET.Sdk/0.4.59">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../sharptui/SharpTui.Framework.gsproj" />
  </ItemGroup>

</Project>
```

## ChatGPT plugin

SharpTUI includes a skills-only plugin for ChatGPT and Codex. Add this GitHub
repository as a plugin marketplace:

```sh
codex plugin marketplace add obselate/sharptui
```

Restart the ChatGPT desktop app, open the Plugins Directory, select the
**SharpTUI** marketplace, and install **SharpTUI**. You can also install it
from the CLI:

```sh
codex plugin add sharptui@sharptui
```

The plugin supplies generated API lookup, concise G# authoring guidance, and
real-terminal viewport verification. It does not require an account, remote
service, or API key.

## Documentation

- [API guides and complete reference](docs/api/README.md) ([HTML edition](docs/api/README.html))
- [G# language and tooling](https://github.com/DavidOBando/gsharp)
- [Performance and allocation numbers](docs/performance.md)
- [ChatGPT plugin privacy](docs/plugin-privacy.md)
- [ChatGPT plugin terms](docs/plugin-terms.md)
- [examples/](examples/): eight complete applications, from a Git workbench to retained subcell drawing and animation galleries
- [LICENSE](LICENSE): MIT, with vendored Yoga.Net provenance in [vendor/Yoga.Net/UPSTREAM.md](vendor/Yoga.Net/UPSTREAM.md)

## tuitool

`SharpTui.Examples.gsproj` compiles the G# sources under `examples/` into
`tuitool`, an interactive picker for the eight bundled applications.

Run it without installing:

```sh
dotnet run -c Release --project SharpTui.Examples.gsproj
```

Build and install a stripped, self-contained Linux x64 NativeAOT executable:

```sh
dotnet build SharpTui.Framework.gsproj -c Release
dotnet restore SharpTui.Examples.gsproj \
  -r linux-x64 \
  --force \
  -p:PublishAot=true \
  -p:RestoreRecursive=false
dotnet publish SharpTui.Examples.gsproj \
  -c Release \
  -r linux-x64 \
  --self-contained true \
  --no-restore \
  -p:PublishAot=true \
  -p:UseAppHost=true \
  -p:StripSymbols=true \
  -p:BuildProjectReferences=false \
  -o bin/tuitool-publish
install -Dm755 bin/tuitool-publish/tuitool "$HOME/.local/bin/tuitool"
```

The framework build is required because the root projects share `obj/`. The
publish step reuses that Release framework output. `tools/install-tuitool`
performs the same build and installs the executable atomically:

```sh
./tools/install-tuitool
```

Ensure `$HOME/.local/bin` is in `PATH`, then run `tuitool`.

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

Escape or Ctrl+C quits.
