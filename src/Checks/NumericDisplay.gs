package SharpTui

import System
import System.Collections.Generic

internal class NumericDisplayCheck {
    shared {
        internal func Run() int32 {
            var failed = 0
            let samples = List[string]{"-12.5%", "+90", "08:49", " 367"}
            for text in samples {
                failed = failed + numericRows(text, 1, List[string]{text})
            }
            failed = failed +
                numericRows(
                "-12.5%",
                3,
                List[string]{"    ▄█  ▀▀█   █▀▀ ▀ █", "▀▀▀  █  █▀▀   ▀▀█ ▄▀ ", "    ▀▀▀ ▀▀▀ ▀ ▀▀▀ ▀ ▀",}
            )
            failed = failed + numericRows("+90", 3, List[string]{" ▄  █▀█ █▀█", "▀█▀ ▀▀█ █ █", "    ▀▀▀ ▀▀▀",})
            failed = failed +
                numericRows("08:49", 3, List[string]{"█▀█ █▀█ ▄ █ █ █▀█", "█ █ █▀█ ▄ ▀▀█ ▀▀█", "▀▀▀ ▀▀▀     ▀ ▀▀▀",})
            failed = failed +
                numericRows(" 367", 3, List[string]{"    ▀▀█ █▀▀ ▀▀█", "    ▀▀█ █▀█   █", "    ▀▀▀ ▀▀▀   ▀",})
            failed = failed +
                numericRows(
                "-12.5%",
                5,
                List[string]{
                    "         ██   ██████    ██████ ██  ██",
                    "       ████       ██    ██         ██",
                    "██████   ██   ██████    ██████   ██  ",
                    "         ██   ██            ██ ██    ",
                    "       ██████ ██████ ██ ██████ ██  ██",
                }
            )
            failed = failed +
                numericRows(
                "+90",
                5,
                List[string]{
                    "       ██████ ██████",
                    "  ██   ██  ██ ██  ██",
                    "██████ ██████ ██  ██",
                    "  ██       ██ ██  ██",
                    "       ██████ ██████",
                }
            )
            failed = failed +
                numericRows(
                "08:49",
                5,
                List[string]{
                    "██████ ██████    ██  ██ ██████",
                    "██  ██ ██  ██ ██ ██  ██ ██  ██",
                    "██  ██ ██████    ██████ ██████",
                    "██  ██ ██  ██ ██     ██     ██",
                    "██████ ██████        ██ ██████",
                }
            )
            failed = failed +
                numericRows(
                " 367",
                5,
                List[string]{
                    "       ██████ ██████ ██████",
                    "           ██ ██         ██",
                    "       ██████ ██████     ██",
                    "           ██ ██  ██     ██",
                    "       ██████ ██████     ██",
                }
            )

            let largeHeights = List[int32]{3, 5}
            for height in largeHeights {
                let display = NumericDisplay{Text: "-12.5%", PreferredHeight: height}
                let width = height == 3 ? 21: 37
                let narrow = Screen(width - 1, height)
                display.Draw(narrow)
                failed = failed + Checks.Expect(
                    narrow.Probe(0, 0) == "-" && narrow.Probe(5, 0) == "%"
                    && narrow.Probe(0, height - 1) == " ",
                    "NumericDisplay falls back as a whole when glyph width cannot fit"
                )
                let short = Screen(width, height - 1)
                display.Draw(short)
                failed = failed + Checks.Expect(
                    short.Probe(0, 0) == "-" && short.Probe(5, 0) == "%"
                    && short.Probe(0, 1) == " ",
                    "NumericDisplay falls back as a whole when glyph height cannot fit"
                )
                display.Text = "1日本é2"
                let plain = Screen(8, height)
                display.Draw(plain)
                failed = failed + Checks.Expect(
                    plain.Probe(0, 0) == "1" && plain.Probe(1, 0) == "日"
                    && plain.Probe(3, 0) == "本" && plain.Probe(5, 0) == "é" && plain.Probe(6, 0) == "2"
                    && plain.Probe(0, 1) == " ",
                    "NumericDisplay unsupported text preserves wide and combining graphemes"
                )
                display.Text = "1日2"
                let clipped = Screen(2, height)
                display.Draw(clipped)
                failed = failed + Checks.Expect(
                    clipped.Probe(0, 0) == "1" && clipped.Probe(1, 0) == " ",
                    "NumericDisplay plain fallback does not split a wide grapheme"
                )
            }

            let heights = List[int32]{1, 3, 5}
            let alignments = List[HorizontalAlignment]{
                HorizontalAlignment.Left,
                HorizontalAlignment.Center,
                HorizontalAlignment.Right
            }
            for height in heights {
                for alignment in alignments {
                    let display = NumericDisplay{Text: "0", PreferredHeight: height, Alignment: alignment}
                    let screen = Screen(9, height)
                    display.Draw(screen)
                    let width = height == 1 ? 1: height == 3 ? 3: 6
                    let offset = alignment == HorizontalAlignment.Left ? 0: alignment == HorizontalAlignment.Center ? (
                        9 - width
                    ) / 2: 9 - width
                    let column = offset
                    failed = failed + Checks.Expect(
                        screen.Probe(column, 0) == (height == 1 ? "0": "█"),
                        "NumericDisplay aligns the complete glyph form"
                    )
                    screen.ColorMode = TerminalColorMode.NoColor
                    display.Style = Style{
                        Foreground: Color.Rgb("D1A047"),
                        Background: Color.Indexed(42),
                        Attributes: TextAttributes.Bold
                    }
                    display.Draw(screen)
                    let wire = screen.Flush()
                    failed = failed + Checks.Expect(
                        wire.Contains("[1m") && !wire.Contains("38;") && !wire.Contains("48;")
                        && screen.Probe(column, 0) != " ",
                        "NumericDisplay remains visible without color"
                    )
                    let output = TerminalBuffer(1024)
                    for i in 0 ... 32 {
                        display.Draw(screen)
                        screen.Invalidate()
                        screen.Emit(output)
                    }
                    var frame = 0
                    let before = GC.GetAllocatedBytesForCurrentThread()
                    while frame < 64 {
                        display.Draw(screen)
                        screen.Invalidate()
                        screen.Emit(output)
                        frame = frame + 1
                    }
                    failed = failed + Checks.Expect(
                        GC.GetAllocatedBytesForCurrentThread() == before,
                        "NumericDisplay warmed paint and output allocate zero bytes"
                    )
                }
            }

            let intrinsic = NumericDisplay{Text: "12", PreferredHeight: 5}
            let layout = Column{Children: {intrinsic}}
            layout.Compute(20, 10)
            failed = failed + Checks.Expect(
                intrinsic.Bounds.HeightRows == 5,
                "NumericDisplay measures its preferred glyph height"
            )
            intrinsic.Text = "12x"
            layout.Compute(20, 10)
            failed = failed + Checks.Expect(
                intrinsic.Bounds.HeightRows == 1,
                "NumericDisplay text mutation invalidates intrinsic height"
            )
            intrinsic.Text = "12"
            intrinsic.PreferredHeight = 3
            layout.Compute(20, 10)
            failed = failed + Checks.Expect(
                intrinsic.Bounds.HeightRows == 3,
                "NumericDisplay height mutation invalidates intrinsic height"
            )
            layout.Compute(6, 10)
            failed = failed + Checks.Expect(
                intrinsic.Bounds.HeightRows == 1,
                "NumericDisplay narrow intrinsic layout reserves only one fallback row"
            )
            return failed
        }
    }
}

private func numericRows(text string, height int32, rows List[string]) int32 {
    let display = NumericDisplay{Text: text, PreferredHeight: height}
    let screen = Screen(rows[0].Length, height)
    display.Draw(screen)
    return Checks.Expect(
        screen.FrameText() == string.Join("\n", rows),
        "NumericDisplay renders " + text + " at " + height.ToString() + " rows"
    )
}
