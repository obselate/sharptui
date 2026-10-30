package SharpTui

import System
import System.Collections.Generic

private struct NumericDisplayCell {
    var Column int32
    var Row int32
    var Glyph string
}

/// Numeric text drawn in one, three, or five rows, with plain text fallback.
public open class NumericDisplay : Box {
    private var text string
    private var preferredHeight int32
    private var clusters List[string]
    private var points List[NumericDisplayCell]
    private var textWidth int32
    private var glyphWidth int32
    private var supported bool

    /// The complete value. Unsupported characters use one plain row, clipped at grapheme boundaries.
    public prop Text string {
        get -> text
        set {
            if text == value {
                return
            }
            text = value
            rebuild()
        }
    }

    /// The requested glyph height: 1, 3, or 5. Insufficient width or height uses one plain row.
    public prop PreferredHeight int32 {
        get -> preferredHeight
        set {
            if value != 1 && value != 3 && value != 5 {
                throw ArgumentOutOfRangeException("PreferredHeight")
            }
            if preferredHeight == value {
                return
            }
            preferredHeight = value
            rebuild()
        }
    }

    /// Horizontal placement of the rendered value within the content region.
    public prop Alignment HorizontalAlignment {
        get;
        set;
    }

    /// Creates an empty, left-aligned display with a preferred height of one row.
    public init() {
        text = ""
        preferredHeight = 1
        clusters = List[string]()
        points = List[NumericDisplayCell]()
        supported = true
    }

    /// Enables intrinsic sizing from the cached glyph dimensions.
    protected override prop MeasuresIntrinsic bool -> true

    /// Measures the requested glyph form, or one plain row when it cannot fit.
    /// @param availableWidth The available terminal width, or nil when unconstrained.
    /// @param availableHeight The available terminal height, or nil when unconstrained.
    /// @returns The content size in terminal cells and rows.
    protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
        let large = fits(availableWidth, availableHeight)
        var width = large ? glyphWidth: textWidth
        if availableWidth != nil {
            width = Math.Min(width, availableWidth)
        }
        return CellSize{WidthCells: width, HeightRows: large ? preferredHeight: 1}
    }

    /// Paints cached glyph geometry or the complete value as one plain row.
    /// @param screen The destination screen.
    /// @param r The available content region.
    /// @param ink The inherited style.
    protected override func Render(screen Screen, r CellRect, ink Style) {
        if r.WidthCells <= 0 || r.HeightRows <= 0 {
            return
        }
        let large = fits(r.WidthCells, r.HeightRows)
        let width = large ? glyphWidth: textWidth
        var x = 0
        if Alignment == HorizontalAlignment.Center {
            x = (r.WidthCells - width) / 2
        }
        if Alignment == HorizontalAlignment.Right {
            x = r.WidthCells - width
        }
        x = Math.Max(0, x)
        var index = 0
        if large {
            while index < points.Count {
                let point = points[index]
                screen.WriteCell(r.Column + x + point.Column, r.Row + point.Row, point.Glyph, ink)
                index = index + 1
            }
        } else {
            while index < clusters.Count {
                let cluster = clusters[index]
                let cells = Glyph.Of(cluster)
                if x + cells > r.WidthCells {
                    break
                }
                screen.WriteCell(r.Column + x, r.Row, cluster, ink)
                x = x + cells
                index = index + 1
            }
        }
    }

    private func fits(width int32?, height int32?) bool {
        if preferredHeight == 1 || !supported {
            return false
        }
        if let columns = width {
            if glyphWidth > columns {
                return false
            }
        }
        if let rows = height {
            if preferredHeight > rows {
                return false
            }
        }
        return true
    }

    private func rebuild() {
        clusters.Clear()
        points.Clear()
        textWidth = 0
        supported = true
        for cluster in Glyph.Elements(text) {
            clusters.Add(cluster)
            textWidth = textWidth + Glyph.Of(cluster)
            if cluster.Length != 1 || pattern(cluster[0]) == "" {
                supported = false
            }
        }
        glyphWidth = Math.Max(0, clusters.Count * 4 - 1)
        if supported && preferredHeight > 1 {
            for i in 0 ... clusters.Count {
                let shape = pattern(clusters[i][0])
                for row in 0 ... preferredHeight {
                    for column in 0 ... 3 {
                        let glyph = shape[row * 4 + column]
                        if glyph != ' ' {
                            points.Add(
                                NumericDisplayCell{
                                    Column: i * 4 + column,
                                    Row: row,
                                    Glyph: glyph == '#' ? "█": glyph.ToString(),
                                }
                            )
                        }
                    }
                }
            }
        }
        MarkMeasureDirty()
    }

    private func pattern(character char) string {
        if preferredHeight == 5 {
            return switch character {
                case '0': "###/# #/# #/# #/###"
                case '1': " # /## / # / # /###"
                case '2': "###/  #/###/#  /###"
                case '3': "###/  #/###/  #/###"
                case '4': "# #/# #/###/  #/  #"
                case '5': "###/#  /###/  #/###"
                case '6': "###/#  /###/# #/###"
                case '7': "###/  #/  #/  #/  #"
                case '8': "###/# #/###/# #/###"
                case '9': "###/# #/###/  #/###"
                case '+': "   / # /###/ # /   "
                case '-': "   /   /###/   /   "
                case '.': "   /   /   /   / # "
                case ':': "   / # /   / # /   "
                case '%': "# #/  #/ # /#  /# #"
                case ' ': "   /   /   /   /   "
                case _: ""
            }
        }
        return switch character {
            case '0': " _ /| |/|_|"
            case '1': "   /  |/  |"
            case '2': " _ / _|/|_ "
            case '3': " _ / _|/ _|"
            case '4': "   /|_|/  |"
            case '5': " _ /|_ / _|"
            case '6': " _ /|_ /|_|"
            case '7': " _ /  |/  |"
            case '8': " _ /|_|/|_|"
            case '9': " _ /|_|/ _|"
            case '+': " # /###/ # "
            case '-': "   /###/   "
            case '.': "   /   / # "
            case ':': " # /   / # "
            case '%': "# #/ # /# #"
            case ' ': "   /   /   "
            case _: ""
        }
    }
}
