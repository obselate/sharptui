# SharpTUI API surface

Build the framework project, then run this command from the repository root:

```sh
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release --no-build
```

`PublicApi.allowlist.txt` locks the exported framework type names.
`PublicApi.snapshot.txt` locks their exported kind.
`PublicApi.symbols.sha256` locks every exported member signature, including public package-level helpers.
`PublicApi.documentation.xml` supplies enum and interface records that G# SDK 0.3.633 omits from
the compiler XML output even when their source declarations have documentation comments.

The inspection also rejects public generated methods and example application types. It fails when
any exported type, constructor, property, method, enum value, parameter, or non-void return value
lacks documentation across the compiler and supplemental XML inputs. Duplicate records fail too,
so compiler improvements force obsolete supplemental entries to be removed.

To review generated type or member snapshots before an approved API change, add `--print` or `--print-symbols`.

To generate Markdown reference documentation from the exported assembly and the complete merged
XML documentation set:

```sh
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release --no-build -- --print-docs
```

The command shares the API inspector's stale-build check, includes only exported types and members,
and prints signatures in G# notation. Build `SharpTui.Framework.gsproj` in Release first.

## Assembly boundary

`SharpTui.Framework.gsproj` is the reusable library: it deliberately excludes the
entry point, self-checks, allocation benchmark, and examples.
`SharpTui.Cli.gsproj` is the corresponding public-API executable project and
references the framework with explicit G# `import SharpTui` declarations. It
contains a small representative UI only.

G# referenced-assembly imports require external classes to be explicitly marked
`public` in source. CLR visibility inferred from an `open class` declaration is
not sufficient: `Box` and `Column` are explicit so their public constructors and
properties bind from the CLI. The importer still does not bind public package
helpers such as `ClipTo`, and `InternalsVisibleTo("SharpTui.Cli")` does not expose
internal `Box.Compute`; both are reported as missing. Therefore the CLI project
remains the target for public-only migrated consumers. `SharpTui.gsproj` is the
monolithic verification executable. It compiles framework sources, checks, and
allocation benchmarks together, but excludes the disposable example catalog and
its catalog-bound checks:

```sh
dotnet run --project SharpTui.gsproj -c Release --no-build -- --selfcheck
dotnet run --project SharpTui.gsproj -c Release --no-build -- --allocbench
```

Do not make transitional helpers public merely to unblock the split. Once the G#
referenced-assembly importer supports package functions and friend internals,
migrate remaining consumers to the established public API.
