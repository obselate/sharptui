package SharpTui

import System

/// Whether a Separator draws across a row or down a column.
public enum SeparatorOrientation { Horizontal, Vertical }

/// A divider line with an explicit orientation.
public open class Separator : Box {
  /// The glyph repeated along the line; empty selects a default box-drawing character for the current Orientation.
  public prop Glyph string { get; set; }
  /// Whether the line is drawn horizontally or vertically.
  public prop Orientation SeparatorOrientation { get; set; }

  /// Creates a horizontal separator using the default glyph.
  public init() {
    Glyph = ""
    Orientation = SeparatorOrientation.Horizontal
  }

  /// Separator always sizes itself via MeasureIntrinsic rather than Width and Height.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the effective glyph's cell width as one row tall.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured content size in cells and rows.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    let mark = Glyph != "" ? Glyph : defaultGlyph()
    return CellSize{ WidthCells: CellText.MeasureWidth(mark), HeightRows: 1 }
  }

  /// Repeats the effective glyph across the row or down the column, according to Orientation.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.WidthCells <= 0 || r.HeightRows <= 0 { return }
    let mark = Glyph != "" ? Glyph : defaultGlyph()
    if Orientation == SeparatorOrientation.Horizontal {
      for x in 0 ... r.WidthCells {
        screen.WriteClipped(r, x, 0, mark, ink)
      }
      return
    }
    for y in 0 ... r.HeightRows {
      screen.WriteClipped(r, 0, y, mark, ink)
    }
  }

  private func defaultGlyph() string {
    return Orientation == SeparatorOrientation.Horizontal ? "─" : "│"
  }
}
