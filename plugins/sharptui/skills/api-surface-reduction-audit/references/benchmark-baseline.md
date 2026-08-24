# SharpTUI allocation and API checkpoint

Use this checkpoint to compare API-reduction work with the measured state from 2026-08-20. Run the allocation comparison before the API comparison.

## Checkout identity

The framework tree was already dirty when the audit ran. The skill commit does not contain those pre-existing framework edits. A valid comparison must identify whether it uses this exact state or a later rebaseline.

| Item | Value |
|---|---|
| Parent commit | `cef4b6f77213c2faae31064934451de5b95d10c4` |
| Tracked framework diff SHA-256 | `a3f213184b30c206aa2c4d38398bb2e91f39a65fc31e1789be9c61d7e2c21d25` |
| Release framework DLL SHA-256 | `2ea0e2c5c981e0ad4171733ac02ee328022d8fd6aaca42ca3d896fb6fe6aee70` |
| Public API snapshot SHA-256 | `4bec9ac4f926030c1d47e4b57f7f6792298342fa34b518f61d8e3008ab60a973` |
| Public API allowlist SHA-256 | `bc04d3745f4a57bbff6b9f7d95fb09d4f4c1dc0bbaa13c160bba289b15e24db8` |
| Public symbol contract SHA-256 | `ed6be81f1094388f02ff85028d75498a118aef4ae3b0b61071758f10839dc105` |
| Runtime | .NET SDK 10.0.111 |
| System | Linux 7.1.8-1-cachyos, x86-64 |
| CPU | AMD Ryzen 7 3700X, 8 cores, 16 threads |

Reproduce the tracked framework diff fingerprint from the repository root:

```bash
git diff --binary -- src api SharpTui.Framework.gsproj SharpTui.gsproj | sha256sum
```

## Measurement protocol

- Use a Release build.
- Warm both variants before timing.
- Run each benchmark in at least three independent processes.
- Compare medians and retain all absolute process results.
- Measure update or construction allocation separately from steady-state invocation.
- Verify equivalent output and state transitions.
- Record elapsed time, B/op, retained heap after forced collection, and terminal bytes when relevant.
- Use the same machine and workload for timing claims. Label cross-machine results as a new baseline.

Verification commands for this checkpoint:

```bash
dotnet build SharpTui.Framework.gsproj -c Release
dotnet build SharpTui.gsproj -c Release
dotnet run --project SharpTui.gsproj -c Release --no-build -- --selfcheck
dotnet run --project tools/SharpTui.ApiSurface/SharpTui.ApiSurface.csproj -c Release
dotnet run --project SharpTui.gsproj -c Release --no-build -- --allocbench
dotnet run --project SharpTui.gsproj -c Release --no-build -- --uibench
```

## Public API baseline

The Release assembly exported 88 types and the generated reference contained 540 documented members and enum values.

| Capability | Types | Members |
|---|---:|---:|
| Application and work | 5 | 33 |
| Input and commands | 14 | 100 |
| Layout | 11 | 58 |
| Styling and drawing | 7 | 67 |
| Text and editing | 17 | 91 |
| Collections and selection | 15 | 99 |
| Controls and overlays | 14 | 58 |
| Animation | 5 | 34 |
| Total | 88 | 540 |

Type kinds were 47 classes, 19 enums, 4 interfaces, and 18 structs.

External source scans covered `/home/xaz/Projects/gituit`, `/home/xaz/Projects/roartui`, `/home/xaz/Projects/skiff`, and `/home/xaz/Projects/Reaver`. These textual counts are migration evidence, not proof of semantic use.

| Framework choreography | External call sites |
|---|---:|
| `ConsumePress()` | 37 |
| `ConsumeSelectionChange()` | 20 |
| Dialog `ConsumeResult()` | 8 |
| Worker `ConsumeResult(out ...)` | 1 |
| `Refresh()` | 14 |
| `screen.Clear()` | 5 |
| `root.Draw()` | 25 |
| `root.Handle()` | 40 |

For each API proposal, report the new type and member totals, the exact signature delta, migrated external call counts, and the before-and-after framework choreography count.

## Allocation placement baseline

These focused probes ran in three independent processes. Each listed allocation and retained-memory result was identical across all three runs.

| Path and workload | Current behavior | Alternative boundary cost | Total-result evidence |
|---|---|---|---|
| `Screen` shrink, 400x200 to 80x24 | 0 B, combined capacity remains 262,144 `Cell` slots | `TrimExcess` allocates 61,488 B once, capacity becomes 3,840 | 4,132,864 B managed heap released |
| Glyph cache clear after 10,000 glyphs | 0 B, dictionary capacity remains 17,519 and entry capacity remains 16,384 | Replace cache storage for 144 B | 887,544 B managed heap released |
| Bracketed paste after 5,000,000 bytes | `Begin` allocates 0 B, writer capacity remains 8,388,608 | Replace with 1,024-capacity buffer for 1,104 B | 8,390,016 B managed heap released |
| 10,000-node tree, unrelated global invalidation | 0 B/op | No allocation proposal | 309.924 us/op median versus 0.026 us/op idle |
| 10,000-point sparkline redraw | Auto-range rescan is 0 B/op | Fixed range remains 0 B/op | 83.483 us/op auto versus 52.686 us/op fixed, identical output |
| Bound callback proxy | Invocation is 0 B/op | Construction allocates 64 B, or 88 B when capturing | Construction cost is outside repeated invocation |

The first three rows are boundary-retention leads. They do not authorize unconditional compaction. Any implementation still needs a material threshold, stable-small-size test or hysteresis, and an end-to-end churn check.

The tree row records CPU cost displaced into broad invalidation. The sparkline row shows a rejected allocation sacrifice because an allocation-free option captures the measured gain. The callback row is the minimum gate for API designs that replace consume polling with callbacks: construction allocation may be bounded, but repeated dispatch must remain 0 B/op.

## Existing hot-path baseline

`--allocbench` medians from three independent processes:

| Operation | Median time | B/op |
|---|---:|---:|
| Full repaint after resize | 402.3 us | 3,600 |
| Invalidate and emit | 236.3 us | 0 |
| Clean emit | 74.4 us | 0 |
| Present | 181.2 us | 0 |
| Write 50 cells | 76.4 us | 3,600 |
| `MeasureWidth` | 2.68 us | 72 |
| ANSI style | 0.24 us | 448 |

Selected `--uibench` medians from three independent processes:

| Operation | Median time | B/op |
|---|---:|---:|
| Button press and consume | 99.2 us | 0 |
| List unchanged redraw | 112.1 us | 0 |
| Table unchanged redraw | 464.0 us | 0 |
| Tree unchanged redraw | 136.4 us | 0 |
| Sparkline 10,000-point auto-range redraw | 115.6 us | 0 |

## Comparison gate

An API reduction is an optimization only when it simplifies the consumer contract without an unaccounted total-cost regression.

Report:

1. Exact source and assembly fingerprint for both runs.
2. Public type, member, concept, call, state-transition, and choreography deltas.
3. Allocation-ledger disposition for each affected path: preserve, remove, or relocate.
4. Three-process absolute results and medians for affected hot paths.
5. Construction, update, and steady-state allocation separately.
6. Retained heap and churn behavior for any new cache, snapshot, source, callback, or ownership mechanism.
7. Equivalent consumer behavior and output.

Reject a proposal that lowers symbol or line count by hiding required state, moving bookkeeping to consumers, broadening invalidation, adding repeated allocation to a current 0 B hot path, or retaining substantially more memory without a measured total-result gain.
