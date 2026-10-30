package SharpTui

import System

internal struct ImageDraw {
    var Source ImageSource
    var Target CellRect
    var Crop CellRect
    var Id int32
    var UploadedVersion int64
    var Version int64
    var RasterWidth int32
    var RasterHeight int32
}

internal class ImageRaster {
    shared {
        internal func Layout(source ImageSource, bounds CellRect, fit ImageFit, cell PixelSize) ImageDraw {
            let size = source.Size
            var target = bounds
            var crop = CellRect{WidthCells: size.Width, HeightRows: size.Height}
            let w = int64(bounds.WidthCells) * cell.Width
            let h = int64(bounds.HeightRows) * cell.Height
            if w <= 0 || h <= 0 {
                return ImageDraw{Source: source, Target: target, Crop: crop}
            }
            let wide = int64(size.Width) * h > int64(size.Height) * w
            if fit == ImageFit.Contain {
                let columns = wide ? bounds.WidthCells: Math.Clamp(int32(Math.Round(float64(h * size.Width) / float64(int64(size.Height) * cell.Width))), 1, bounds.WidthCells)
                let rows = wide ? Math.Clamp(int32(Math.Round(float64(w * size.Height) / float64(int64(size.Width) * cell.Height))), 1, bounds.HeightRows): bounds.HeightRows
                target = CellRect{
                    Column: bounds.Column + (bounds.WidthCells - columns) / 2,
                    Row: bounds.Row + (bounds.HeightRows - rows) / 2,
                    WidthCells: columns,
                    HeightRows: rows
                }
            } else if fit == ImageFit.Cover {
                let cw = wide ? int32(Math.Max(1L, int64(size.Height) * w / h)): size.Width
                let ch = wide ? size.Height: int32(Math.Max(1L, int64(size.Width) * h / w))
                crop = CellRect{
                    Column: (size.Width - cw) / 2,
                    Row: (size.Height - ch) / 2,
                    WidthCells: cw,
                    HeightRows: ch
                }
            }
            let rw = Math.Max(1, Math.Min(2048, target.WidthCells * cell.Width))
            let rh = Math.Max(1, Math.Min(2048, target.HeightRows * cell.Height))
            return ImageDraw{
                Source: source,
                Target: target,
                Crop: crop,
                Version: source.Version,
                RasterWidth: rw,
                RasterHeight: rh
            }
        }

        internal func Clip(a CellRect, b CellRect) CellRect {
            let x = Math.Max(a.Column, b.Column)
            let y = Math.Max(a.Row, b.Row)
            return CellRect{
                Column: x,
                Row: y,
                WidthCells: Math.Max(0, Math.Min(a.Column + a.WidthCells, b.Column + b.WidthCells) - x),
                HeightRows: Math.Max(0, Math.Min(a.Row + a.HeightRows, b.Row + b.HeightRows) - y)
            }
        }

        internal func SameRect(a CellRect, b CellRect) bool -> a.Column == b.Column && a.Row == b.Row
        && a.WidthCells == b.WidthCells && a.HeightRows == b.HeightRows

        internal func Same(a ImageDraw, b ImageDraw) bool -> Object.ReferenceEquals(a.Source, b.Source)
        && a.Version == b.Version && SameRect(a.Target, b.Target) && SameRect(a.Crop, b.Crop)
        && a.RasterWidth == b.RasterWidth && a.RasterHeight == b.RasterHeight && a.Id == b.Id

        internal func Pixel(draw ImageDraw, x int32, y int32, width int32, height int32) uint32 {
            let crop = draw.Crop
            if width == crop.WidthCells && height == crop.HeightRows {
                let at = ((y + crop.Row) * draw.Source.Size.Width + x + crop.Column) * 4
                let pixels = draw.Source.Pixels
                return uint32(pixels[at]) | uint32(pixels[at + 1]) << 8 | uint32(pixels[at + 2]) << 16 | uint32(
                    pixels[at + 3]
                ) << 24
            }
            let fx = Math.Clamp(
                (float64(x) + 0.5) * float64(crop.WidthCells) / float64(width) - 0.5,
                0.0,
                float64(crop.WidthCells - 1)
            )
            let fy = Math.Clamp(
                (float64(y) + 0.5) * float64(crop.HeightRows) / float64(height) - 0.5,
                0.0,
                float64(crop.HeightRows - 1)
            )
            let x0 = int32(fx) + crop.Column
            let y0 = int32(fy) + crop.Row
            let x1 = Math.Min(x0 + 1, crop.Column + crop.WidthCells - 1)
            let y1 = Math.Min(y0 + 1, crop.Row + crop.HeightRows - 1)
            let dx = fx - Math.Floor(fx)
            let dy = fy - Math.Floor(fy)
            let pixels = draw.Source.Pixels
            let sw = draw.Source.Size.Width
            var packed uint32
            for c in 0 ... 4 {
                let top = float64(pixels[(y0 * sw + x0) * 4 + c]) * (1.0 - dx)
                + float64(pixels[(y0 * sw + x1) * 4 + c]) * dx
                let bottom = float64(pixels[(y1 * sw + x0) * 4 + c]) * (1.0 - dx)
                + float64(pixels[(y1 * sw + x1) * 4 + c]) * dx
                packed |= uint32(Math.Round(top * (1.0 - dy) + bottom * dy)) << (c * 8)
            }
            return packed
        }

        internal func Opaque(pixel uint32, background int32) int32 {
            let bg = background >= 0 && background < 0x1000000 ? background: 0
            let alpha = int32(pixel >> 24)
            let red = (int32(pixel & 255u) * alpha + ((bg >> 16) & 255) * (255 - alpha) + 127) / 255
            let green = (int32((pixel >> 8) & 255u) * alpha + ((bg >> 8) & 255) * (255 - alpha) + 127) / 255
            let blue = (int32((pixel >> 16) & 255u) * alpha + (bg & 255) * (255 - alpha) + 127) / 255
            return (red << 16) | (green << 8) | blue
        }
    }
}
