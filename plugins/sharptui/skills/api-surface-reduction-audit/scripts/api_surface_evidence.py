#!/usr/bin/env python3

import argparse
import re
from collections import defaultdict
from pathlib import Path


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("repository", type=Path)
    parser.add_argument("--consumer", action="append", type=Path, default=[])
    return parser.parse_args()


def load_types(snapshot):
    result = []
    for line in snapshot.read_text(encoding="utf-8").splitlines():
        parts = line.split("|")
        if len(parts) != 3 or parts[0] != "type":
            continue
        full_name = parts[1]
        short_name = full_name.rsplit(".", 1)[-1].split("`", 1)[0]
        result.append((full_name, short_name, parts[2]))
    return result


def load_member_counts(reference):
    counts = defaultdict(int)
    current = ""
    for line in reference.read_text(encoding="utf-8").splitlines():
        if line.startswith("## SharpTui."):
            current = line[3:].strip()
            continue
        if current and line.startswith("- `"):
            counts[current] += 1
    return counts


def category(relative):
    parts = relative.parts
    lowered = [part.lower() for part in parts]
    if "checks" in lowered or "tests" in lowered or "test" in lowered:
        return "checks"
    if parts and parts[0] in {"examples", "showcases"}:
        return "examples"
    if parts and parts[0] == "src":
        return "implementation"
    if parts and parts[0] == "docs" or relative.name.lower().startswith("readme"):
        return "docs"
    if parts and parts[0] == "tools":
        return "tools"
    if parts and parts[0] == "plugins":
        return "plugin"
    return "project"


def source_files(root):
    ignored = {".git", "bin", "obj", "vendor", "__pycache__"}
    suffixes = {".gs", ".cs", ".md"}
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in suffixes:
            continue
        relative = path.relative_to(root)
        if any(part in ignored for part in relative.parts):
            continue
        if relative.as_posix() == "docs/api/reference.md":
            continue
        yield path, relative


def scan_root(root, types, external, evidence):
    patterns = {
        full_name: re.compile(r"(?<![A-Za-z0-9_])" + re.escape(short_name) + r"(?![A-Za-z0-9_])")
        for full_name, short_name, _ in types
    }
    for path, relative in source_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        group = "external" if external else category(relative)
        for full_name, pattern in patterns.items():
            count = len(pattern.findall(text))
            if count:
                evidence[full_name][group]["files"] += 1
                evidence[full_name][group]["mentions"] += count


def cell(value):
    if not value:
        return "0"
    return f"{value['files']}/{value['mentions']}"


def main():
    args = arguments()
    repository = args.repository.resolve()
    if not repository.is_dir():
        raise SystemExit(f"repository does not exist: {repository}")
    snapshot = repository / "api" / "PublicApi.snapshot.txt"
    reference = repository / "docs" / "api" / "reference.md"
    if not snapshot.is_file():
        raise SystemExit(f"missing public API snapshot: {snapshot}")
    if not reference.is_file():
        raise SystemExit(f"missing generated API reference: {reference}")

    types = load_types(snapshot)
    member_counts = load_member_counts(reference)
    evidence = defaultdict(lambda: defaultdict(lambda: {"files": 0, "mentions": 0}))
    scan_root(repository, types, False, evidence)
    for consumer in args.consumer:
        consumer = consumer.resolve()
        if not consumer.is_dir():
            raise SystemExit(f"consumer does not exist: {consumer}")
        scan_root(consumer, types, True, evidence)

    kinds = defaultdict(int)
    for _, _, kind in types:
        kinds[kind] += 1
    total_members = sum(member_counts.values())

    print("# Public API surface evidence")
    print()
    print(f"- Repository: `{repository}`")
    print(f"- Exported types: {len(types)}")
    print(f"- Documented members and enum values: {total_members}")
    print("- Type kinds: " + ", ".join(f"{kind}={count}" for kind, count in sorted(kinds.items())))
    print("- Reference cells are `files/mentions`. They are textual leads, not proof of use or removal safety.")
    print()
    print("| Type | Kind | Members | Implementation | Checks | Examples | Authored docs | Tools | Plugin | External |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for full_name, _, kind in types:
        groups = evidence[full_name]
        print(
            f"| `{full_name}` | {kind} | {member_counts[full_name]} | "
            f"{cell(groups['implementation'])} | {cell(groups['checks'])} | "
            f"{cell(groups['examples'])} | {cell(groups['docs'])} | "
            f"{cell(groups['tools'])} | {cell(groups['plugin'])} | {cell(groups['external'])} |"
        )


if __name__ == "__main__":
    main()
