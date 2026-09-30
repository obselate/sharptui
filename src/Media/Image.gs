package SharpTui

import StbImageSharp
import System
import System.IO
import System.IO.Compression

/// Selects the terminal image transport. Auto probes support before choosing a backend.
public enum GraphicsProtocol {
    Auto;
    Kitty;
    Sixel;
    HalfBlock
}

/// Controls image scaling inside its cell rectangle.
public enum ImageFit {
    Contain;
    Cover;
    Stretch
}

/// A size measured in physical pixels.
public struct PixelSize {
    /// The horizontal pixel count. Zero requests detection for App.CellPixels.
    public prop Width int32 {
        get;
        init;
    }
    /// The vertical pixel count. Zero requests detection for App.CellPixels.
    public prop Height int32 {
        get;
        init;
    }
}

/// Owns a bounded RGBA raster. Create or decode off the UI thread, then publish it to the UI.
public class ImageSource {
    private var pixels[]uint8
    private var width int32
    private var height int32
    private var version int64
    private var opaque bool
    internal prop IsOpaque bool -> opaque

    /// The raster dimensions in pixels.
    public prop Size PixelSize -> PixelSize{Width: width, Height: height}

    private init(width int32, height int32, pixels[]uint8) {
        this.width = width
        this.height = height
        this.pixels = pixels
        version = 1
        findOpacity()
    }

    /// Copies a replacement RGBA frame into the existing raster without allocating. Call on the UI thread.
    /// @param rgba Straight alpha pixels in row order, exactly Width * Height * 4 bytes.
    public func Update(rgba[]uint8) {
        if rgba.Length != pixels.Length {
            throw ArgumentException("RGBA frame dimensions must match the source", "rgba")
        }
        Array.Copy(rgba, pixels, pixels.Length)
        version++
        findOpacity()
    }

    internal func CopySnapshot(source ImageSource) {
        if pixels.Length < source.pixels.Length {
            Array.Resize(ref pixels, source.pixels.Length)
        }
        width = source.width
        height = source.height
        opaque = source.opaque
        version = source.version
        Array.Copy(source.pixels, pixels, source.width * source.height * 4)
    }

    private func findOpacity() {
        opaque = true
        var at = 3
        while at < pixels.Length {
            if pixels[at] != uint8(255) {
                opaque = false
                return
            }
            at += 4
        }
    }

    internal prop Version int64 -> version
    internal prop Pixels[]uint8 -> pixels

    shared {
        /// Copies an RGBA raster into an owned image. Maximum 8192 per dimension and 64 MiB decoded.
        /// @param width The positive pixel width.
        /// @param height The positive pixel height.
        /// @param rgba Straight alpha pixels in row order.
        /// @returns The owned image source.
        public func FromRgba(width int32, height int32, rgba[]uint8) ImageSource {
            validateSize(width, height)
            if rgba.Length != width * height * 4 {
                throw ArgumentException("Invalid RGBA raster length", "rgba")
            }
            let pixels = [rgba.Length]uint8
            Array.Copy(rgba, pixels, pixels.Length)
            return ImageSource(width, height, pixels)
        }

        /// Loads an image file of at most 16 MiB. PNG, JPEG, GIF first frame, BMP, TGA and PSD are supported.
        /// @param path The local file to decode.
        /// @returns The decoded image with straight alpha RGBA pixels.
        public func Load(path string) ImageSource {
            using let stream = File.OpenRead(path)
            if stream.Length > 16777216 {
                throw InvalidDataException("Encoded image exceeds 16 MiB")
            }
            let bytes = [int32(stream.Length)]uint8
            stream.ReadExactly(bytes)
            return Decode(bytes)
        }

        /// Decodes at most 16 MiB of image data after checking the declared raster size.
        /// @param encoded The complete encoded image.
        /// @returns The decoded image source.
        public func Decode(encoded[]uint8) ImageSource {
            if encoded.Length > 16777216 {
                throw InvalidDataException("Encoded image exceeds 16 MiB")
            }
            using let stream = MemoryStream(encoded, false)
            guard let info = ImageInfo.FromStream(stream) else {
                throw InvalidDataException("Unsupported or truncated image")
            }
            validateSize(info.Width, info.Height)
            validatePng(encoded, info.Width, info.Height)
            stream.Position = 0
            guard let image = ImageResult.FromStream(stream, ColorComponents.RedGreenBlueAlpha) else {
                throw InvalidDataException("Image decoder returned no raster")
            }
            validateSize(image.Width, image.Height)
            guard let data = image.Data else {
                throw InvalidDataException("Image decoder returned no pixels")
            }
            if data.Length != image.Width * image.Height * 4 {
                throw InvalidDataException("Invalid decoded raster")
            }
            return ImageSource(image.Width, image.Height, data)
        }

        private func validateSize(width int32, height int32) {
            if width <= 0 || height <= 0 || width > 8192 || height > 8192
            || int64(width) * height * 4 > 67108864 {
                throw InvalidDataException("Image exceeds 8192 pixels per dimension or 64 MiB RGBA")
            }
        }

        private func validatePng(bytes[]uint8, width int32, height int32) {
            if bytes.Length < 8 || bytes[0] != uint8(137) || bytes[1] != uint8(80)
            || bytes[2] != uint8(78) || bytes[3] != uint8(71) {
                return
            }
            using let data = MemoryStream()
            var offset = 8
            while offset < bytes.Length {
                if bytes.Length - offset < 12 {
                    throw InvalidDataException("Truncated PNG chunk")
                }
                let length = (uint32(bytes[offset]) << 24) | (uint32(bytes[offset + 1]) << 16)
                | (uint32(bytes[offset + 2]) << 8) | uint32(bytes[offset + 3])
                if int64(length) + 12 > bytes.Length - offset {
                    throw InvalidDataException("Truncated PNG data")
                }
                if bytes[offset + 4] == uint8(73) && bytes[offset + 5] == uint8(68)
                && bytes[offset + 6] == uint8(65) && bytes[offset + 7] == uint8(84) {
                    data.Write(bytes, offset + 8, int32(length))
                }
                offset += int32(length) + 12
            }
            data.Position = 0
            using let inflated = ZLibStream(data, CompressionMode.Decompress)
            let buffer = [65536]uint8
            let limit = int64(width + 7) * (height + 7) * 8 + int64(height) * 8
            var total int64
            while true {
                let count = inflated.Read(buffer, 0, buffer.Length)
                if count == 0 {
                    break
                }
                total += count
                if total > limit {
                    throw InvalidDataException("PNG decompression exceeds its declared raster size")
                }
            }
        }
    }
}

/// A retained image that follows layout, clipping and overlay order.
public open class ImageView : Box {
    /// The owned image to display. Nil displays AltText.
    public prop Source ImageSource? {
        get;
        set;
    }
    /// The scaling rule. Contain preserves the complete image by default.
    public prop Fit ImageFit {
        get;
        set;
    }
    /// Text shown when there is no source.
    public prop AltText string {
        get;
        set;
    }

    /// Creates an empty image view with contain scaling.
    public init() {
        Fit = ImageFit.Contain
        AltText = ""
    }

    /// Stages the image into the retained screen compositor.
    protected open override func Render(screen Screen, bounds CellRect, style Style) {
        guard let source = Source else {
            screen.WriteClipped(bounds, 0, 0, AltText, style)
            return
        }
        screen.DrawImage(source, bounds, bounds, Fit)
    }
}
