package SharpTui

import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Text
import System.Text.Json
import System.Threading

/// Plays local video, animated images and audio using FFmpeg and mpv. Dispose closes owned processes.
public class MediaPlayer : IDisposable {
    private var path string
    private var source ImageSource?
    private var previewPending bool
    internal prop WantsFrame bool -> !disposed && (playing || previewPending)
    private var duration TimeSpan
    private var anchor TimeSpan
    private var clock Stopwatch
    private var playback VideoPlayback?
    private var buffers[][]uint8
    private var audio Process?
    private var hasAudio bool
    private var playing bool
    private var disposed bool
    private var loop bool

    /// The current video raster, or nil for an audio-only file. Advance updates it on the UI thread.
    public prop Source ImageSource? -> source
    /// The duration reported by the media container. Zero means unknown.
    public prop Duration TimeSpan -> duration
    /// The current playback position.
    public prop Position TimeSpan {
        get {
            let position = anchor + clock.Elapsed
            if loop && duration > TimeSpan.Zero {
                return TimeSpan.FromTicks(position.Ticks % duration.Ticks)
            }
            return duration > TimeSpan.Zero && position > duration ? duration: position
        }
    }
    /// Whether playback is active.
    public prop IsPlaying bool -> playing && !disposed

    /// Opens a local file and starts playback with a video raster bounded to 640 by 360 pixels at 15 FPS.
    /// @param path The local media file. FFmpeg, ffprobe and mpv for audio must be installed.
    public init(path string) {
        initialize(path, PixelSize{Width: 640, Height: 360})
    }

    /// Opens a local file with an explicit maximum video raster, up to 2048 by 2048 pixels.
    /// @param path The local media file.
    /// @param maxSize The positive pixel limits for the video decoder.
    public init(path string, maxSize PixelSize) {
        initialize(path, maxSize)
    }

    /// Opens local media with bounded decoding and optional continuous looping.
    /// @param path The local media file.
    /// @param maxSize Positive pixel limits up to 2048 by 2048.
    /// @param loop Whether the decoder repeats the file without restarting a process.
    public init(path string, maxSize PixelSize, loop bool) {
        this.loop = loop
        initialize(path, maxSize)
    }

    private func initialize(path string, maxSize PixelSize) {
        if maxSize.Width <= 0 || maxSize.Height <= 0 || maxSize.Width > 2048 || maxSize.Height > 2048 {
            throw ArgumentOutOfRangeException("maxSize")
        }
        this.path = Path.GetFullPath(path)
        if !File.Exists(this.path) {
            throw FileNotFoundException("Media file not found", this.path)
        }
        clock = Stopwatch()
        let probe = ProcessStartInfo("ffprobe")
        probe.ArgumentList.Add("-v")
        probe.ArgumentList.Add("quiet")
        probe.ArgumentList.Add("-show_entries")
        probe.ArgumentList.Add("stream=codec_type,width,height:format=duration")
        probe.ArgumentList.Add("-of")
        probe.ArgumentList.Add("json")
        probe.ArgumentList.Add(this.path)
        probe.UseShellExecute = false
        probe.RedirectStandardOutput = true
        probe.RedirectStandardError = false
        using let process = Process.Start(probe) ?? throw InvalidOperationException("Could not start ffprobe")
        let output = MediaProbe(process.StandardOutput.BaseStream)
        if !process.WaitForExit(10000) {
            process.Kill(true)
            process.WaitForExit()
        }
        let metadata = ChannelOps.Receive[string](output.Result, CancellationToken.None)
        if output.Error != "" {
            throw InvalidDataException(output.Error)
        }
        if process.ExitCode != 0 {
            throw InvalidDataException("Could not inspect media file")
        }
        using let document = JsonDocument.Parse(metadata)
        let root = document.RootElement
        for stream in root.GetProperty("streams").EnumerateArray() {
            let kind = stream.GetProperty("codec_type").GetString()
            if kind == "audio" {
                hasAudio = true
            }
            if kind != "video" || source != nil {
                continue
            }
            let width = stream.GetProperty("width").GetInt32()
            let height = stream.GetProperty("height").GetInt32()
            if width <= 0 || height <= 0 {
                continue
            }
            let scale = Math.Min(
                1.0,
                Math.Min(float64(maxSize.Width) / float64(width), float64(maxSize.Height) / float64(height))
            )
            let w = Math.Max(1, int32(float64(width) * scale))
            let h = Math.Max(1, int32(float64(height) * scale))
            source = ImageSource.FromRgba(w, h, [w * h * 4]uint8)
        }
        var format JsonElement
        var length JsonElement
        var seconds float64
        if root.TryGetProperty("format", out format) && format.TryGetProperty("duration", out length)
        && Double.TryParse(length.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out seconds)
        && seconds >= 0.0 && seconds < 31536000.0 {
            duration = TimeSpan.FromSeconds(seconds)
        }
        if source == nil && !hasAudio {
            throw InvalidDataException("Media contains no audio or video")
        }
        try {
            Resume()
        } catch (error Exception) {
            Dispose()
            throw error
        }
    }

    /// Publishes the newest complete video frame without blocking or allocating. Call on the UI thread.
    /// @returns True when the image raster changed.
    public func Advance() bool {
        if !WantsFrame {
            return false
        }
        guard let active = playback else {
            if let process = audio {
                if process.HasExited {
                    playing = false
                    clock.Stop()
                }
            }
            return false
        }
        guard let image = source else {
            return false
        }
        let updated = active.Advance(image)
        if previewPending && updated {
            previewPending = false
            stopVideo()
            return true
        }
        if active.Finished {
            anchor = Position
            clock.Reset()
            playing = false
            previewPending = false
            stopAudio()
        }
        if active.Error != "" {
            throw IOException(active.Error)
        }
        return updated
    }

    /// Pauses playback and keeps the current raster and position.
    public func Pause() {
        if !IsPlaying && !previewPending {
            return
        }
        anchor = Position
        clock.Reset()
        playing = false
        previewPending = false
        stopVideo()
        stopAudio()
    }

    /// Resumes from the saved position. Decoder buffers are owned until Pause or Dispose.
    public func Resume() {
        if disposed {
            throw ObjectDisposedException("MediaPlayer")
        }
        if playing {
            return
        }
        stopVideo()
        stopAudio()
        previewPending = false
        if duration > TimeSpan.Zero && anchor >= duration {
            anchor = TimeSpan.Zero
        }
        if let image = source {
            if buffers.Length == 0 {
                let length = image.Size.Width * image.Size.Height * 4
                buffers = [][]uint8{[length]uint8, [length]uint8, [length]uint8}
            }
            playback = VideoPlayback(path, image.Size, anchor, buffers, loop)
        }
        try {
            if hasAudio {
                let info = ProcessStartInfo("mpv")
                info.UseShellExecute = false
                info.RedirectStandardOutput = true
                info.RedirectStandardError = true
                for argument in[]string{
                    "--no-config",
                    "--no-video",
                    "--no-terminal",
                    "--really-quiet",
                    "--msg-level=all=no",
                    "--start=" + anchor.TotalSeconds.ToString("F3", CultureInfo.InvariantCulture),
                    "--",
                    path
                } {
                    info.ArgumentList.Add(argument)
                }
                audio = Process.Start(info) ?? throw InvalidOperationException("Could not start mpv")
            }
            playing = true
            clock.Restart()
        } catch (error Exception) {
            stopVideo()
            stopAudio()
            throw error
        }
    }

    /// Seeks to a non-negative position, preserving playback state and publishing one preview frame when paused.
    /// @param position The new position, clamped to a known duration.
    public func Seek(position TimeSpan) {
        if disposed {
            throw ObjectDisposedException("MediaPlayer")
        }
        if position < TimeSpan.Zero {
            throw ArgumentOutOfRangeException("position")
        }
        let resume = IsPlaying
        Pause()
        stopVideo()
        clock.Reset()
        anchor = duration > TimeSpan.Zero && position > duration ? duration: position
        if resume && (duration == TimeSpan.Zero || anchor < duration) {
            Resume()
        } else if !resume && source != nil && (duration == TimeSpan.Zero || anchor < duration) {
            playback = VideoPlayback(path, source!!.Size, anchor, buffers, false)
            previewPending = true
        }
    }

    /// Stops playback, joins the frame reader and releases all owned processes and buffers.
    public func Dispose() {
        if disposed {
            return
        }
        disposed = true
        playing = false
        clock.Stop()
        stopVideo()
        stopAudio()
        buffers = Array.Empty[[]uint8]()
        source = nil
    }

    private func stopVideo() {
        if let active = playback {
            active.Dispose()
        }
        playback = nil
    }

    private func stopAudio() {
        if let process = audio {
            try {
                if !process.HasExited {
                    process.Kill(true)
                }
            } catch (error InvalidOperationException) { }
            process.WaitForExit()
            process.Dispose()
        }
        audio = nil
    }
}

internal class VideoPlayback : IDisposable {
    private var process Process
    private let free Chan[[]uint8] = Chan[[]uint8](3)
    private let frames Chan[[]uint8] = Chan[[]uint8](2)
    private let done Chan[bool] = Chan[bool](1)
    private var joined bool
    private var disposed bool
    private var gate object
    private var error string

    internal prop Finished bool -> joined
    internal prop Error string {
        get {
            lock gate {
                return error
            }
        }
    }

    internal init(path string, size PixelSize, start TimeSpan, buffers[][]uint8, loop bool) {
        gate = Object()
        error = ""
        for i in 0 ... buffers.Length {
            free.TrySend(buffers[i])
        }
        let info = ProcessStartInfo("ffmpeg")
        info.UseShellExecute = false
        info.RedirectStandardOutput = true
        info.RedirectStandardError = true
        if loop {
            info.ArgumentList.Add("-stream_loop")
            info.ArgumentList.Add("-1")
        }
        for argument in[]string{
            "-nostdin",
            "-v",
            "quiet",
            "-threads",
            "2",
            "-ss",
            start.TotalSeconds.ToString("F3", CultureInfo.InvariantCulture),
            "-re",
            "-i",
            path,
            "-an",
            "-vf",
            "fps=15,scale=" + size.Width.ToString() + ":" + size.Height.ToString(),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "pipe:1"
        } {
            info.ArgumentList.Add(argument)
        }
        process = Process.Start(info) ?? throw InvalidOperationException("Could not start FFmpeg")
        go ReadFrames()
    }

    internal func Advance(image ImageSource) bool {
        var frame([]uint8)?
        var ok bool
        let updated = frames.TryReceive(out frame, out ok) && ok
        if updated {
            guard let pixels = frame else {
                return false
            }
            image.Update(pixels)
            if !free.TrySend(pixels) {
                throw InvalidOperationException("Video frame ownership was lost")
            }
        } else if !joined {
            var finished bool
            if done.TryReceive(out finished, out ok) && ok {
                joined = finished
            }
        }

        return updated
    }

    public func Dispose() {
        if disposed {
            return
        }
        lock gate {
            disposed = true
        }
        try {
            if !process.HasExited {
                process.Kill(true)
            }
        } catch (error InvalidOperationException) { }
        if !joined {
            let finished = <-done
            joined = finished
        }
        process.WaitForExit()
        process.Dispose()
        frames.Close()
        free.Close()
    }

    internal func ReadFrames() {
        using let timer = tick(TimeSpan.FromMilliseconds(1.0))
        try {
            while true {
                lock gate {
                    if disposed { return }
                }
                var next([]uint8)?
                var available bool
                if !free.TryReceive(out next, out available) || !available {
                    select {
                        case <- timer { }
                    }
                    continue
                }
                guard let buffer = next else {
                    continue
                }
                var offset = 0
                while offset < buffer.Length {
                    let count = process.StandardOutput.BaseStream.Read(buffer, offset, buffer.Length - offset)
                    if count == 0 {
                        return
                    }
                    offset += count
                }
                if !frames.TrySend(buffer) {
                    var old([]uint8)?
                    var ok bool
                    if frames.TryReceive(out old, out ok) && ok {
                        if let pixels = old {
                            free.TrySend(pixels)
                        }
                    }
                    if !frames.TrySend(buffer) {
                        free.TrySend(buffer)
                    }
                }
            }
        } catch (failure Exception) {
            lock gate {
                if !disposed {
                    error = failure.Message
                }
            }
        } finally {
            process.WaitForExit()
            lock gate {
                if !disposed && process.ExitCode != 0 {
                    error = "FFmpeg could not decode the media file"
                }
            }
            done <- true
        }
    }
}

internal class MediaProbe {
    internal let Result Chan[string] = Chan[string](1)
    internal var Error string = ""
    internal init(stream Stream) {
        go Read(stream)
    }

    internal func Read(stream Stream) {
        var text = ""
        try {
            using let output = MemoryStream()
            let buffer = [4096]uint8
            while true {
                let count = stream.Read(buffer, 0, buffer.Length)
                if count == 0 {
                    break
                }
                if output.Length + count > 65536 {
                    throw InvalidDataException("Media metadata exceeds 64 KiB")
                }
                output.Write(buffer, 0, count)
            }
            text = Encoding.UTF8.GetString(output.ToArray())
        } catch (error Exception) {
            Error = error.Message
        }
        Result <- text
    }
}
