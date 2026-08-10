package SharpTui

import System
import System.Collections.Generic

/// A single-row progress bar, optionally labelled.
public open class ProgressBar : Box {
  /// The current fill amount, relative to Maximum.
  public prop Value float64 { get; set; }
  /// The value that corresponds to a fully filled bar.
  public prop Maximum float64 { get; set; }
  /// The glyph drawn for filled cells.
  public prop FilledGlyph string { get; set; }
  /// The glyph drawn for unfilled cells.
  public prop EmptyGlyph string { get; set; }
  /// Text centered over the bar, such as a percentage.
  public prop OverlayText string { get; set; }
  /// The style applied to filled cells.
  public prop FillStyle Style { get; set; }

  /// Creates an empty progress bar with default block glyphs and a maximum of 1.0.
  public init() {
    Value = 0.0
    Maximum = 1.0
    FilledGlyph = char(0x2588).ToString()
    EmptyGlyph = char(0x2591).ToString()
    OverlayText = ""
    FillStyle = Style()
  }

  /// Always true, so this progress bar sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures an auto width as the cell width of OverlayText, at least one cell.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    var width = Glyph.WidthOf(OverlayText)
    if width < 1 { width = 1 }
    return CellSize{ WidthCells: width, HeightRows: 1 }
  }

  /// Paints the filled and empty portions of the bar for Value/Maximum, then centers OverlayText over it.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 || r.WidthCells <= 0 { return }
    let fillStyle = Style{
      Foreground: FillStyle.Foreground.IsInherited ? ink.Foreground : FillStyle.Foreground,
      Background: FillStyle.Background.IsInherited ? ink.Background : FillStyle.Background,
      Attributes: TextAttributes(int32(ink.Attributes) | int32(FillStyle.Attributes)),
    }

    var filled = 0
    if Maximum > 0.0 {
      filled = int32(Math.Round(float64(r.WidthCells) * Value / Maximum))
      if filled < 0 { filled = 0 }
      if filled > r.WidthCells { filled = r.WidthCells }
    }

    for x in 0 ... r.WidthCells {
      screen.WriteClipped(r, x, 0, x < filled ? FilledGlyph : EmptyGlyph, x < filled ? fillStyle : ink)
    }

    if OverlayText != "" {
      let w = Glyph.WidthOf(OverlayText)
      var x = (r.WidthCells - w) / 2
      if x < 0 { x = 0 }
      screen.WriteClipped(r, x, 0, OverlayText, ink)
    }
  }
}

internal enum NumericRangeKind { Auto, Fixed }

/// An automatic or fixed numeric scale.
public struct NumericRange {
  private var kind NumericRangeKind
  private var minimum float64
  private var maximum float64

  /// True when the range is computed automatically from the plotted values rather than fixed.
  public prop IsAuto bool { get { return kind == NumericRangeKind.Auto } }
  /// The fixed lower bound; meaningless when IsAuto is true.
  public prop Minimum float64 { get { return minimum } }
  /// The fixed upper bound; meaningless when IsAuto is true.
  public prop Maximum float64 { get { return maximum } }

  shared {
    /// A range that is recomputed from the minimum and maximum of the plotted values on each render.
    public prop Auto NumericRange { get { return NumericRange{} } }

    /// Creates a fixed range. Throws when either bound is NaN or infinite, or when maximum does not exceed minimum.
    /// @param minimum The fixed lower bound.
    /// @param maximum The fixed upper bound.
    /// @returns A range using those fixed bounds.
    public func Fixed(minimum float64, maximum float64) NumericRange {
      if Double.IsNaN(minimum) || Double.IsNaN(maximum)
        || Double.IsInfinity(minimum) || Double.IsInfinity(maximum) || maximum <= minimum {
        throw ArgumentOutOfRangeException("maximum")
      }
      return NumericRange{ kind: NumericRangeKind.Fixed, minimum: minimum, maximum: maximum }
    }
  }
}

/// A one-row series chart drawn with block glyphs.
public open class Sparkline : Box {
  private var valueRange NumericRange

  /// The series to plot, one glyph per value, oldest first.
  public prop Values List[float64] { get; set; }
  /// The scale used to map values to glyph levels.
  public prop ValueRange NumericRange {
    get { return valueRange }
    set { valueRange = value }
  }

  private var levels List[string]

  /// Creates an empty sparkline with an automatic value range.
  public init() {
    Values = List[float64]()
    valueRange = NumericRange.Auto
    levels = List[string]()
    levels.Add(char(0x2581).ToString())
    levels.Add(char(0x2582).ToString())
    levels.Add(char(0x2583).ToString())
    levels.Add(char(0x2584).ToString())
    levels.Add(char(0x2585).ToString())
    levels.Add(char(0x2586).ToString())
    levels.Add(char(0x2587).ToString())
    levels.Add(char(0x2588).ToString())
  }

  /// Always true, so this sparkline sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures an intrinsic width of one cell per value.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    return CellSize{ WidthCells: Values.Count, HeightRows: 1 }
  }

  /// Paints the most recent values that fit the width as a single row of block glyphs, right-aligned.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 || r.WidthCells <= 0 || Values.Count == 0 { return }

    var low = ValueRange.Minimum
    var high = ValueRange.Maximum
    if ValueRange.IsAuto {
      low = Values[0]
      high = Values[0]
      for v in Values {
        if v < low { low = v }
        if v > high { high = v }
      }
    }

    let start = Values.Count > r.WidthCells ? Values.Count - r.WidthCells : 0
    var x = r.WidthCells - (Values.Count - start)
    if x < 0 { x = 0 }
    var i = start
    while i < Values.Count {
      screen.WriteClipped(r, x, 0, glyphFor(Values[i], low, high), ink)
      x = x + 1
      i = i + 1
    }
  }

  private func glyphFor(v float64, low float64, high float64) string {
    if high <= low { return levels[levels.Count - 1] }
    var t = (v - low) / (high - low)
    if t < 0.0 { t = 0.0 }
    if t > 1.0 { t = 1.0 }
    var idx = int32(Math.Floor(t * float64(levels.Count - 1)))
    if idx >= levels.Count { idx = levels.Count - 1 }
    return levels[idx]
  }

}
