# Images and media

SharpTUI paints images through the retained screen compositor. Use `ImageView` for an ordinary tree and `Box.Draw(screen, bounds, clip)` for a retained virtual row, or `Screen.DrawImage` for custom drawing. Images follow clipping and paint order. An overlay covers the image cells beneath it. Closing the overlay restores them.

```gs
let image = ImageSource.Load("photo.png")
let app = App{
  Root: Column(){
    Label{ Text: "photo" },
    ImageView{ Source: image, Grow: 1 },
  },
}
app.Run()
```

`App.Graphics` defaults to `Auto`. Startup probes Kitty graphics, Sixel device attributes and cell pixel dimensions. Unsupported terminals use colored half blocks. The probes expire after 250 ms and consume their replies before text input. Explicit `Kitty`, `Sixel` and `HalfBlock` modes are available. `App.CellPixels` can override detection. A standalone `Screen` uses half blocks and an 8 by 16 pixel cell by default.

`ImageFit.Contain` keeps the complete image, `Cover` crops to fill, and `Stretch` fills without preserving aspect ratio. For a partially scrolled row, pass its full destination rectangle and its visible clipping rectangle to `Screen.DrawImage(source, bounds, clip, fit)`.

Decode files or bytes off the UI thread, then publish the resulting source to the tree. `ImageSource` owns its pixels. `FromRgba` copies the supplied raster. `Update` copies a replacement frame into the existing source and changes its version without allocating. Update and drawing must run on the UI thread. Source dimensions remain fixed.

Encoded images are limited to 16 MiB. Decoded RGBA is limited to 64 MiB and 8192 pixels per dimension. PNG decompression is checked before decoding. PNG, JPEG, GIF's first frame, BMP, TGA and PSD use the managed StbImageSharp decoder. Use playback for animated images.

## Playback

Install `ffmpeg` and `ffprobe`, plus `mpv` for files with audio. The player uses a G# worker, three reusable frame buffers and a two-frame queue. A slow UI receives newer complete frames instead of building an unbounded backlog.

```gs
using let player = MediaPlayer("clip.mp4")
let app = App{ Root: MediaView{ Player: player, Grow: 1 } }
app.Run()
```

`MediaView` requests frames while the player is active, so an application does not need a tick interval or a refresh loop. `Pause`, `Resume` and `Seek` control playback. A paused seek decodes one preview frame and remains paused. `Advance` is available for custom rendering. It publishes a complete frame without blocking or allocating on the UI thread. Audio-only files have no image source. `Dispose` stops only the player's processes and joins its frame reader.

The default video raster is bounded to 640 by 360 pixels at 15 FPS. The constructor overload accepts a maximum size up to 2048 by 2048. Pass `true` as the third constructor argument for continuous GIF/video looping. `Position` wraps at the reported duration. Decoder buffers remain owned by the player across pause and resume. Restarting or seeking starts a new decoder process. Construction and restart are phase-boundary work. Create players outside the UI event loop when opening large media.

## Transport and resource ownership

Kitty transfers bounded RGB data for opaque sources and RGBA data for sources with transparency in protocol-sized base64 chunks and uses Unicode image placeholders, supported by Kitty 0.28 and later. Each visible cell identifies its image row and column. Text and overlays replace those cells directly. Unchanged images emit no transport data. A fully covered or scrolled-away image retains its upload for reuse. The cache holds at most 64 entries and four million source/raster pixels, evicts the oldest offscreen entries, and checks source identity, version, crop and raster dimensions. Image data is removed on eviction, a backend change or terminal exit. Image rectangles above the protocol's 297-cell coordinate range use half blocks.

Sixel uses an adaptive 256-color palette, error diffusion and run-length encoding. It clears and repaints the retained text and image frame when a native image changes, so removed or covered pixels cannot remain on screen. Its palette and column masks are reused. The image backend retains at most 64 native draws and four million upload pixels per frame. Additional or oversized draws use half blocks. Sixel regions are also bounded to four million physical pixels.

Native image metadata and scratch buffers are created at the first image or a size increase. They live with the screen and have bounded capacity. Raster decode and video buffers live with their source or player. Clean rendering and warmed frame emission retain the text renderer's zero-allocation requirement.

The native protocols are tested in Kitty and xterm with Sixel enabled. A terminal multiplexer must pass through its graphics protocol. Use `HalfBlock` where passthrough is unavailable. A TUI inherits the font of its terminal.

Run `dotnet run --project SharpTui.Examples.gsproj -c Release -- --media [file]` for the image, overlay and playback example.

## Application updates

Use `App.OnTick` for UI updates that must continue while an overlay owns input. Set `TickInterval` to the required interval. `App.OnFocus` reports terminal focus changes through `UiEventKind.Focus`. Focus reporting is saved on entry and restored on exit. Callbacks are retained once and dispatched without event wrappers.
