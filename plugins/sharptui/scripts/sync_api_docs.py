#!/usr/bin/env python3
"""Build SharpTUI, validate XML coverage, and emit a compact queryable API catalog."""

from __future__ import annotations

import argparse
import gzip
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
REFERENCES_ROOT = PLUGIN_ROOT / "skills" / "sharptui-authoring" / "references"
DEFAULT_OUTPUT = REFERENCES_ROOT / "api.json.gz"
LEGACY_OUTPUT = REFERENCES_ROOT / "api"
SECTION_CODES = {
    "Values": "V",
    "Constructors": "C",
    "Properties": "P",
    "Methods": "M",
}


def run(command: list[str], root: Path, capture: bool = False) -> str:
    result = subprocess.run(
        command,
        cwd=root,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return result.stdout if capture else ""


def short_name(name: str) -> str:
    return name.rsplit(".", 1)[-1].split("`", 1)[0]


def one_line(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def split_document(markdown: str) -> tuple[str, list[tuple[str, str]]]:
    matches = list(re.finditer(r"^## (SharpTui\.[A-Za-z0-9_.`]+)\n", markdown, re.MULTILINE))
    if not matches:
        raise RuntimeError("API generator returned no public type sections")
    header = markdown[: matches[0].start()]
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        sections.append((match.group(1), markdown[match.end() : end].strip()))
    return header, sections


def parse_type(full_name: str, body: str, ordinal: int) -> list[object]:
    member_start = body.find("\n### ")
    intro = body if member_start < 0 else body[:member_start]
    kind_match = re.search(r"G# kind: `([^`]+)`\.", intro)
    if kind_match is None:
        raise RuntimeError(f"missing G# kind for {full_name}")
    summary = one_line(intro.split("G# kind:", 1)[0])
    base_match = re.search(r"Inherits `([^`]+)`", intro)
    base = base_match.group(1) if base_match else ""
    interface_match = re.search(r"Implements (.+?)\.", intro)
    interfaces = re.findall(r"`([^`]+)`", interface_match.group(1)) if interface_match else []

    members: list[list[object]] = []
    section_code = ""
    current: list[object] | None = None
    member_ordinal = 0
    source_member_count = 0
    for line in body.splitlines():
        heading = re.fullmatch(r"### (.+)", line)
        if heading:
            section_code = SECTION_CODES.get(heading.group(1), "")
            current = None
            continue
        member = re.fullmatch(r"- `([^`]+)`(?: — (.*))?", line)
        if member and section_code:
            source_member_count += 1
            current = [
                section_code,
                member.group(1),
                one_line(member.group(2) or ""),
                [],
                "",
                member_ordinal,
            ]
            member_ordinal += 1
            members.append(current)
            continue
        parameter = re.fullmatch(r"  - `([^`]+)`: (.*)", line)
        if parameter and current is not None:
            current[3].append([parameter.group(1), one_line(parameter.group(2))])
            continue
        returns = re.fullmatch(r"  - Returns: (.*)", line)
        if returns and current is not None:
            current[4] = one_line(returns.group(1))

    if source_member_count != len(members):
        raise RuntimeError(f"member parse mismatch for {full_name}")
    return [short_name(full_name), kind_match.group(1), base, interfaces, summary, members, ordinal]


def build_catalog(markdown: str, coverage: str) -> dict[str, object]:
    header, sections = split_document(markdown)
    hash_match = re.search(r"Public-symbol SHA-256: `([^`]+)`", header)
    if hash_match is None:
        raise RuntimeError("API generator returned no public-symbol hash")
    types = [parse_type(name, body, ordinal) for ordinal, (name, body) in enumerate(sections)]
    names = [entry[0] for entry in types]
    if len(names) != len(set(names)):
        raise RuntimeError("compact catalog has duplicate short type names")
    member_count = sum(len(entry[5]) for entry in types)
    return {
        "v": 1,
        "sha": hash_match.group(1),
        "coverage": one_line(coverage),
        "types_n": len(types),
        "members_n": member_count,
        "types": types,
    }


def encode_catalog(catalog: dict[str, object]) -> bytes:
    raw = json.dumps(catalog, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return gzip.compress(raw, compresslevel=9, mtime=0)


def verify_round_trip(payload: bytes, catalog: dict[str, object]) -> None:
    decoded = json.loads(gzip.decompress(payload))
    if decoded != catalog:
        raise RuntimeError("compact API catalog failed round-trip verification")
    if decoded["types_n"] != len(decoded["types"]):
        raise RuntimeError("compact API type count mismatch")
    if decoded["members_n"] != sum(len(entry[5]) for entry in decoded["types"]):
        raise RuntimeError("compact API member count mismatch")


def atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
        os.replace(temporary, path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a compressed SharpTUI API catalog from the assembly and complete XML docs."
    )
    parser.add_argument("repository", type=Path, help="Path to the SharpTUI repository")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output .json.gz catalog")
    parser.add_argument("--no-build", action="store_true", help="Use existing Release outputs")
    args = parser.parse_args()

    repository = args.repository.resolve()
    output = args.output.expanduser().resolve()
    framework = repository / "SharpTui.Framework.gsproj"
    inspector = repository / "tools" / "SharpTui.ApiSurface" / "SharpTui.ApiSurface.csproj"
    if not framework.is_file() or not inspector.is_file():
        parser.error(f"not a SharpTUI repository with the API-surface tool: {repository}")
    if output.suffixes[-2:] != [".json", ".gz"]:
        parser.error("--output must end in .json.gz")

    if not args.no_build:
        run(["dotnet", "build", str(framework), "-c", "Release"], repository)
        run(["dotnet", "build", str(inspector), "-c", "Release"], repository)

    base_command = [
        "dotnet", "run", "--project", str(inspector), "-c", "Release", "--no-build", "--"
    ]
    coverage = run(base_command, repository, capture=True)
    if not coverage.startswith("api surface: ok"):
        raise RuntimeError(f"API/XML coverage validation did not pass: {coverage.strip()}")
    markdown = run(base_command + ["--print-docs"], repository, capture=True)
    if not markdown.startswith("# SharpTUI public API\n"):
        raise RuntimeError("API generator returned unexpected output")

    catalog = build_catalog(markdown, coverage)
    payload = encode_catalog(catalog)
    verify_round_trip(payload, catalog)
    atomic_write(output, payload)

    if output == DEFAULT_OUTPUT and LEGACY_OUTPUT.exists():
        previous = REFERENCES_ROOT / "api.previous"
        if previous.exists():
            if previous.is_dir():
                import shutil
                shutil.rmtree(previous)
            else:
                previous.unlink()
        os.replace(LEGACY_OUTPUT, previous)
        import shutil
        shutil.rmtree(previous)

    raw_bytes = len(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    print(
        f"generated {catalog['types_n']} types / {catalog['members_n']} members; "
        f"{raw_bytes} raw bytes -> {len(payload)} compressed bytes; {coverage.strip()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
