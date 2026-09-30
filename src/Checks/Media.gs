package SharpTui

import System
import System.Diagnostics
import System.IO
import System.Text
import System.Threading

internal class MediaCheck {
    shared {
        internal func Run() int32 {
            var failed = 0
            let rgba = []uint8{255, 0, 0, 255, 0, 0, 255, 255}
            let source = ImageSource.FromRgba(1, 2, rgba)
            rgba[0] = 0
            let screen = Screen(8, 4)
            let bounds = CellRect{WidthCells: 8, HeightRows: 4}
            let output = TerminalBuffer(4096)
            let icon = ImageSource.FromRgba(1, 1, []uint8{255, 190, 40, 255})
            let placement = ImageRaster.Layout(icon, CellRect{WidthCells: 4, HeightRows: 3}, ImageFit.Contain, PixelSize{Width: 10, Height: 21})
            failed += Checks.Expect(placement.Target.WidthCells == 4 && placement.Target.HeightRows == 2, "small square icons use the closest cell aspect ratio")
            var resolved = 0
            let markdown = MarkdownView{
                Source: "![icon](visible)\n\n![icon](offscreen)",
                InlineImages: url -> {
                    if url != "visible" { throw InvalidOperationException("offscreen inline image was resolved") }
                    resolved++
                    return source
                }
            }
            markdown.Draw(screen, CellRect{WidthCells: 8, HeightRows: 8}, CellRect{WidthCells: 8, HeightRows: 1})
            markdown.Draw(screen, CellRect{Row: 20, WidthCells: 8, HeightRows: 8}, CellRect{WidthCells: 8, HeightRows: 1})
            failed += Checks.Expect(resolved == 1, "inline markdown resolves only visible clipped spans")
            screen.Clear()
            screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
            failed += Checks.Expect(
                screen.Probe(0, 0) == "▀" && source.Pixels[0] == uint8(255),
                "fallback draws owned image pixels as colored half blocks"
            )
            screen.Emit(output)
            for mode in[]GraphicsProtocol{GraphicsProtocol.Kitty, GraphicsProtocol.Sixel} {
                screen.Graphics = mode
                screen.Clear()
                screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
                screen.Emit(output)
                let first = output.Text()
                failed += Checks.Expect(
                    mode == GraphicsProtocol.Kitty ? first.Contains("a=t") && first.Contains("a=p")
                    : first.Contains("\x1bP0;1q"),
                    "image is emitted through the selected native backend"
                )
                screen.Clear()
                screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
                failed += Checks.Expect(screen.Emit(output) == 0, "unchanged native image does not emit another frame")
                screen.Clear()
                screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
                screen.Fill(CellRect{Column: 2, Row: 1, WidthCells: 3, HeightRows: 2}, Style{})
                screen.WriteCell(2, 1, "X")
                screen.Emit(output)
                failed += Checks.Expect(
                    output.Count() > 0 && screen.Probe(2, 1) == "X",
                    "overlay covers native image cells and retains its text"
                )
                screen.Clear()
                screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
                failed += Checks.Expect(screen.Emit(output) > 0, "closing an overlay restores the clipped image")
                screen.Clear()
                screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
                screen.Fill(bounds, Style{})
                screen.Emit(output)
                failed += Checks.Expect(
                    mode != GraphicsProtocol.Kitty || !output.Text().Contains("d=I"),
                    "a fully covered image keeps its bounded upload cache"
                )
                screen.Clear()
                screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
                screen.Emit(output)
                failed += Checks.Expect(
                    mode != GraphicsProtocol.Kitty || output.Text().Contains("a=p") && !output.Text().Contains("a=t"),
                    "a fully uncovered image restores its raster and placements"
                )
                source.Update(rgba)
                screen.Clear()
                screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
                failed += Checks.Expect(
                    screen.Emit(output) > 0,
                    "replacement video frame invalidates the native raster"
                )
                screen.Clear()
                screen.Emit(output)
                failed += Checks.Expect(
                    mode == GraphicsProtocol.Kitty ? output.Text().Contains("d=i") && !output.Text().Contains("d=I")
                    : output.Text().Contains("\x1b[2J"),
                    "scrolling an image away clears placements while retaining bounded uploads"
                )
                screen.Clear()
                screen.DrawImage(source, bounds, bounds, ImageFit.Stretch)
                screen.Emit(output)
                failed += Checks.Expect(
                    mode != GraphicsProtocol.Kitty || !output.Text().Contains("a=t"),
                    "scrolling back reuses the uploaded image"
                )
                screen.ReleaseGraphics(output)
                failed += Checks.Expect(
                    mode != GraphicsProtocol.Kitty || output.Text().Contains("d=I"),
                    "terminal exit releases retained image data"
                )
            }

            let negotiation = TerminalNegotiation()
            let input = Input(AutoResetEvent(false))
            negotiation.Begin(false, true)
            let replies = Encoding.ASCII.GetBytes("\x1b[?1;2;4c\x1b[6;18;9t\x1b_Gi=31;OK\x1b\\x")
            for byte in replies {
                negotiation.Feed(input, []uint8{byte}, 0, 1)
            }
            negotiation.Expire()
            negotiation.ExpireGraphics()
            negotiation.Drain(input)
            var ev UiEvent
            failed += Checks.Expect(
                negotiation.Graphics == GraphicsProtocol.Kitty
                && negotiation.CellPixels.Width == 9 && negotiation.CellPixels.Height == 18
                && input.TryDequeue(out ev) && ev.Text == "x" && !input.TryDequeue(out ev),
                "fragmented graphics reports are consumed without entering the text input"
            )
            return failed
        }

        internal func Bench() int32 {
            let bytes = [64 * 48 * 4]uint8
            for i in 0 ... bytes.Length {
                bytes[i] = uint8(i & 255)
            }
            let image = ImageSource.FromRgba(64, 48, bytes)
            let bounds = CellRect{WidthCells: 40, HeightRows: 12}
            for mode in[]GraphicsProtocol{GraphicsProtocol.HalfBlock, GraphicsProtocol.Kitty, GraphicsProtocol.Sixel} {
                let screen = Screen(80, 24)
                screen.Graphics = mode
                let output = TerminalBuffer(1048576)
                for warm in 0 ... 64 {
                    image.Update(bytes)
                    screen.Clear()
                    screen.DrawImage(image, bounds, bounds, ImageFit.Stretch)
                    screen.Emit(output)
                }
                for changing in[]bool{false, true} {
                    let watch = Stopwatch()
                    let before = GC.GetAllocatedBytesForCurrentThread()
                    let gen0 = GC.CollectionCount(0)
                    watch.Start()
                    var emitted int64
                    for frame in 0 ... 100 {
                        if changing {
                            for pixel in 0 ... bytes.Length / 4 {
                                bytes[pixel * 4] = uint8(frame * 2)
                            }
                            image.Update(bytes)
                        }
                        screen.Clear()
                        screen.DrawImage(image, bounds, bounds, ImageFit.Stretch)
                        emitted += screen.Emit(output)
                    }
                    watch.Stop()
                    let allocated = GC.GetAllocatedBytesForCurrentThread() - before
                    Console.WriteLine(
                        mode.ToString() + (changing ? " changing": " clean") + ": "
                        + (watch.Elapsed.TotalMilliseconds * 10.0).ToString("F1") + " us/op, "
                        + (allocated / 100).ToString() + " B/op, gen0 " + (GC.CollectionCount(0) - gen0).ToString()
                        + ", bytes/op " + (emitted / 100).ToString()
                    )
                }
            }
            return 0
        }

        internal func Dump(path string) int32 {
            let source = ImageSource.FromRgba(
                2,
                2,
                []uint8{255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255}
            )
            for mode in[]GraphicsProtocol{GraphicsProtocol.Kitty, GraphicsProtocol.Sixel} {
                let screen = Screen(20, 10)
                screen.Graphics = mode
                let output = TerminalBuffer(65536)
                let rect = CellRect{Column: 2, Row: 2, WidthCells: 12, HeightRows: 6}
                screen.DrawImage(source, rect, rect, ImageFit.Stretch)
                screen.Fill(CellRect{Column: 6, Row: 4, WidthCells: 4, HeightRows: 2}, Style{})
                screen.Write(6, 4, "TEST")
                screen.Emit(output)
                using let stream = File.Create(Path.Combine(path, mode.ToString() + ".ansi"))
                output.WriteTo(stream)
            }
            return 0
        }

        internal func Play(path string) int32 {
            var failed = 0
            using let player = MediaPlayer(path)
            guard let source = player.Source else {
                return 1
            }
            using let timer = tick(TimeSpan.FromMilliseconds(40.0))
            let watch = Stopwatch.StartNew()
            var frames = 0
            while watch.Elapsed < TimeSpan.FromMilliseconds(800.0) {
                select {
                    case <- timer { }
                }
                if player.Advance() {
                    frames++
                }
            }
            failed += Checks.Expect(frames > 2, "FFmpeg publishes live video frames through the bounded worker")
            let version = source.Version
            let before = GC.GetAllocatedBytesForCurrentThread()
            for i in 0 ... 1000 {
                player.Advance()
            }
            let allocated = GC.GetAllocatedBytesForCurrentThread() - before
            failed += Checks.Expect(allocated == 0, "polling the media worker allocates no UI-thread memory")
            player.Pause()
            let position = player.Position
            select {
                case <- timer { }
            }
            failed += Checks.Expect(
                !player.Advance() && player.Position == position && !player.IsPlaying,
                "pausing stops decoding and holds the current position"
            )
            player.Seek(TimeSpan.FromMilliseconds(500.0))
            player.Resume()
            while watch.Elapsed < TimeSpan.FromMilliseconds(1400.0) {
                select {
                    case <- timer { }
                }
                player.Advance()
            }
            failed += Checks.Expect(
                source.Version > version && player.Position > TimeSpan.FromMilliseconds(500.0),
                "seeking restarts playback and publishes a later frame"
            )
            player.Dispose()
            failed += Checks.Expect(!player.IsPlaying && !player.Advance(), "media teardown stops frame delivery")
            if failed == 0 {
                Console.WriteLine("media playback: ok")
            }
            return failed
        }
    }
}
