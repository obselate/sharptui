#!/usr/bin/env python3
"""Query the compressed SharpTUI API catalog without loading it into model context."""

from __future__ import annotations

import argparse
import difflib
import gzip
import json
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = PLUGIN_ROOT / "skills" / "sharptui-authoring" / "references" / "api.json.gz"
MAX_TYPES = 32
ALIASES = {
    "entry": ("TextInput",),
    "modal": ("Dialog", "Overlay"),
    "panel": ("Box", "Row", "Column"),
    "text": ("TextBlock", "Label"),
    "window": ("Column",),
}


def load(path: Path) -> dict[str, object]:
    try:
        catalog = json.loads(gzip.decompress(path.read_bytes()))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"invalid SharpTUI API catalog {path}: {error}") from error
    if catalog.get("v") != 1:
        raise SystemExit(f"unsupported SharpTUI API catalog version: {catalog.get('v')}")
    if catalog.get("types_n") != len(catalog.get("types", [])):
        raise SystemExit("SharpTUI API catalog type count mismatch")
    if catalog.get("members_n") != sum(len(entry[5]) for entry in catalog["types"]):
        raise SystemExit("SharpTUI API catalog member count mismatch")
    return catalog


def header(catalog: dict[str, object], brief: bool) -> str:
    mode = "signatures" if brief else "docs"
    return (
        f"#SharpTUI api.v1 sha={catalog['sha']} mode={mode}; "
        "@Type kind<Base>; C constructor; P property; M method; V enum; |=docs; arg name=docs; =>=return"
    )


def type_map(catalog: dict[str, object]) -> dict[str, list[object]]:
    return {entry[0].lower(): entry for entry in catalog["types"]}


def resolve(
    name: str, mapping: dict[str, list[object]]
) -> tuple[list[list[object]], str | None]:
    key = name.rsplit(".", 1)[-1].lower()
    if key in mapping:
        return [mapping[key]], None
    if key in ALIASES:
        canonical = ALIASES[key]
        return [mapping[item.lower()] for item in canonical], f"#alias {name} => {', '.join(canonical)}"
    matches = difflib.get_close_matches(key, mapping, n=5, cutoff=0.45)
    suffix = f"; closest: {', '.join(mapping[item][0] for item in matches)}" if matches else ""
    return [], f"#unknown {name}{suffix}"


def resolve_all(
    names: list[str], mapping: dict[str, list[object]]
) -> tuple[list[list[object]], list[str]]:
    entries: list[list[object]] = []
    notes: list[str] = []
    for name in names:
        resolved, note = resolve(name, mapping)
        entries.extend(resolved)
        if note:
            notes.append(note)
    return entries, notes


def expand_bases(entries: list[list[object]], mapping: dict[str, list[object]]) -> list[list[object]]:
    ordered: list[list[object]] = []
    seen: set[str] = set()

    def add(entry: list[object]) -> None:
        base = str(entry[2])
        if base and base.lower() in mapping:
            add(mapping[base.lower()])
        key = str(entry[0]).lower()
        if key not in seen:
            seen.add(key)
            ordered.append(entry)

    for entry in entries:
        add(entry)
    return ordered


def type_heading(entry: list[object], brief: bool) -> str:
    name, kind, base, interfaces, summary = entry[:5]
    inheritance = f"<{base}>" if base else ""
    implementation = f"[{','.join(interfaces)}]" if interfaces else ""
    line = f"@{name} {kind}{inheritance}{implementation}"
    return line if brief or not summary else f"{line}|{summary}"


def member_line(member: list[object], brief: bool) -> str:
    code, signature, summary, parameters, returns = member[:5]
    line = f"{code}|{signature}"
    if brief:
        return line
    if summary:
        line += f"|{summary}"
    for name, documentation in parameters:
        line += f"|arg {name}={documentation}"
    if returns:
        line += f"|=>{returns}"
    return line


def print_types(
    catalog: dict[str, object], entries: list[list[object]], brief: bool, notes: list[str]
) -> None:
    print(header(catalog, brief))
    for note in notes:
        print(note)
    for entry in entries:
        print(type_heading(entry, brief))
        for member in entry[5]:
            print(member_line(member, brief))


def search(
    catalog: dict[str, object],
    term: str,
    brief: bool,
    limit: int,
    entries: list[list[object]] | None = None,
    notes: list[str] | None = None,
) -> int:
    needle = term.casefold()
    hits: list[tuple[list[object], list[list[object]]]] = []
    count = 0
    candidates = entries if entries is not None else catalog["types"]
    exact_type = None if entries is not None else type_map(catalog).get(needle)
    if exact_type is not None:
        candidates = [exact_type]
    for entry in candidates:
        type_text = " ".join(str(value) for value in entry[:5]).casefold()
        member_hits = []
        for member in entry[5]:
            member_text = " ".join(
                [str(member[1]), str(member[2]), str(member[4])]
                + [f"{name} {docs}" for name, docs in member[3]]
            ).casefold()
            if needle in member_text and count < limit:
                member_hits.append(member)
                count += 1
        if exact_type is entry:
            member_hits = list(entry[5])
            count = len(member_hits)
        if needle in type_text or member_hits:
            hits.append((entry, member_hits))
        if count >= limit:
            break
    print(header(catalog, brief))
    for note in notes or []:
        print(note)
    scope = ",".join(str(entry[0]) for entry in entries) if entries is not None else "all"
    print(f"#search={term!r} scope={scope} limit={limit}")
    for entry, member_hits in hits:
        print(type_heading(entry, brief))
        for member in member_hits:
            print(member_line(member, brief))
    if not hits:
        print("#no matches")
        return 1
    if count >= limit:
        print("#truncated; narrow the search")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Emit only the SharpTUI API facts needed for a task.")
    parser.add_argument("types", nargs="*", help=f"Exact type names; maximum {MAX_TYPES} per call")
    parser.add_argument("-s", "--search", help="Search globally or within the supplied exact types")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--brief", action="store_true", help="Emit signatures without documentation")
    mode.add_argument("--docs", action="store_true", help="Include documentation for exact types")
    parser.add_argument("--no-base", action="store_true", help="Do not include SharpTUI base types")
    parser.add_argument("--list", action="store_true", help="List available type names densely")
    parser.add_argument("--stats", action="store_true", help="Print catalog integrity metadata")
    parser.add_argument("--limit", type=int, default=24, help="Maximum search-member matches")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help=argparse.SUPPRESS)
    args = parser.parse_args()

    catalog = load(args.catalog.expanduser().resolve())
    if args.stats:
        print(
            f"v={catalog['v']} sha={catalog['sha']} types={catalog['types_n']} "
            f"members={catalog['members_n']} coverage={catalog['coverage']}"
        )
        return 0
    if args.list or (not args.types and args.search is None):
        print("types=" + " ".join(entry[0] for entry in catalog["types"]))
        return 0
    if len(args.types) > MAX_TYPES:
        parser.error(f"query at most {MAX_TYPES} exact types in one brief surface")

    mapping = type_map(catalog)
    entries, notes = resolve_all(args.types, mapping)
    if entries and not args.no_base:
        entries = expand_bases(entries, mapping)
    if args.search is not None:
        if not 1 <= args.limit <= 100:
            parser.error("--limit must be between 1 and 100")
        result = search(
            catalog,
            args.search,
            args.brief,
            args.limit,
            entries if args.types else None,
            notes,
        )
        return result if entries or not args.types else 1
    brief = not args.docs
    print_types(catalog, entries, brief, notes)
    return 0 if entries else 1


if __name__ == "__main__":
    raise SystemExit(main())
