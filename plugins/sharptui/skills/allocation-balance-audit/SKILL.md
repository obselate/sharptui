---
name: allocation-balance-audit
description: Audit SharpTUI zero-allocation paths for cases where a bounded allocation reduces total CPU, retained memory, GC pressure, or API complexity. Use as the first phase of a combined allocation and API simplification audit, or independently for 0 B/op reviews, retained-capacity analysis, repeated recomputation, cache and pool costs, and allocation-free tradeoffs. Do not use for general cleanup without an allocation trade.
---

# Allocation balance audit

Find current paths where 0 B/op is achieved by paying a larger cost elsewhere. Produce measured candidates, not speculative advice.

Stay read-only unless the user asks for implementation. Temporary benchmark spikes are allowed outside the working tree.

## Policy

- Treat 0 B/op as a hot-path regression canary, not a product-level performance objective.
- Keep per-frame rendering, input dispatch, terminal emission, and other high-frequency paths allocation-free by default.
- Permit bounded allocation at infrequent phase boundaries when controlled evidence shows a better total result.
- Count CPU time, retained managed memory, GC activity, cache and pool retention, invalidation complexity, and caller ergonomics as costs.
- State where the cost moves. Allocation does not disappear because it occurs during construction, caching, pooling, source creation, or a caller-owned update.
- Use `api-surface-reduction-audit` for comprehensive public API simplification that is not caused by allocation, caching, pooling, or invalidation policy.

## Combined audit order

When allocation balance and API reduction are both in scope, complete this audit first. Do not start API reduction from the current public shape before identifying the costs that shape it.

Produce an allocation handoff with:

- Every accepted, rejected, and deferred candidate.
- The path frequency class and verified current B/op.
- The mechanism that achieves 0 B/op and the cost displaced elsewhere.
- The simplest tested allocation-free alternative and its result.
- The bounded allocation trigger, lifetime, invalidation rule, and churn guard for accepted candidates.
- Ownership, mutation, caching, pooling, source, snapshot, and lifecycle constraints that an API redesign must preserve or deliberately replace.
- The measurements and regression gates the later API audit must carry forward.

Pass this handoff to `api-surface-reduction-audit`. The later audit may simplify the public mechanism, but it must account for the measured cost placement instead of assuming API reduction is performance-neutral.

When comparing a later API change with the 2026-08-20 checkpoint, read [`../api-surface-reduction-audit/references/benchmark-baseline.md`](../api-surface-reduction-audit/references/benchmark-baseline.md). Use its checkout fingerprint and measurement protocol. Do not compare results when the measured source state or workload differs without labeling that difference.

## Candidate validity gate

A valid candidate must satisfy every item:

1. The current representative path is verified at 0 B/op.
2. The mechanism that enables 0 B/op and its displaced cost are identified in source.
3. The proposed allocation is bounded and has an explicit trigger or lifetime.
4. The alternative materially improves an absolute metric such as elapsed time, retained heap, GC frequency, or API complexity.
5. The workloads are semantically equivalent and produce the same observable result.
6. The simplest allocation-free alternative was tested first and did not capture the same gain.
7. A threshold, hysteresis rule, invalidation rule, or other guard prevents allocation churn.

Reject a candidate when its current path is not actually 0 B under representative data, the gain is only relative and negligible in absolute terms, the comparison changes behavior, or the allocation merely moves cost to another unmeasured boundary.

## Search

Run `scripts/find_candidates.sh <repository>` from this skill directory for initial leads. The script fails when the repository is missing. Its output is not evidence. Inspect each hit in context.

Prioritize:

- Collections that call `Clear()` and retain peak capacity after a large shrink.
- Buffers, pools, caches, glyph tables, and scratch collections that never compact or expire.
- Render, measure, emit, present, input, and selection paths that rescan stable data.
- Mutable public collections that prevent safe caching and require repeated recomputation or manual `Refresh()` calls.
- Allocation-free formatting, parsing, diffing, or traversal that performs duplicated work.
- Rare resize, reload, replacement, compaction, and source-snapshot boundaries where allocation can be amortized.

For each lead, trace construction, mutation, steady-state execution, shrink or disposal, and ownership. Identify whether the hidden payment is repeated CPU, retained heap, worse cache locality, manual invalidation, or caller allocation.

## Measure

Use existing repository benchmarks first. Add a temporary controlled spike only when the existing suite cannot compare equivalent behavior.

- Warm both variants before measurement.
- Run at least three independent processes and report the median.
- Record elapsed time, B/op, Gen0/op, terminal or output bytes when relevant, and retained managed heap after a forced collection when testing retention.
- Include ordinary data and the adversarial shape that motivates the candidate, such as large shrink, long stable data, Unicode, or sparse mutation.
- Verify the same output and state transitions.
- Measure construction or update allocation separately from steady-state execution.
- Report absolute values and ratios.

Before accepting an allocated cache or snapshot, test cheaper allocation-free changes such as a fast path, removing duplicate traversal, returning already-computed width, or changing loop structure.

## Classify

- `hot`: Called per cell, event, frame, or terminal flush. Preserve 0 B unless end-to-end evidence is overwhelming and GC behavior remains bounded.
- `warm`: Called on content mutation, selection change, or periodic refresh. Allow small bounded allocation when reuse amortizes it.
- `boundary`: Called on resize, source replacement, reload, compaction, or teardown. Prefer the best total result over 0 B purity.

## Report

Return:

1. A table of valid candidates with source path, frequency class, current 0 B mechanism, hidden payment, proposed allocation, trigger, evidence, and risk.
2. Rejected candidates and the specific failed validity condition.
3. The smallest safe implementation candidate.
4. The benchmark or regression gate required before merging.
5. The allocation handoff required by a later API reduction audit.

Use clickable source links and distinguish measurements from estimates.

## SharpTUI anchor

`Screen.resize` is the proven boundary example. Clearing and refilling `List<Cell>` buffers allocates 0 B on shrink but retains peak backing arrays. In the controlled 400x200 to 80x24 case, trimming allocated 61,488 B once, reduced combined capacity from 262,144 to 3,840 cells, and released 4,132,864 B of retained managed heap. A production candidate must use a material shrink ratio and hysteresis instead of trimming every resize.
