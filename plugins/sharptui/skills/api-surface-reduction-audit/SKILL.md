---
name: api-surface-reduction-audit
description: Audit SharpTUI's public framework API for comprehensive reduction and simplification while preserving useful capabilities. Run after allocation-balance-audit so measured cost placement constrains ownership and lifecycle redesign. Use when asked to shrink, rationalize, consolidate, redesign, or review the exported API. Do not use for internal cleanup or adding features.
---

# API surface reduction audit

Find the smallest coherent public API that preserves the framework's intended capabilities and makes common consumer tasks easier.

Default to a read-only audit. Do not remove, rename, obsolete, or hide public symbols unless the user asks for implementation and accepts the compatibility policy.

## Required audit order

Run `allocation-balance-audit` before this comprehensive audit. If both audits were requested together, do not inventory reduction candidates until the allocation audit has produced its handoff. If a current handoff was supplied, verify that it describes the same checkout and representative workloads before using it.

For work derived from the 2026-08-20 audit, read [`references/benchmark-baseline.md`](references/benchmark-baseline.md) before proposing or measuring a change. It records the measured source fingerprint, public contract, consumer choreography, allocation boundaries, and hot-path timings. Rebaseline explicitly when the fingerprint or workload changes.

Read the handoff as a cost-placement ledger. For each allocation candidate, carry forward:

- Path frequency and current B/op.
- Displaced CPU, retained memory, GC, invalidation, or caller cost.
- Accepted, rejected, or deferred verdict and why.
- Ownership, mutation, cache, pool, source, snapshot, and lifecycle constraints.
- Bounded allocation triggers and churn guards.
- Required performance and regression gates.

Use the ledger to constrain the target API. An API proposal must state whether it preserves, removes, or relocates each relevant cost. If it introduces an allocation trade not covered by the ledger, send only that candidate back through the allocation validity gate, record the result, then resume the API audit.

## Boundary

- Reduce concepts and obligations, not only symbol count.
- Do not treat absence from repository examples as proof that a public symbol is unused externally.
- Do not hide necessary complexity behind an opaque helper or move it into caller boilerplate.
- Do not preserve accidental complexity only because it already has tests or documentation.
- Do not merge types that have materially different ownership, lifetime, error, performance, or composition semantics.
- When an API exists primarily for allocation avoidance, caching, pooling, or manual invalidation, also apply the `allocation-balance-audit` validity gate before changing it.

## Authoring clarity

Optimize for application code whose intent is evident without understanding SharpTUI internals. An unfamiliar reader should be able to identify the retained tree, application state, commands, and state transitions directly from the consumer code.

Distinguish domain work from framework choreography:

- A loop that filters, transforms, or aggregates application data may be necessary domain logic.
- A loop that copies data between parallel widget collections, synchronizes indices, repairs selection, or manually rebuilds presentation state is API friction.
- Explicit `Refresh`, `Invalidate`, `Consume`, attach, detach, start, stop, and teardown sequences are reduction leads when ownership can make them safe and implicit.
- Call ordering that is valid only because of undocumented lifecycle state is API friction.
- Duplicated application and widget state is API friction when one authoritative value can drive both.
- Callbacks, handles, and source adapters should expose the application event or lifetime they represent, not internal rendering stages.

Do not remove explicit state merely to make code shorter. State transitions, ownership, cancellation, errors, and expensive work must remain visible when hiding them would make behavior surprising.

## Establish the contract

Read repository instructions and determine the authoritative public contract before evaluating candidates.

Prefer, in order:

1. A generated public API snapshot from the built assembly.
2. Generated reference documentation and symbol hashes.
3. Compiler or reflection output.
4. Source declarations only when no generated contract exists.

Record the baseline:

- Exported type count by kind.
- Exported member count by declaring type and member kind.
- Inheritance and interface relationships.
- Public package-level helpers.
- Compatibility guarantees and release maturity.
- Existing API gate, documentation generator, and representative consumers.
- The allocation handoff and the public capabilities affected by each finding.

For SharpTUI, treat the Release assembly, `api/PublicApi.snapshot.txt`, `api/PublicApi.allowlist.txt`, `api/PublicApi.symbols.sha256`, and generated `docs/api/reference.md` as the contract. Do not hand-edit generated artifacts.

Run `scripts/api_surface_evidence.py <repository> [--consumer <path>]...` from this skill directory to summarize the contract and textual type references. The script fails when a repository or consumer path is missing. The report supplies leads, not removal proof.

## Build the capability map

Account for every exported type and member. Assign each to a user-visible capability such as application lifecycle, layout, input, text, collections, overlays, animation, drawing, or testing.

For each capability, identify:

- The primary entry point.
- Alternate entry points that accomplish the same task.
- Required supporting types.
- Ownership and lifetime rules.
- Mutation and invalidation rules.
- Errors and invalid intermediate states.
- Examples, documentation, checks, and external consumers.
- Performance constraints that shaped the API.
- Framework choreography required from consumers beyond their domain logic.

Do not start from a target percentage reduction. Start from the tasks consumers must still be able to perform.

## Find reduction candidates

Look for:

- Multiple entry points for the same capability with no meaningful semantic difference.
- Public types or members used only to connect internal implementation stages.
- Manual lifecycle sequences such as construct, attach, refresh, consume, detach, or dispose when ownership could make the sequence implicit.
- Mutable public collections that require separate `Refresh()` or invalidation calls.
- Parallel APIs for cached and uncached, source and list, immediate and retained, or synchronous and asynchronous forms where one model can cover both.
- Data carriers that exist only to shuttle one value between adjacent calls.
- Boolean and nullable combinations that permit invalid states and should be one explicit state type.
- Overload families whose defaults, option objects, or value types can express the same capability more clearly.
- Public setters that violate invariants or expose implementation order.
- Names that force consumers to understand internal terminology.
- Test-only or diagnostic facilities shipped in the main runtime contract without a deliberate reason.
- Specialized wrappers with one consumer and no distinct behavior.
- Consumer loops, index arithmetic, duplicated fields, and callback chains whose only purpose is synchronizing framework state.
- Required call ordering that is not evident from types or method names.

Classify each lead:

- `remove`: Capability is accidental, obsolete, or explicitly no longer supported.
- `internalize`: Capability remains but consumers do not need the implementation type or member.
- `merge`: Multiple public concepts become one coherent concept.
- `replace`: A simpler model preserves the capability with migration.
- `rename`: The concept is sound but its public language is misleading.
- `retain`: The apparent duplication represents a real semantic distinction.
- `defer`: Evidence is insufficient or the compatibility cost dominates current benefit.

## Evidence hierarchy

Use evidence in this order:

1. Real external consumer source and production behavior.
2. Explicit compatibility commitments and published documentation.
3. Authored examples and guides that demonstrate intended use.
4. Behavioral checks and integration tests.
5. Framework-internal usage.
6. Textual reference counts.

Generated reference pages prove that a symbol is public. They do not prove that consumers need it. Zero textual references are only a lead because reflection, generated code, configuration, and external packages may still depend on the symbol.

## Candidate validity gate

A recommended reduction must satisfy every applicable condition:

1. The affected consumer capability is named precisely.
2. Retained, replaced, and intentionally removed behavior are distinguished.
3. Ownership, lifetime, errors, focus, input, rendering, and performance semantics remain explicit.
4. A representative before-and-after consumer example shows fewer concepts, calls, state transitions, or invalid states.
5. The exact public type and member delta is listed.
6. Repository and external-consumer evidence is cited, including contrary evidence.
7. Migration cost and compatibility strategy are stated.
8. The replacement does not move complexity into caller code, undocumented convention, runtime reflection, or a larger configuration object.
9. Relevant builds, API gates, checks, examples, and performance gates can verify the proposal.
10. The ordinary consumer path makes the retained tree, state, commands, and update flow at least as evident as before.
11. Any affected allocation-ledger finding has an explicit preserve, remove, or relocate decision backed by the required measurement.

Reject or defer a candidate when it only reduces raw symbol count, makes the common path longer, merges distinct semantics, relies solely on absence of references, or lacks a credible migration path.

## Measure simplification

Report concrete deltas rather than a single subjective score:

- Public types and members removed, added, merged, or renamed.
- Concepts a consumer must understand for the common task.
- Required construction, mutation, refresh, consume, and teardown calls.
- Caller-owned adapters, caches, snapshots, and bookkeeping objects.
- Invalid intermediate states removed or introduced.
- Lines and types in representative consumer examples.
- External call sites requiring migration.
- Runtime or allocation changes caused by ownership or caching changes.
- Framework-coordination statements versus domain and view-declaration statements in representative code.
- Consumer loops, index synchronization, duplicated state, and order-dependent lifecycle calls removed or introduced.

Fewer types and lines are not automatically better. A small explicit value type may be preferable to flags or positional arguments even when it increases the symbol count.

For representative consumer examples, perform an intent trace. Label each statement as domain logic, state declaration, view declaration, or framework choreography. Prefer proposals that remove choreography while leaving domain state and transitions explicit.

## Design the target surface

For every recommended change, provide:

- Current exact signatures.
- Proposed exact signatures.
- Before-and-after consumer code for one ordinary task and one edge case.
- Capability and behavior preserved.
- Removed concepts and invalid states.
- Compatibility choice: hard break, obsolete forwarding member, adapter, or staged removal.
- Required source, tests, examples, documentation, and generated-artifact changes.
- Performance or allocation verification when the ownership model changes.
- An intent trace showing which loops, synchronization steps, and lifecycle obligations remain and why.

Prefer a coherent target surface over isolated renames. Order changes so foundational ownership and state decisions happen before dependent widget-level cleanup.

## Verify

For an implemented SharpTUI reduction:

1. Build the Release framework.
2. Run the API-surface gate and inspect the exact contract delta.
3. Regenerate the API reference instead of editing it.
4. Compile representative repository examples and external consumers.
5. Run focused end-to-end checks for the changed capability.
6. Run allocation or performance gates when the change affects caching, sources, mutation, rendering, or lifetime.
7. Confirm removed symbols no longer appear in authored guides, examples, plugin catalogs, or generated documentation.

## Report

Return:

1. Baseline type and member inventory.
2. Capability map with every exported type accounted for.
3. Candidate table with classification, evidence, public delta, consumer simplification, compatibility cost, and verdict.
4. Rejected and deferred candidates with the failed condition.
5. Proposed target surface grouped by capability.
6. Ordered migration and verification plan.
7. The smallest safe first reduction, separated from later breaking redesigns.
8. Allocation-ledger disposition showing where every relevant measured cost remains after the proposed API changes.

Clearly label measured facts, source-supported conclusions, and design judgments.
