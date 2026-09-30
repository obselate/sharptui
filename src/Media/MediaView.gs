package SharpTui

import System

/// Displays a borrowed MediaPlayer and requests frames only while it is playing.
public open class MediaView : Box {
    /// The player to display. The caller owns and disposes it.
    public prop Player MediaPlayer? {
        get;
        set;
    }
    /// The video scaling rule. Contain is the default.
    public prop Fit ImageFit {
        get;
        set;
    }

    /// Creates an empty media view with contain scaling.
    public init() {
        Fit = ImageFit.Contain
    }

    /// Requests a repaint at the decoder's 15 FPS while playback is active.
    protected override prop FrameInterval TimeSpan -> Player?.WantsFrame ?? false
    ? TimeSpan.FromMilliseconds(67.0): TimeSpan.Zero

    /// Publishes the newest frame and stages it in the image compositor.
    protected open override func Render(screen Screen, bounds CellRect, style Style) {
        guard let player = Player else {
            return
        }
        player.Advance()
        if let source = player.Source {
            screen.DrawImage(source, bounds, bounds, Fit)
        } else {
            screen.WriteClipped(bounds, 0, 0, player.IsPlaying ? "audio playing": "audio paused", style)
        }
    }
}
