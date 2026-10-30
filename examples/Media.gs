package SharpTui

import SharpTui
import System

open class MediaDemo : Column {
    private var image ImageView
    private var player MediaPlayer?
    private var overlay Overlay
    private var status Label
    private var lastGraphics int32 = -1
    private var lastCell PixelSize

    public init(source ImageSource?, player MediaPlayer?) {
        this.player = player
        image = ImageView{Grow: 1, Source: source}
        status = Label{Text: "o overlay   space pause   arrows seek   q quit"}
        overlay = Overlay{
            IsVisible: false,
            Placement: Placement.Centered,
            Width: 38,
            Height: 7,
            Padding: 1,
            ShowBorder: true,
            Title: "image clipping",
            Style: Style{Background: Ink.Back},
            Children: {Label{Text: "The image must stop at this panel."}, Label{Text: "Press Escape to close."}}
        }
        let close = Button{
            Text: "close",
            OnClick: () -> {
                overlay.IsVisible = false
            }
        }
        overlay.Add(close)
        overlay.CancelAction = close
        overlay.DefaultAction = close
        Add(Label{Text: "SharpTUI media", Style: Style{Foreground: Ink.Accent}})
        if player != nil {
            Add(MediaView{Player: player, Grow: 1})
        } else {
            Add(image)
        }
        Add(status)
        Add(overlay)
    }

    protected override func Render(screen Screen, bounds CellRect, style Style) {
        let pixels = screen.CellPixels
        if lastGraphics == int32(screen.Graphics) &&
            pixels.Width == lastCell.Width &&
            pixels.Height == lastCell.Height {
            return
        }
        lastGraphics = int32(screen.Graphics)
        lastCell = pixels
        status.Text = screen.Graphics.ToString() + "   " + screen.CellPixels.Width.ToString()
        + "x" + screen.CellPixels.Height.ToString() + " pixels   o overlay   space pause   q quit"
    }

    protected override func Accept(ev UiEvent) EventResult {
        if ev.Phase != KeyPhase.Press {
            return EventResult.Continue
        }
        if ev.Key == Key.Character && ev.Text == "q" {
            return EventResult.Exit
        }
        if ev.Key == Key.Character && ev.Text == "o" {
            overlay.IsVisible = !overlay.IsVisible
            return EventResult.Handled
        }
        if let active = player {
            if ev.Key == Key.Character && ev.Text == " " {
                if active.IsPlaying {
                    active.Pause()
                } else {
                    active.Resume()
                }
                return EventResult.Handled
            }
            if ev.Key == Key.Left || ev.Key == Key.Right {
                let position = active.Position + TimeSpan.FromSeconds(ev.Key == Key.Left ? -5.0: 5.0)
                active.Seek(position < TimeSpan.Zero ? TimeSpan.Zero: position)
                return EventResult.Handled
            }
        }
        return EventResult.Continue
    }
}

func mediaDemo(path string) int32 {
    let app = App{DefaultStyle: Style{Foreground: Ink.Text, Background: Ink.Back}}
    if path != "" {
        if path.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
        || path.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
        || path.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase) {
            app.Root = MediaDemo(ImageSource.Load(path), nil)
            app.Run()
        } else {
            using let player = MediaPlayer(path)
            app.Root = MediaDemo(nil, player)
            app.Run()
        }
    } else {
        let rgba = [320 * 180 * 4]uint8
        for y in 0 ... 180 {
            for x in 0 ... 320 {
                let i = (y * 320 + x) * 4
                rgba[i] = uint8(x * 255 / 319)
                rgba[i + 1] = uint8(y * 255 / 179)
                rgba[i + 2] = uint8((x + y) * 255 / 498)
                rgba[i + 3] = 255
            }
        }
        app.Root = MediaDemo(ImageSource.FromRgba(320, 180, rgba), nil)
        app.Run()
    }
    return 0
}
