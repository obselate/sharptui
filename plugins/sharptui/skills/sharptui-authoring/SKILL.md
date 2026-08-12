---
name: sharptui-authoring
description: Build, modify, debug, or review SharpTUI interfaces in G#. Use for SharpTUI projects, .gs files importing SharpTui, its widgets, layout, color, input, focus, responsiveness, or API correctness. Do not use for other TUI frameworks.
---

# SharpTUI authoring

Use SharpTUI's retained widgets and generated public API; never transfer APIs or behavior from another TUI framework.

## Interface contract

Make the primary task and focus obvious. Give primary work complete grow paths; at narrow sizes reflow or hide secondary content before crushing controls. Keep text inside its region and render editable state at its control, not only in a status echo. Route through the retained root; protect active editors and overlays from plain-key commands. Keep modes, counters, collections, empty/error states, and non-color cues truthful. A state-change test must inspect affected content, not merely its label.

## API lookup

The plugin root is two directories above this file. Never open or decompress `references/api.json.gz`. Query it:

```sh
python3 <plugin-root>/scripts/query_api.py App View Row Column TextInput TableView StatusBar Overlay
```

Make one initial query containing the whole planned surface (up to 32 types); it returns brief exact G# signatures and bases. Imperfect names return aliases or suggestions without discarding valid types, so do not preflight with `--help` or `--list`. For semantics, use one scoped follow-up such as `Box --search GrowWeight`; use `--docs` only when full documentation for exact types is necessary. Thereafter query only symbols named by a compiler/runtime failure. The catalog is authoritative; inspect framework source only when it cannot resolve a concrete failure.

Read [Project and G#](references/project-and-gsharp.md) only when creating a consumer project or resolving unfamiliar syntax.

## Workflow

1. Inspect repository instructions and existing code; define state, focus, commands, empty/error states, and narrow behavior.
2. Construct one retained tree and mutate it outside `Draw`.
3. Route input through the root before application shortcuts; process widget signals after routing.
4. Build the exact Release project and run repository checks.
5. Exercise a real TTY at constrained, ordinary, and large sizes. Test focus, real typed replacement, overlays, data changes, and empty states. Inspect captures; process survival, labels changing, and intact borders alone do not prove correctness.

```sh
python3 <plugin-root>/scripts/verify_tui.py \
  --output-dir /tmp/sharptui-verification \
  -- <built-executable>
```

Refresh the catalog from a SharpTUI checkout with:

```sh
python3 <plugin-root>/scripts/sync_api_docs.py <sharptui-repository>
```
