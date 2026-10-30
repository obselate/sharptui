package SharpTui

import System
import System.Collections.Generic

/// Selects how a numeric chart series is drawn.
public enum ChartStyle {
    /// Connects consecutive finite samples.
    Line;
    /// Fills consecutive finite samples to the lower vertical bound.
    Area;
    /// Draws separate samples without connecting them.
    Points
}

/// A numeric sample. A non-finite coordinate marks a gap.
public struct ChartPoint {
    /// The horizontal coordinate.
    public prop X float64 {
        get;
        init;
    }
    /// The vertical coordinate.
    public prop Y float64 {
        get;
        init;
    }
}

/// An ordered set of samples and its drawing style.
public class ChartSeries {
    /// The samples in connection order. Call ChartView.Refresh after changing a series.
    public prop Points List[ChartPoint] {
        get;
        set;
    }
    /// The terminal style for this series.
    public prop Style Style {
        get;
        set;
    }
    /// The drawing mode for this series.
    public prop ChartStyle ChartStyle {
        get;
        set;
    }

    /// Creates an empty line series.
    public init() {
        Points = List[ChartPoint]()
    }
}

/// A caller-supplied numeric axis label.
public struct ChartTick {
    /// The axis coordinate.
    public prop Value float64 {
        get;
        init;
    }
    /// The complete label. Labels that do not fit are suppressed.
    public prop Text string {
        get;
        init;
    }
}

private struct ChartLabel {
    var X int32
    var Y int32
    var Width int32
    var Text string
}

/// A retained XY chart with optional labels and a one-row block-level mode.
public open class ChartView : Box {
    private var series List[ChartSeries] = List[ChartSeries]()
    private var horizontalRange NumericRange
    private var verticalRange NumericRange
    private var horizontalTicks List[ChartTick] = List[ChartTick]()
    private var verticalTicks List[ChartTick] = List[ChartTick]()
    private var dirty bool = true
    private var width int32 = -1
    private var height int32 = -1
    private var plot CellRect
    private var surface CanvasSurface = CanvasSurface(0, 0, CanvasMode.Braille)
    private var labels List[ChartLabel] = List[ChartLabel]()
    private var levels List[int32] = List[int32]()
    private var levelStyles List[Style] = List[Style]()
    private var lowX float64
    private var highX float64
    private var lowY float64
    private var highY float64

    /// The ordered series. Call Refresh after changing a list or a series in place.
    public prop Series List[ChartSeries] {
        get -> series
        set {
            series = value
            Refresh()
        }
    }
    /// The horizontal scale. Auto uses all finite samples. Constant samples map to the center.
    public prop HorizontalRange NumericRange {
        get -> horizontalRange
        set {
            horizontalRange = value
            Refresh()
        }
    }
    /// The vertical scale. Auto uses all finite samples. Constant samples map to the center.
    public prop VerticalRange NumericRange {
        get -> verticalRange
        set {
            verticalRange = value
            Refresh()
        }
    }
    /// Optional horizontal labels, in priority order. Colliding labels are suppressed whole.
    public prop HorizontalTicks List[ChartTick] {
        get -> horizontalTicks
        set {
            horizontalTicks = value
            Refresh()
        }
    }
    /// Optional vertical labels, in priority order. Colliding labels are suppressed whole.
    public prop VerticalTicks List[ChartTick] {
        get -> verticalTicks
        set {
            verticalTicks = value
            Refresh()
        }
    }
    /// The terminal style of axis labels.
    public prop AxisStyle Style {
        get;
        set;
    }

    /// Creates an empty chart with automatic ranges.
    public init() { }

    /// Invalidates retained samples and labels after an in-place change.
    public func Refresh() {
        dirty = true
    }

    /// Paints the retained chart. A one-row region omits labels and uses block levels.
    /// @param screen The target screen.
    /// @param bounds The chart region.
    /// @param style The inherited style.
    protected override func Render(screen Screen, bounds CellRect, style Style) {
        if bounds.WidthCells <= 0 || bounds.HeightRows <= 0 {
            return
        }
        if dirty || width != bounds.WidthCells || height != bounds.HeightRows {
            rebuild(bounds.WidthCells, bounds.HeightRows)
        }
        if height == 1 {
            for x in 0 ... width {
                if levels[x] >= 0 {
                    screen.WriteCell(bounds.Column + x, bounds.Row, block(levels[x]), levelStyles[x].MergedOver(style))
                }
            }
        } else {
            surface.Draw(
                screen,
                CellRect{
                    Column: bounds.Column + plot.Column,
                    Row: bounds.Row + plot.Row,
                    WidthCells: plot.WidthCells,
                    HeightRows: plot.HeightRows
                },
                style
            )
            for index in 0 ... labels.Count {
                let label = labels[index]
                screen.WriteClipped(bounds, label.X, label.Y, label.Text, AxisStyle.MergedOver(style))
            }
        }
    }

    private func rebuild(columns int32, rows int32) {
        width = columns
        height = rows
        dirty = false
        lowX = horizontalRange.Minimum
        highX = horizontalRange.Maximum
        lowY = verticalRange.Minimum
        highY = verticalRange.Maximum
        var found = false
        for item in series {
            for point in item.Points {
                if !finite(point.X) || !finite(point.Y) {
                    continue
                }
                if horizontalRange.IsAuto {
                    if !found || point.X < lowX {
                        lowX = point.X
                    }
                    if !found || point.X > highX {
                        highX = point.X
                    }
                }
                if verticalRange.IsAuto {
                    if !found || point.Y < lowY {
                        lowY = point.Y
                    }
                    if !found || point.Y > highY {
                        highY = point.Y
                    }
                }
                found = true
            }
        }
        labels.Clear()
        plot = CellRect{WidthCells: width, HeightRows: height}
        if height == 1 {
            levels.Clear()
            levelStyles.Clear()
            for x in 0 ... width {
                levels.Add(-1)
                levelStyles.Add(Style())
            }
        } else {
            var margin = 0
            for tick in verticalTicks {
                if !finite(tick.Value) || tick.Value < lowY || tick.Value > highY {
                    continue
                }
                let cells = Glyph.WidthOf(tick.Text)
                if cells > margin && cells + 1 < width {
                    margin = cells
                }
            }
            let left = margin > 0 ? margin + 1: 0
            plot = CellRect{
                Column: left,
                WidthCells: width - left,
                HeightRows: horizontalTicks.Count > 0 && height > 2 ? height - 1: height
            }
            surface.Resize(plot.WidthCells, plot.HeightRows)
            for tick in verticalTicks {
                if !finite(tick.Value) || tick.Value < lowY || tick.Value > highY {
                    continue
                }
                let cells = Glyph.WidthOf(tick.Text)
                if cells <= 0 || cells > margin {
                    continue
                }
                addLabel(
                    margin - cells,
                    coordinate(1.0 - fraction(tick.Value, lowY, highY), plot.HeightRows),
                    cells,
                    tick.Text
                )
            }
            if plot.HeightRows < height {
                for tick in horizontalTicks {
                    if !finite(tick.Value) || tick.Value < lowX || tick.Value > highX {
                        continue
                    }
                    let cells = Glyph.WidthOf(tick.Text)
                    if cells <= 0 || cells > plot.WidthCells {
                        continue
                    }
                    var x = plot.Column + coordinate(fraction(tick.Value, lowX, highX), plot.WidthCells) - cells / 2
                    if x < plot.Column {
                        x = plot.Column
                    }
                    if x + cells > width {
                        x = width - cells
                    }
                    addLabel(x, height - 1, cells, tick.Text)
                }
            }
        }
        for item in series {
            var connected = false
            var previousX = 0.0
            var previousY = 0.0
            for point in item.Points {
                if !finite(point.X) || !finite(point.Y) {
                    connected = false
                    continue
                }
                let x = fraction(point.X, lowX, highX)
                let y = fraction(point.Y, lowY, highY)
                if connected && item.ChartStyle != ChartStyle.Points {
                    segment(previousX, previousY, x, y, item)
                }
                if x >= 0.0 && x <= 1.0 && (item.ChartStyle == ChartStyle.Area || (y >= 0.0 && y <= 1.0)) {
                    sample(
                        coordinate(x, height == 1 ? width: surface.SubcellWidth),
                        coordinate(1.0 - y, height == 1 ? 8: surface.SubcellHeight),
                        item
                    )
                }
                previousX = x
                previousY = y
                connected = true
            }
        }
    }

    private func addLabel(x int32, y int32, cells int32, text string) {
        for label in labels {
            if label.Y == y && x < label.X + label.Width && x + cells > label.X {
                return
            }
        }
        labels.Add(ChartLabel{X: x, Y: y, Width: cells, Text: text})
    }

    private func segment(x0 float64, y0 float64, x1 float64, y1 float64, item ChartSeries) {
        let dx = x1 - x0
        let dy = y1 - y0
        var first = 0.0
        var last = 1.0
        if !clip(-dx, x0, ref first, ref last) || !clip(dx, 1.0 - x0, ref first, ref last) {
            return
        }
        if item.ChartStyle != ChartStyle.Area
        && (!clip(-dy, y0, ref first, ref last) || !clip(dy, 1.0 - y0, ref first, ref last)) {
            return
        }
        let columns = height == 1 ? width: surface.SubcellWidth
        let rows = height == 1 ? 8: surface.SubcellHeight
        let startX = coordinate(x0 + first * dx, columns)
        let endX = coordinate(x0 + last * dx, columns)
        let startY = coordinate(1.0 - (y0 + first * dy), rows)
        let endY = coordinate(1.0 - (y0 + last * dy), rows)
        if height > 1 && item.ChartStyle == ChartStyle.Line {
            surface.Line(startX, startY, endX, endY, item.Style)
            return
        }
        let distance = Math.Abs(endX - startX)
        for step in 0 ... distance + 1 {
            let x = startX + (endX >= startX ? step: -step)
            let position = distance == 0 ? (y1 > y0 ? last: first)
            : first + (last - first) * float64(step) / float64(distance)
            let y = coordinate(1.0 - (y0 + position * dy), rows)
            sample(x, y, item)
        }
    }

    private func sample(x int32, y int32, item ChartSeries) {
        if height == 1 {
            levels[x] = 7 - y
            levelStyles[x] = item.Style
        } else if item.ChartStyle == ChartStyle.Area {
            surface.Line(x, y, x, surface.SubcellHeight - 1, item.Style)
        } else {
            surface.Point(x, y, item.Style)
        }
    }

    private func clip(direction float64, distance float64, ref first float64, ref last float64) bool {
        if direction == 0.0 {
            return distance >= 0.0
        }
        let ratio = distance / direction
        if direction < 0.0 {
            if ratio > last {
                return false
            }
            if ratio > first {
                first = ratio
            }
        } else {
            if ratio < first {
                return false
            }
            if ratio < last {
                last = ratio
            }
        }
        return true
    }

    private func fraction(value float64, low float64, high float64) float64 {
        if high == low {
            return value == low ? 0.5: value < low ? -1.0: 2.0
        }
        let span = high - low
        let result = finite(span) ? (value - low) / span: (value / 2.0 - low / 2.0) / (high / 2.0 - low / 2.0)
        return Math.Clamp(result, -Double.MaxValue / 4.0, Double.MaxValue / 4.0)
    }

    private func coordinate(value float64, size int32) int32 -> int32(
        Math.Round(Math.Clamp(value, 0.0, 1.0) * float64(size - 1))
    )

    private func finite(value float64) bool -> !Double.IsNaN(value) && !Double.IsInfinity(value)

    private func block(level int32) string {
        if level == 0 {
            return "▁"
        }
        if level == 1 {
            return "▂"
        }
        if level == 2 {
            return "▃"
        }
        if level == 3 {
            return "▄"
        }
        if level == 4 {
            return "▅"
        }
        if level == 5 {
            return "▆"
        }
        if level == 6 {
            return "▇"
        }
        return "█"
    }
}
