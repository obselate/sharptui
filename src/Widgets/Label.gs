package SharpTui

import System
import System.Collections.Generic

/// Horizontal placement of content within its box.
public enum HorizontalAlignment { Left, Center, Right }

/// A single line of text, clipped to its box.
public open class Label : Box {
  private var text string
  private var alignment HorizontalAlignment
  private var clusters List[string]
  private var textWidth int32

  /// The text to display. Setting it rebuilds the grapheme cluster cache when the value changes.
  public prop Text string {
    get { return text }
    set {
      if text == value { return }
      text = value
      rebuild()
    }
  }

  /// How Text is positioned within the box when the box is wider than the text.
  public prop Alignment HorizontalAlignment {
    get { return alignment }
    set { alignment = value }
  }

  /// Creates an empty, left-aligned label.
  public init() {
    text = ""
    alignment = HorizontalAlignment.Left
    clusters = List[string]()
    textWidth = 0
  }

  /// Enables intrinsic sizing so MeasureIntrinsic determines the auto width.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures an auto width as the cell width of Text.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    let width = Width.IsAuto ? textWidth : Width.CellCount
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
    var i = 0
    var column = x
    while i < clusters.Count {
      let width = Glyph.Of(clusters[i])
      if column + width > r.WidthCells { break }
      screen.WriteCell(r.Column + column, r.Row, clusters[i], ink)
      column = column + width
      i = i + 1
    }
  }

  private func rebuild() {
    clusters.Clear()
    textWidth = 0
    for cluster in Glyph.Elements(text) {
      clusters.Add(cluster)
      textWidth = textWidth + Glyph.Of(cluster)
    }
  }
}
