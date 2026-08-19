# SharpTUI API surface

The checked API contract is documented at [docs/api/README.md](../docs/api/README.md). The generated complete reference is [docs/api/reference.md](../docs/api/reference.md).

Build the framework project, then inspect its public surface from the repository root:

```sh
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release --no-build
```

`PublicApi.allowlist.txt` locks the exported framework type names.
`PublicApi.snapshot.txt` locks their exported kind.
`PublicApi.symbols.sha256` locks every exported member signature, including public package-level helpers.
`PublicApi.documentation.xml` supplies enum and interface records that G# SDK 0.3.633 omits from the compiler XML output even when their source declarations have documentation comments.

The inspection also rejects public generated methods and example application types. It fails when
any exported type, constructor, property, method, enum value, parameter, or non-void return value
lacks documentation across the compiler and supplemental XML inputs. Duplicate records fail too,
so compiler improvements force obsolete supplemental entries to be removed.

To review generated type or member snapshots before an approved API change, add `--print` or `--print-symbols`.

To regenerate the committed Markdown reference from the exported assembly and the complete merged XML documentation set:

```sh
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release --no-build -- --print-docs > docs/api/reference.md
```

The command shares the inspector's stale-build check. It includes only exported types and members. It prints G# signatures. Build `SharpTui.Framework.gsproj` in Release first. Do not hand-edit `docs/api/reference.md`.

## Assembly boundary

`SharpTui.Framework.gsproj` is the reusable library. It excludes the entry point, self-checks, allocation benchmark, and examples. `SharpTui.Examples.gsproj` is the example executable. It references the framework project. `SharpTui.gsproj` is the monolithic verification executable. It compiles framework sources, checks, and allocation benchmarks. It excludes examples.

```sh
dotnet run --project SharpTui.gsproj -c Release --no-build -- --selfcheck
dotnet run --project SharpTui.gsproj -c Release --no-build -- --allocbench
```
