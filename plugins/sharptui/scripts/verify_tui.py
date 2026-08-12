#!/usr/bin/env python3
"""Capture inspectable SharpTUI screens from real PTYs at several sizes.

The verifier has no third-party dependencies. It reconstructs the terminal screen
from the ANSI stream, writes plain-text snapshots, and reports screen occupancy
plus character/style changes caused by optional input steps.
"""

from __future__ import annotations

import argparse
import codecs
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import termios
import time
import unicodedata


DEFAULT_SIZES = "60x20,80x24,120x32,140x40"
CSI_FINAL = re.compile(r"[@-~]")
BORDER_CORNER_PAIRS = (("┌", "┐"), ("└", "┘"), ("╔", "╗"), ("╚", "╝"))
HORIZONTAL_BORDER_CHARS = frozenset("─━═")


def cell_width(char: str) -> int:
    if unicodedata.combining(char):
        return 0
    return 2 if unicodedata.east_asian_width(char) in {"W", "F"} else 1


class VirtualScreen:
    def __init__(self, columns: int, rows: int) -> None:
        self.columns = columns
        self.rows = rows
        self.chars = [[" " for _ in range(columns)] for _ in range(rows)]
        self.styles = [[self.default_style() for _ in range(columns)] for _ in range(rows)]
        self.row = 0
        self.column = 0
        self.saved_row = 0
        self.saved_column = 0
        self.style = self.default_style()
        self.state = "text"
        self.control = ""

    @staticmethod
    def default_style() -> tuple[object, ...]:
        return (False, False, False, False, None, None)

    def clear(self) -> None:
        base = self.default_style()
        self.chars = [[" " for _ in range(self.columns)] for _ in range(self.rows)]
        self.styles = [[base for _ in range(self.columns)] for _ in range(self.rows)]
        self.row = 0
        self.column = 0

    def snapshot(self) -> tuple[tuple[tuple[str, tuple[object, ...]], ...], ...]:
        return tuple(
            tuple((self.chars[row][column], self.styles[row][column]) for column in range(self.columns))
            for row in range(self.rows)
        )

    def feed(self, text: str) -> None:
        for char in text:
            if self.state == "text":
                if char == "\x1b":
                    self.state = "escape"
                else:
                    self._text(char)
                continue

            if self.state == "escape":
                if char == "[":
                    self.control = ""
                    self.state = "csi"
                elif char == "]":
                    self.state = "osc"
                elif char in "()":
                    self.state = "charset"
                elif char == "7":
                    self.saved_row, self.saved_column = self.row, self.column
                    self.state = "text"
                elif char == "8":
                    self.row, self.column = self.saved_row, self.saved_column
                    self.state = "text"
                else:
                    self.state = "text"
                continue

            if self.state == "charset":
                self.state = "text"
                continue

            if self.state == "osc":
                if char == "\a":
                    self.state = "text"
                elif char == "\x1b":
                    self.state = "osc_escape"
                continue

            if self.state == "osc_escape":
                self.state = "text" if char == "\\" else "osc"
                continue

            if self.state == "csi":
                self.control += char
                if CSI_FINAL.fullmatch(char):
                    self._csi(self.control[:-1], char)
                    self.control = ""
                    self.state = "text"

    def _text(self, char: str) -> None:
        if char == "\r":
            self.column = 0
            return
        if char == "\n":
            self.row = min(self.rows - 1, self.row + 1)
            return
        if char == "\b":
            self.column = max(0, self.column - 1)
            return
        if char == "\t":
            self.column = min(self.columns - 1, ((self.column // 8) + 1) * 8)
            return
        if ord(char) < 32 or char == "\x7f":
            return

        width = cell_width(char)
        if width == 0:
            if self.column > 0:
                self.chars[self.row][self.column - 1] += char
            return
        if self.row < self.rows and self.column < self.columns:
            self.chars[self.row][self.column] = char
            self.styles[self.row][self.column] = self.style
            if width == 2 and self.column + 1 < self.columns:
                self.chars[self.row][self.column + 1] = " "
                self.styles[self.row][self.column + 1] = self.style
        self.column = min(self.columns, self.column + width)

    @staticmethod
    def _numbers(parameters: str, default: int = 1) -> list[int]:
        clean = parameters.lstrip("?<=>")
        if clean == "":
            return [default]
        result = []
        for part in clean.split(";"):
            try:
                result.append(int(part) if part else default)
            except ValueError:
                result.append(default)
        return result

    def _csi(self, parameters: str, command: str) -> None:
        values = self._numbers(parameters)
        amount = values[0]
        if command in {"H", "f"}:
            row = values[0] if values else 1
            column = values[1] if len(values) > 1 else 1
            self.row = max(0, min(self.rows - 1, row - 1))
            self.column = max(0, min(self.columns, column - 1))
        elif command == "A":
            self.row = max(0, self.row - amount)
        elif command in {"B", "e"}:
            self.row = min(self.rows - 1, self.row + amount)
        elif command in {"C", "a"}:
            self.column = min(self.columns, self.column + amount)
        elif command == "D":
            self.column = max(0, self.column - amount)
        elif command == "E":
            self.row = min(self.rows - 1, self.row + amount)
            self.column = 0
        elif command == "F":
            self.row = max(0, self.row - amount)
            self.column = 0
        elif command in {"G", "`"}:
            self.column = max(0, min(self.columns, amount - 1))
        elif command == "d":
            self.row = max(0, min(self.rows - 1, amount - 1))
        elif command == "J":
            self._erase_display(amount)
        elif command == "K":
            self._erase_line(amount)
        elif command == "m":
            self._sgr(self._numbers(parameters, default=0))
        elif command == "s":
            self.saved_row, self.saved_column = self.row, self.column
        elif command == "u":
            self.row, self.column = self.saved_row, self.saved_column
        elif command in {"h", "l"} and "1049" in parameters:
            if command == "h":
                self.clear()

    def _erase_display(self, mode: int) -> None:
        if mode in {2, 3}:
            self.clear()
            return
        if mode == 0:
            self._erase_line(0)
            for row in range(self.row + 1, self.rows):
                self._clear_range(row, 0, self.columns)
        elif mode == 1:
            for row in range(0, self.row):
                self._clear_range(row, 0, self.columns)
            self._erase_line(1)

    def _erase_line(self, mode: int) -> None:
        if mode == 0:
            self._clear_range(self.row, self.column, self.columns)
        elif mode == 1:
            self._clear_range(self.row, 0, min(self.columns, self.column + 1))
        elif mode == 2:
            self._clear_range(self.row, 0, self.columns)

    def _clear_range(self, row: int, start: int, end: int) -> None:
        for column in range(max(0, start), min(self.columns, end)):
            self.chars[row][column] = " "
            self.styles[row][column] = self.style

    def _sgr(self, values: list[int]) -> None:
        bold, dim, underline, reverse, foreground, background = self.style
        index = 0
        while index < len(values):
            value = values[index]
            if value == 0:
                bold, dim, underline, reverse, foreground, background = self.default_style()
            elif value == 1:
                bold = True
            elif value == 2:
                dim = True
            elif value == 4:
                underline = True
            elif value == 7:
                reverse = True
            elif value == 22:
                bold, dim = False, False
            elif value == 24:
                underline = False
            elif value == 27:
                reverse = False
            elif 30 <= value <= 37 or 90 <= value <= 97:
                foreground = ("ansi", value)
            elif value == 39:
                foreground = None
            elif 40 <= value <= 47 or 100 <= value <= 107:
                background = ("ansi", value)
            elif value == 49:
                background = None
            elif value in {38, 48} and index + 1 < len(values):
                target_foreground = value == 38
                mode = values[index + 1]
                if mode == 2 and index + 4 < len(values):
                    color = ("rgb", values[index + 2], values[index + 3], values[index + 4])
                    index += 4
                elif mode == 5 and index + 2 < len(values):
                    color = ("index", values[index + 2])
                    index += 2
                else:
                    color = None
                    index += 1
                if target_foreground:
                    foreground = color
                else:
                    background = color
            index += 1
        self.style = (bold, dim, underline, reverse, foreground, background)


def parse_sizes(value: str) -> list[tuple[int, int]]:
    sizes = []
    for item in value.split(","):
        match = re.fullmatch(r"\s*(\d+)x(\d+)\s*", item)
        if not match:
            raise argparse.ArgumentTypeError(f"invalid viewport {item!r}; use COLSxROWS")
        columns, rows = int(match.group(1)), int(match.group(2))
        if columns < 20 or rows < 8:
            raise argparse.ArgumentTypeError("viewports must be at least 20x8")
        sizes.append((columns, rows))
    return sizes


def decode_keys(value: str) -> bytes:
    decoded = codecs.decode(value, "unicode_escape")
    return decoded.encode("utf-8")


def read_for(master: int, duration: float, process: subprocess.Popen[bytes]) -> bytes:
    deadline = time.monotonic() + duration
    chunks = []
    total = 0
    while time.monotonic() < deadline:
        timeout = min(0.05, max(0.0, deadline - time.monotonic()))
        ready, _, _ = select.select([master], [], [], timeout)
        if not ready:
            if process.poll() is not None:
                break
            continue
        try:
            chunk = os.read(master, 65536)
        except OSError:
            break
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > 8 * 1024 * 1024:
            break
    return b"".join(chunks)


def write_snapshot(path: Path, screen: VirtualScreen) -> None:
    lines = ["".join(row).rstrip() for row in screen.chars]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def occupancy(snapshot: tuple[tuple[tuple[str, tuple[object, ...]], ...], ...]) -> tuple[int, int, int]:
    used = [
        row_index
        for row_index, row in enumerate(snapshot)
        if any(character.strip() for character, _ in row)
    ]
    if not used:
        return 0, 0, 0
    return len(used), used[0] + 1, used[-1] + 1


def difference(before: tuple, after: tuple) -> tuple[int, int]:
    character_changes = 0
    style_changes = 0
    for old_row, new_row in zip(before, after):
        for (old_char, old_style), (new_char, new_style) in zip(old_row, new_row):
            if old_char != new_char:
                character_changes += 1
            if old_style != new_style:
                style_changes += 1
    return character_changes, style_changes


def boundary_issues(snapshot: tuple) -> list[dict[str, object]]:
    """Find strong evidence that framed content was clipped horizontally."""
    issues: list[dict[str, object]] = []
    for row_index, row in enumerate(snapshot):
        text = "".join(character for character, _ in row)
        # Long rules distinguish application frames from decorative box-drawing
        # text such as logos and icons.
        if re.search(r"[─━═]{3,}", text):
            for left, right in BORDER_CORNER_PAIRS:
                left_count = text.count(left)
                right_count = text.count(right)
                if left_count != right_count:
                    issues.append(
                        {
                            "code": "unbalanced-border-corners",
                            "severity": "warning",
                            "row": row_index + 1,
                            "message": (
                                f"row {row_index + 1} has {left_count} {left} corner(s) "
                                f"but {right_count} {right} corner(s)"
                            ),
                        }
                    )

        first = text[:1]
        last = text[-1:]
        if first in HORIZONTAL_BORDER_CHARS:
            issues.append(
                {
                    "code": "border-crosses-left-edge",
                    "severity": "error",
                    "row": row_index + 1,
                    "message": f"row {row_index + 1} has a horizontal border cut by the left edge",
                }
            )
        if last in HORIZONTAL_BORDER_CHARS:
            issues.append(
                {
                    "code": "border-crosses-right-edge",
                    "severity": "error",
                    "row": row_index + 1,
                    "message": f"row {row_index + 1} has a horizontal border cut by the right edge",
                }
            )

        if row_index == len(snapshot) - 1:
            if any(character in text for character in "┌╔"):
                issues.append(
                    {
                        "code": "frame-starts-at-bottom-edge",
                        "severity": "error",
                        "row": row_index + 1,
                        "message": "a framed region starts on the last viewport row and is clipped below it",
                    }
                )
            if any(character in text for character in "│║"):
                issues.append(
                    {
                        "code": "frame-crosses-bottom-edge",
                        "severity": "error",
                        "row": row_index + 1,
                        "message": "a vertical frame reaches the last viewport row without a bottom border",
                    }
                )
    return issues


def stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=0.5)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            pass


def capture(
    command: list[str],
    columns: int,
    rows: int,
    settle: float,
    after_input: float,
    inputs: list[bytes],
    output_dir: Path,
    allow_no_change_steps: set[int],
    allow_low_viewport_use: bool,
) -> dict[str, object]:
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
    process = subprocess.Popen(
        command,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
        start_new_session=True,
    )
    os.close(slave)
    screen = VirtualScreen(columns, rows)
    decoder = codecs.getincrementaldecoder("utf-8")("replace")
    raw = bytearray()
    frame_results: list[dict[str, object]] = []

    try:
        chunk = read_for(master, settle, process)
        raw.extend(chunk)
        screen.feed(decoder.decode(chunk))
        frames = [screen.snapshot()]

        for keys in inputs:
            if process.poll() is not None:
                break
            os.write(master, keys)
            chunk = read_for(master, after_input, process)
            raw.extend(chunk)
            screen.feed(decoder.decode(chunk))
            frames.append(screen.snapshot())

        previous = None
        for step, frame in enumerate(frames):
            name = f"{columns}x{rows}-step{step}.txt"
            if step == len(frames) - 1:
                write_snapshot(output_dir / name, screen)
            else:
                restored = VirtualScreen(columns, rows)
                for row_index, row in enumerate(frame):
                    for column_index, (character, style) in enumerate(row):
                        restored.chars[row_index][column_index] = character
                        restored.styles[row_index][column_index] = style
                write_snapshot(output_dir / name, restored)

            used_rows, first_row, last_row = occupancy(frame)
            issues = boundary_issues(frame)
            metrics: dict[str, object] = {
                "nonblank_rows": used_rows,
                "total_rows": rows,
                "first_nonblank_row": first_row,
                "last_nonblank_row": last_row,
                "character_delta": None,
                "style_delta": None,
            }
            report = f"step {step}: nonblank rows {used_rows}/{rows}, span {first_row}-{last_row}"
            if previous is not None:
                character_changes, style_changes = difference(previous, frame)
                metrics["character_delta"] = character_changes
                metrics["style_delta"] = style_changes
                report += f", delta {character_changes} chars + {style_changes} styles"
                if character_changes == 0 and style_changes == 0:
                    report += " [NO VISIBLE CHANGE]"
                    if step not in allow_no_change_steps:
                        issues.append(
                            {
                                "code": "no-visible-change",
                                "severity": "error",
                                "message": f"input step {step} produced no character or style change",
                            }
                        )
            if rows >= 20 and last_row > 0 and last_row <= rows // 2:
                report += " [LOW VIEWPORT USE]"
                if not allow_low_viewport_use:
                    issues.append(
                        {
                            "code": "low-viewport-use",
                            "severity": "error",
                            "message": (
                                f"content ends on row {last_row} in a {rows}-row viewport; "
                                "the lower half is unused"
                            ),
                        }
                    )
            errors = [issue for issue in issues if issue["severity"] == "error"]
            warnings = [issue for issue in issues if issue["severity"] == "warning"]
            if errors:
                report += f" [FAILED: {', '.join(str(issue['code']) for issue in errors)}]"
            if warnings:
                report += f" [WARNING: {', '.join(str(issue['code']) for issue in warnings)}]"
            frame_results.append(
                {
                    "viewport": f"{columns}x{rows}",
                    "step": step,
                    "snapshot": name,
                    "captured": True,
                    "metrics": metrics,
                    "issues": issues,
                    "passed": not errors,
                    "report": report,
                }
            )
            previous = frame

        for step in range(len(frames), len(inputs) + 1):
            name = f"{columns}x{rows}-step{step}.txt"
            issue = {
                "code": "missing-interaction-capture",
                "severity": "error",
                "message": f"process exited before input step {step} could be captured",
            }
            frame_results.append(
                {
                    "viewport": f"{columns}x{rows}",
                    "step": step,
                    "snapshot": name,
                    "captured": False,
                    "metrics": None,
                    "issues": [issue],
                    "passed": False,
                    "report": f"step {step}: [MISSING CAPTURE]",
                }
            )

        (output_dir / f"{columns}x{rows}.ansi").write_bytes(bytes(raw))
        return {
            "viewport": f"{columns}x{rows}",
            "columns": columns,
            "rows": rows,
            "process_exit_code": process.poll(),
            "frames": frame_results,
            "passed": all(bool(frame["passed"]) for frame in frame_results),
        }
    finally:
        stop_process(process)
        os.close(master)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run a TUI in real PTYs and save inspectable viewport snapshots."
    )
    parser.add_argument("--sizes", type=parse_sizes, default=parse_sizes(DEFAULT_SIZES))
    parser.add_argument("--settle", type=float, default=1.2, help="seconds before initial capture")
    parser.add_argument(
        "--after-input", type=float, default=0.25, help="seconds to capture after each --send"
    )
    parser.add_argument(
        "--send",
        action="append",
        default=[],
        help=r"input step applied at every size; C escapes such as \t and \x1b are supported",
    )
    parser.add_argument(
        "--allow-no-change-step",
        action="append",
        type=int,
        default=[],
        metavar="N",
        help="allow 1-based input step N to leave no visible evidence; repeat as needed",
    )
    parser.add_argument(
        "--allow-low-viewport-use",
        action="store_true",
        help="allow a full-screen app to leave the lower half of a 20+ row viewport unused",
    )
    parser.add_argument("--output-dir", default=".sharptui-verification")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()

    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("missing command after --")
    if args.settle <= 0 or args.after_input <= 0:
        parser.error("capture delays must be positive")

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    inputs = [decode_keys(value) for value in args.send]
    allow_no_change_steps = set(args.allow_no_change_step)
    invalid_steps = sorted(step for step in allow_no_change_steps if step < 1 or step > len(inputs))
    if invalid_steps:
        parser.error(
            "--allow-no-change-step values must identify a supplied --send step; invalid: "
            + ", ".join(str(step) for step in invalid_steps)
        )

    print(f"command: {' '.join(command)}")
    print(f"snapshots: {output_dir}")
    runs = []
    for columns, rows in args.sizes:
        run = capture(
            command,
            columns,
            rows,
            args.settle,
            args.after_input,
            inputs,
            output_dir,
            allow_no_change_steps,
            args.allow_low_viewport_use,
        )
        runs.append(run)
        exit_code = run["process_exit_code"]
        state = "running at capture" if exit_code is None else f"exited {exit_code}"
        print(f"\n{columns}x{rows} ({state})")
        for frame in run["frames"]:
            print(f"  {frame['report']}")

    frames = [frame for run in runs for frame in run["frames"]]
    failed_frames = [frame for frame in frames if not frame["passed"]]
    expected_frames = len(args.sizes) * (len(inputs) + 1)
    captured_frames = sum(1 for frame in frames if frame["captured"])
    manifest = {
        "schema_version": 1,
        "command": command,
        "requested_viewports": [f"{columns}x{rows}" for columns, rows in args.sizes],
        "input_steps": [
            {"step": index, "send": value, "visible_change_required": index not in allow_no_change_steps}
            for index, value in enumerate(args.send, start=1)
        ],
        "options": {
            "settle_seconds": args.settle,
            "after_input_seconds": args.after_input,
            "allow_low_viewport_use": args.allow_low_viewport_use,
        },
        "runs": runs,
        "summary": {
            "passed": not failed_frames and captured_frames == expected_frames,
            "requested_frames": expected_frames,
            "captured_frames": captured_frames,
            "failed_frames": len(failed_frames),
        },
    }
    manifest_path = output_dir / "verification.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    summary = manifest["summary"]
    verdict = "PASS" if summary["passed"] else "FAIL"
    print(
        f"\n{verdict}: {summary['captured_frames']}/{summary['requested_frames']} captures, "
        f"{summary['failed_frames']} failed frame(s). Manifest: {manifest_path}"
    )
    print("Inspect every captured .txt snapshot before claiming responsive or interactive behavior.")
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
