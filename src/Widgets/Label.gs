package SharpTui

import System

/// Horizontal placement of content within its box.
public enum HorizontalAlignment { Left, Center, Right }

/// A single line of text, clipped to its box.
public open class Label : Box {
  private var text string
  private var alignment HorizontalAlignment
  private var textWidth int32

  /// The text to display.
  public prop Text string {
    get -> text
    set {
      if text == value { return }
      text = value
      rebuild()
    }
  }

  /// How Text is positioned within the box when the box is wider than the text.
  public prop Alignment HorizontalAlignment {
    get -> alignment
    set -> alignment = value
  }

  /// Creates an empty, left-aligned label.
  public init() {
    text = ""
    alignment = HorizontalAlignment.Left
    textWidth = 0
  }

  /// Enables intrinsic sizing so MeasureIntrinsic determines the auto width.
  protected override prop MeasuresIntrinsic bool -> true

  /// Measures an auto width as the cell width of Text.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    var width = Width.IsAuto ? textWidth : Width.CellCount
    if Width.IsAuto && availableWidth != nil && width > availableWidth!! {
      width = availableWidth
    }
    return CellSize{ WidthCells: width, HeightRows: 1 }
  }

  /// Paints Text on a single row, positioned by Alignment and clipped to the box width.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.HeightRows <= 0 { return }
    let w = textWidth
    var x = 0
    if Alignment == HorizontalAlignment.Center { x = (r.WidthCells - w) / 2 }
    if Alignment == HorizontalAlignment.Right { x = r.WidthCells - w }
    if x < 0 { x = 0 }
    screen.WriteClipped(r, x, 0, text, ink)
  }

  private func rebuild() {
    MarkMeasureDirty()
    textWidth = Glyph.WidthOf(text)
  }
}
