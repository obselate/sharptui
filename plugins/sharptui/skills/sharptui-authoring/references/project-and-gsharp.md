# Project and G#

Use .NET 10, the G# SDK, and the local SharpTUI project:

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

Adjust only the reference path. Source begins with a package and `import SharpTui`. Entry points use `func Main(args []string) int32`.

G# forms commonly mistranslated from C#:

- Construct with `Type()` or `Type{ Property: value }`.
- Generics use brackets: `List[string]`; arrays use `[]string`.
- Fields need explicit types.
- Static members live in `shared { }`; a type cannot call its own shared members, so use instance helpers.
- Interface signatures end with `;`.
- `switch` is exhaustive; if-chains are normal event dispatch.
- `sequence` is reserved.
- `if let` and `guard let` require nullable values; nullable absence is `nil`.
- Build control characters with `char(27)` instead of raw bytes.

`App.Run` requires a real TTY. Match the repository's collection and loop forms instead of translating C# mechanically.
