# Performance

SharpTUI's renderer is allocation-free after warmup: a clean frame allocates
0 bytes, emits 0 terminal bytes, and the event loop blocks on stdin, so an
idle app uses zero CPU ticks. This document shows the measured numbers behind
that claim and how they compare to Terminal.Gui and to production TUIs.

## Protocol

Unless a section says otherwise, every number is the median of three fresh
Release processes on .NET 10 with tiered compilation disabled
(`COMPlus_TieredCompilation=0`), 64 warmup frames, and 2,000 measured frames
(500 for the high-level operations) on a 200x50 screen. Allocation is read
with `GC.GetAllocatedBytesForCurrentThread`. The harness is
`src/Checks/AllocBench.gs`, run as `--allocbench` on the main project. All
measurements were taken 2026-08-08 and 2026-08-09 on one Linux workstation.
Absolute times will differ on other hardware; the allocation counts are
exact and stable across runs.

## Renderer microbenchmarks

| Scenario | us/frame | B/frame |
|---|---:|---:|
| Full repaint + alternating resize + emit | 488.2 | 3,600 |
| Invalidate 10,000 cells + emit | 255.5 | 0 |
| Clean emit (nothing changed) | 71.2 | 0 |
| `Present(Stream.Null)` full path | 264.4 | 0 |
| Paint 50 Unicode lines | 116.7 | 3,600 |
| `Glyph.WidthOf`, 50-char line | 2.87 | 72 |
| `Ansi.Style` | 0.28 | 448 |

`Screen.WriteCell` resolves each glyph once and caches its display width and
UTF-8 bytes; emission copies cached bytes into a reusable buffer, and
`Terminal.Present` writes that buffer to stdout without building a string.
The 3,600 B in the full-repaint rows is grapheme substring creation for
non-ASCII clusters during paint, not the renderer.

## Widget redraws

Every public widget reaches a zero-allocation clean redraw after warmup, and
every unchanged frame emits zero terminal bytes because the cell diff rejects
it. Selected rows:

| Unchanged widget path | us/op | B/op | Gen0/op |
|---|---:|---:|---:|
| RichTextBlock, 50 visible lines | 968.6 | 0 | 0.000 |
| TableView | 620.2 | 0 | 0.000 |
| MarkdownView | 334.8 | 0 | 0.000 |
| Box, Row, and Column | ~240 | 0 | 0.000 |
| TextArea, 200 lines | 214.1 | 0 | 0.000 |
| TreeView | 149.4 | 0 | 0.000 |
| ListView | 136.2 | 0 | 0.000 |
| Dialog over background | 122.3 | 0 | 0.000 |
| TextInput | 73.6 | 0 | 0.000 |
| Leaf controls (Label, Badge, Spinner, ...) | 71.5 to 92.5 | 0 | 0.000 |

Table and tree selection and scrolling, TextArea row scrolling, RichTextBlock and
MarkdownView scrolling, and unchanged composite layout are also 0 B/op.
Editing a 200-line TextArea costs 254.2 us and 590 B/op; a nested gap reflow
costs 303.7 us and 440 B/op.

## Matched operations against Terminal.Gui

The control is [Terminal.Gui v2.4.17](https://github.com/gui-cs/Terminal.Gui/tree/v2.4.17)
at commit `d0a0ed9b150d3fc8aacf4ab07b7f7d91264fe6d6`, same runtime, same
protocol, same 200x50 screen and ASCII content. Each timed operation includes
input or model mutation, layout, widget paint, screen diff, and ANSI output
generation. The SharpTUI values are from a rerun of the protocol on the
final public API; the Terminal.Gui values are from the original matched
campaign. Two later reruns of the preserved Terminal.Gui scroll harness
measured medians of 23,156.7 and 23,531.0 us/op, within ordinary run
variance of the original 22,885.6.

| Operation | SharpTUI us/op | Terminal.Gui us/op | Time ratio | SharpTUI B/op | Terminal.Gui B/op | Output bytes |
|---|---:|---:|---:|---:|---:|---:|
| List selection move, no scroll | 177.2 | 23,125.5 | 130.5x | 0 | 22,170,176 | 164 / 10,031 |
| List scroll one row | 169.9 | 22,885.6 | 134.7x | 0 | 22,177,162 | 1,040 / 10,021 |
| Edit one character in a field | 107.9 | 857.1 | 7.9x | 112 | 763,577 | 107 / 210 |
| Update one damaged status line | 104.6 | 516.9 | 4.9x | 0 | 451,264 | 67 / 210 |

SharpTUI triggered no Gen0 collection in any 500-operation run; Terminal.Gui
measured 2.650 and 2.652 Gen0 collections per list key. The gap has a structural
cause: the ~10 KB of terminal output Terminal.Gui emits per selection key
shows its `ListView` invalidating and serializing the full visible list,
which accounts for the roughly 22 MB of allocation per key, while SharpTUI
recomputes layout and repaints the tree but lets the cell diff reduce the
update to the rows that changed. Terminal.Gui's own
`OutputBufferBenchmark.TypicalDrawCycle` independently measures 12.196 ms and
9 MB per 200x50 clear-and-refill, before any ANSI emission.

Renderer-level microbenchmarks put the same gap at 34.8x for a full paint
with resize, 18.8x for 50 Unicode lines, and 2.9x for a clean emit.

Fairness notes: this is a headless renderer comparison and excludes
terminal-emulator latency for both frameworks. The Terminal.Gui ANSI driver
builds and captures its output but does not cross its Unix native-write
boundary, while SharpTUI includes its normal byte-stream write and flush to
`Stream.Null`; that difference slightly favors Terminal.Gui. Output byte
counts are representative samples taken outside the timed interval, so they
carry less evidentiary weight than the timing and allocation medians. The
one-row scroll harness is preserved under
[`benchmarks/TerminalGuiScroll`](../benchmarks/TerminalGuiScroll/README.md)
so the control can be rerun.

## Against production TUIs

Real applications in a 200x50 controlling PTY with isolated empty home and
XDG configuration. Memory read after 90+ seconds; idle sampled for 30
seconds; the interaction sample is 100 alternating Down/Up keys at 20 ms
intervals (medians of three trials). These are real-application workloads,
not identical renderer microbenchmarks.

| Application and workload | RSS MiB | PSS MiB | Idle CPU | Idle output | CPU / 100 keys | Output / 100 keys |
|---|---:|---:|---:|---:|---:|---:|
| SharpTUI file browser | 35.0 | 29.7 | 0.000% | 0 B | 50 ms | 16.2 KiB |
| Terminal.Gui 2.4.17, matched browser | 94.9 | 87.3 | 2.800% | 9.1 KiB | 1,600 ms | 2,829.4 KiB |
| Neovim 0.12.4, `--clean README.md` | 11.7 | 4.4 | 0.000% | 0 B | 10 ms | 14.9 KiB |
| Yazi 26.5.6, repository browser | 45.0 | 33.3 | 0.033% | 0 B | 330 ms | 53.3 KiB |
| Lazygit 0.63.1, repository status | 45.4 | 38.9 | 0.000% | 0 B | 660 ms | 4.5 KiB |
| Glow 2.1.2, `--tui README.md` | 36.9 | 34.9 | 0.333% | 0 B | 30 ms | 33.1 KiB |
| Micro 2.0.15, `README.md` | 24.2 | 22.2 | 0.000% | 0 B | 180 ms | 73.4 KiB |

The Terminal.Gui browser is structurally matched to the SharpTUI one, a
list beside a preview, but the widget implementations are not identical, so
read that row as an application comparison, not a renderer benchmark. Its
application loop ran at its default 25 Hz, emitting cursor-hide and
cursor-position sequences on every clean iteration plus a `CSI 18t` size
query twice per second; those clean-loop writes are its 9.1 KiB idle output.
The SharpTUI browser idles at zero CPU ticks and zero output because the
event loop blocks on stdin rather than polling. The first SharpTUI
interaction trial used 400 ms while the JIT compiled newly reached input
paths; the next trials used 50 ms and 30 ms.

Startup timing is excluded: several of these applications wait on terminal
capability replies that the synthetic PTY did not emulate, so their
first-frame delays were query timeouts rather than startup cost.

## Known remaining costs

- A full direct repaint still allocates 3,600 B of grapheme substring work
  for non-ASCII clusters in the paint path.
- `Keymap` parses bind specs per key event instead of at `Add()` time.
- Markdown parsing and syntax highlighting are quadratic in places and have
  no internal memoization. They are safe only because callers cache the
  results and nothing currently calls them from the draw path.
- RichTextBlock's clean paint is CPU-bound at ~1 ms for 50 visible styled
  lines even though it allocates nothing.

## Reproducing

```sh
dotnet run -c Release --project SharpTui.gsproj -- --bench        # full repaint timing
dotnet run -c Release --project SharpTui.gsproj -- --allocbench   # allocation scenarios
```

Note that `--bench` includes JIT warmup in its printed average, roughly 2x
the steady state; the protocol above measures after warmup. The Terminal.Gui
scroll control lives in `benchmarks/TerminalGuiScroll/`.
