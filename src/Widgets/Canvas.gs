package SharpTui

import System
import System.Collections.Generic

/// Selects the subcell packing used by a CanvasSurface.
public enum CanvasMode {
  /// Packs eight dots into each terminal cell.
  Braille;
  /// Packs four quadrants into each terminal cell.
  Quadrant;
  /// Packs the upper and lower halves of each terminal cell.
  HalfBlock;
  /// Uses one subcell per terminal cell.
  Cell
}

/// A retained, packed drawing surface whose styles are stored per terminal cell.
public class CanvasSurface {
  private var widthCells int32
  private var heightRows int32
  private var mode CanvasMode
  private var masks List[int32]
  private var styles List[Style]

  shared {
    private let BrailleGlyphs List[string] = List[string]()

    init {
      for mask in 0 ... 256 {
        BrailleGlyphs.Add(char(0x2800 + mask).ToString())
      }
    }
  }

  /// The number of terminal cells across the surface.
  public prop WidthCells int32 -> widthCells
  /// The number of terminal rows in the surface.
  public prop HeightRows int32 -> heightRows
  /// The packing mode used by the surface.
  public prop Mode CanvasMode -> mode
  /// The horizontal subcell count.
  public prop SubcellWidth int32 -> widthCells * modeWidth()
  /// The vertical subcell count.
  public prop SubcellHeight int32 -> heightRows * modeHeight()

  /// Creates a surface with the given terminal-cell dimensions and packing mode.
  /// @param width The number of terminal cells across the surface.
  /// @param height The number of terminal rows in the surface.
  /// @param mode The subcell packing mode.
  public init(width int32, height int32, mode CanvasMode) {
    widthCells = 0
    heightRows = 0
    this.mode = mode
    masks = List[int32]()
    styles = List[Style]()
    Resize(width, height)
  }

  /// Changes the terminal-cell dimensions and clears the surface.
  /// @param width The new number of terminal cells across the surface.
  /// @param height The new number of terminal rows in the surface.
  public func Resize(width int32, height int32) {
    if width < 0 { throw ArgumentOutOfRangeException("width") }
    if height < 0 { throw ArgumentOutOfRangeException("height") }
    widthCells = width
    heightRows = height
    masks.Clear()
    styles.Clear()
    let count = width * height
    for i in 0 ... count {
      masks.Add(0)
      styles.Add(Style())
    }
  }


  /// Clears every packed subcell and resets its cell style to inherited.
  public func Clear() {
    for i in 0 ... masks.Count {
      masks[i] = 0
      styles[i] = Style()
    }
  }

  /// Clears every packed subcell and sets the retained cell style used by later points.
  /// @param style The style retained for cells written after the clear.
  public func Clear(style Style) {
    for i in 0 ... masks.Count {
      masks[i] = 0
      styles[i] = style
    }
  }

  /// Sets one subcell using inherited style.
  /// @param x The horizontal subcell coordinate.
  /// @param y The vertical subcell coordinate.
  public func Point(x int32, y int32) {
    Point(x, y, Style())
  }

  /// Sets one subcell and retains its terminal-cell style.
  /// @param x The horizontal subcell coordinate.
  /// @param y The vertical subcell coordinate.
  /// @param style The style stored for the affected terminal cell.
  public func Point(x int32, y int32, style Style) {
    if x < 0 || y < 0 || x >= SubcellWidth || y >= SubcellHeight { return }
    let cellX = x / modeWidth()
    let cellY = y / modeHeight()
    let index = cellY * widthCells + cellX
    masks[index] = masks[index] | pointBit(x % modeWidth(), y % modeHeight())
    styles[index] = style
  }

  /// Replaces a terminal cell with independently colored upper and lower halves.
  /// Requires HalfBlock mode. Coordinates outside the surface are ignored.
  /// @param column The horizontal terminal-cell coordinate.
  /// @param row The vertical terminal-cell coordinate, not a subcell coordinate.
  /// @param upper The upper pixel color, encoded as the foreground of an upper-half glyph.
  /// @param lower The lower pixel color, encoded as the cell background.
  public func HalfBlock(column int32, row int32, upper Color, lower Color) {
    if mode != CanvasMode.HalfBlock {
      throw InvalidOperationException("HalfBlock requires a HalfBlock canvas surface.")
    }
    if column < 0 || row < 0 || column >= widthCells || row >= heightRows { return }
    let index = row * widthCells + column
    masks[index] = 1
    styles[index] = Style{ Foreground: upper, Background: lower }
  }

  /// Replaces a terminal cell with the closest two-color encoding of four RGB quadrants.
  /// Requires Quadrant mode. Coordinates outside the surface are ignored.
  /// @param column The horizontal terminal-cell coordinate.
  /// @param row The vertical terminal-cell coordinate, not a subcell coordinate.
  /// @param topLeft The upper-left RGB sample.
  /// @param topRight The upper-right RGB sample.
  /// @param bottomLeft The lower-left RGB sample.
  /// @param bottomRight The lower-right RGB sample.
  public func Quadrant(column int32, row int32, topLeft Color, topRight Color, bottomLeft Color, bottomRight Color) {
    if mode != CanvasMode.Quadrant {
      throw InvalidOperationException("Quadrant requires a Quadrant canvas surface.")
    }
    if column < 0 || row < 0 || column >= widthCells || row >= heightRows { return }
    requireRgb(topLeft, "topLeft")
    requireRgb(topRight, "topRight")
    requireRgb(bottomLeft, "bottomLeft")
    requireRgb(bottomRight, "bottomRight")
    let index = row * widthCells + column
    if topLeft == topRight && topLeft == bottomLeft && topLeft == bottomRight {
      masks[index] = 0
      styles[index] = Style{ Foreground: topLeft, Background: topLeft }
      return
    }
    var bestMask = 1
    var bestForeground = quadrantMean(1, true, topLeft, topRight, bottomLeft, bottomRight)
    var bestBackground = quadrantMean(1, false, topLeft, topRight, bottomLeft, bottomRight)
    var bestError = quadrantError(1, bestForeground, bestBackground,
      topLeft, topRight, bottomLeft, bottomRight)
    for candidate in 2 ... 8 {
      let foreground = quadrantMean(candidate, true, topLeft, topRight, bottomLeft, bottomRight)
      let background = quadrantMean(candidate, false, topLeft, topRight, bottomLeft, bottomRight)
      let error = quadrantError(candidate, foreground, background,
        topLeft, topRight, bottomLeft, bottomRight)
      if error < bestError {
        bestMask = candidate
        bestForeground = foreground
        bestBackground = background
        bestError = error
      }
    }
    masks[index] = bestMask
    styles[index] = Style{ Foreground: bestForeground, Background: bestBackground }
  }

  /// Replaces a terminal cell with a packed Braille dot mask and two colors.
  /// Requires Braille mode. Coordinates outside the surface are ignored.
  /// @param column The horizontal terminal-cell coordinate.
  /// @param row The vertical terminal-cell coordinate, not a subcell coordinate.
  /// @param dots The Braille dot mask, from 0 through 255.
  /// @param foreground The color used by set dots.
  /// @param background The color used behind unset dots.
  public func BrailleCell(column int32, row int32, dots int32, foreground Color, background Color) {
    if mode != CanvasMode.Braille {
      throw InvalidOperationException("BrailleCell requires a Braille canvas surface.")
    }
    if dots < 0 || dots > 255 { throw ArgumentOutOfRangeException("dots") }
    if column < 0 || row < 0 || column >= widthCells || row >= heightRows { return }
    let index = row * widthCells + column
    masks[index] = dots
    styles[index] = Style{ Foreground: foreground, Background: background }
  }

  /// Draws a clipped Bresenham line in subcell coordinates.
  /// @param x0 The starting horizontal subcell coordinate.
  /// @param y0 The starting vertical subcell coordinate.
  /// @param x1 The ending horizontal subcell coordinate.
  /// @param y1 The ending vertical subcell coordinate.
  public func Line(x0 int32, y0 int32, x1 int32, y1 int32) {
    Line(x0, y0, x1, y1, Style())
  }

  /// Draws a clipped Bresenham line in subcell coordinates.
  /// @param x0 The starting horizontal subcell coordinate.
  /// @param y0 The starting vertical subcell coordinate.
  /// @param x1 The ending horizontal subcell coordinate.
  /// @param y1 The ending vertical subcell coordinate.
  /// @param style The style stored for the affected terminal cells.
  public func Line(x0 int32, y0 int32, x1 int32, y1 int32, style Style) {
    var x = x0
    var y = y0
    let dx = abs(x1 - x0)
    let sx = x0 < x1 ? 1 : -1
    let dy = -abs(y1 - y0)
    let sy = y0 < y1 ? 1 : -1
    var error = dx + dy
    while true {
      Point(x, y, style)
      if x == x1 && y == y1 { break }
      let twice = error * 2
      if twice >= dy {
        error = error + dy
        x = x + sx
      }
      if twice <= dx {
        error = error + dx
        y = y + sy
      }
    }
  }
  /// Draws connected clipped line segments through the given subcell points.
  /// @param points The ordered vertices of the polyline.
  /// @param style The style stored for the affected terminal cells.
  public func Polyline(points List[CellPoint], style Style) {
    if points.Count < 2 { return }
    var i = 1
    while i < points.Count {
      let from = points[i - 1]
      let to = points[i]
      Line(from.Column, from.Row, to.Column, to.Row, style)
      i = i + 1
    }
  }


  /// Draws a clipped rectangle outline in subcell coordinates.
  /// @param x The left subcell coordinate.
  /// @param y The top subcell coordinate.
  /// @param width The rectangle width in subcells.
  /// @param height The rectangle height in subcells.
  public func Rect(x int32, y int32, width int32, height int32) {
    Rect(x, y, width, height, Style())
  }

  /// Draws a clipped rectangle outline in subcell coordinates.
  /// @param x The left subcell coordinate.
  /// @param y The top subcell coordinate.
  /// @param width The rectangle width in subcells.
  /// @param height The rectangle height in subcells.
  /// @param style The style stored for the affected terminal cells.
  public func Rect(x int32, y int32, width int32, height int32, style Style) {
    if width <= 0 || height <= 0 { return }
    Line(x, y, x + width - 1, y, style)
    Line(x, y + height - 1, x + width - 1, y + height - 1, style)
    if height > 2 {
      Line(x, y + 1, x, y + height - 2, style)
      Line(x + width - 1, y + 1, x + width - 1, y + height - 2, style)
    }
  }

  /// Fills a clipped rectangle in subcell coordinates.
  /// @param x The left subcell coordinate.
  /// @param y The top subcell coordinate.
  /// @param width The rectangle width in subcells.
  /// @param height The rectangle height in subcells.
  public func Fill(x int32, y int32, width int32, height int32) {
    Fill(x, y, width, height, Style())
  }

  /// Fills a clipped rectangle in subcell coordinates.
  /// @param x The left subcell coordinate.
  /// @param y The top subcell coordinate.
  /// @param width The rectangle width in subcells.
  /// @param height The rectangle height in subcells.
  /// @param style The style stored for the affected terminal cells.
  public func Fill(x int32, y int32, width int32, height int32, style Style) {
    if width <= 0 || height <= 0 { return }
    var firstRow = y
    var lastRow = y + height
    var firstColumn = x
    var lastColumn = x + width
    if firstRow < 0 { firstRow = 0 }
    if firstColumn < 0 { firstColumn = 0 }
    if lastRow > SubcellHeight { lastRow = SubcellHeight }
    if lastColumn > SubcellWidth { lastColumn = SubcellWidth }
    var row = firstRow
    while row < lastRow {
      var column = firstColumn
      while column < lastColumn {
        Point(column, row, style)
        column = column + 1
      }
      row = row + 1
    }
  }

  /// Draws a filled clipped circle in subcell coordinates.
  /// @param cx The circle center's horizontal subcell coordinate.
  /// @param cy The circle center's vertical subcell coordinate.
  /// @param radius The circle radius in subcells.
  public func FillCircle(cx int32, cy int32, radius int32) {
    FillCircle(cx, cy, radius, Style())
  }

  /// Draws a filled clipped circle in subcell coordinates.
  /// @param cx The circle center's horizontal subcell coordinate.
  /// @param cy The circle center's vertical subcell coordinate.
  /// @param radius The circle radius in subcells.
  /// @param style The style stored for the affected terminal cells.
  public func FillCircle(cx int32, cy int32, radius int32, style Style) {
    if radius < 0 { return }
    var y = -radius
    while y <= radius {
      var x = -radius
      while x <= radius {
        if x * x + y * y <= radius * radius { Point(cx + x, cy + y, style) }
        x = x + 1
      }
      y = y + 1
    }
  }

  /// Draws a clipped midpoint circle in subcell coordinates.
  /// @param cx The circle center's horizontal subcell coordinate.
  /// @param cy The circle center's vertical subcell coordinate.
  /// @param radius The circle radius in subcells.
  public func Circle(cx int32, cy int32, radius int32) {
    Circle(cx, cy, radius, Style())
  }

  /// Draws a clipped midpoint circle in subcell coordinates.
  /// @param cx The circle center's horizontal subcell coordinate.
  /// @param cy The circle center's vertical subcell coordinate.
  /// @param radius The circle radius in subcells.
  /// @param style The style stored for the affected terminal cells.
  public func Circle(cx int32, cy int32, radius int32, style Style) {
    if radius < 0 { return }
    var x = radius
    var y = 0
    var error = 1 - radius
    while x >= y {
      Point(cx + x, cy + y, style)
      Point(cx + y, cy + x, style)
      Point(cx - y, cy + x, style)
      Point(cx - x, cy + y, style)
      Point(cx - x, cy - y, style)
      Point(cx - y, cy - x, style)
      Point(cx + y, cy - x, style)
      Point(cx + x, cy - y, style)
      y = y + 1
      if error < 0 {
        error = error + 2 * y + 1
      } else {
        x = x - 1
        error = error + 2 * (y - x) + 1
      }
    }
  }

  internal func Draw(screen Screen, bounds CellRect, inherited Style) {
    var rows = heightRows
    if rows > bounds.HeightRows { rows = bounds.HeightRows }
    var columns = widthCells
    if columns > bounds.WidthCells { columns = bounds.WidthCells }
    if rows <= 0 || columns <= 0 { return }
    var row = 0
    while row < rows {
      var column = 0
      while column < columns {
        let index = row * widthCells + column
        let glyph = glyph(masks[index])
        let cellStyle = styles[index].MergedOver(inherited)
        screen.WriteCell(bounds.Column + column, bounds.Row + row, glyph, cellStyle)
        column = column + 1
      }
      row = row + 1
    }
  }

  private func modeWidth() int32 -> mode == CanvasMode.Braille || mode == CanvasMode.Quadrant ? 2 : 1

  private func modeHeight() int32 {
    if mode == CanvasMode.Braille { return 4 }
    if mode == CanvasMode.Quadrant || mode == CanvasMode.HalfBlock { return 2 }
    return 1
  }

  private func pointBit(x int32, y int32) int32 {
    if mode == CanvasMode.Braille {
      if x == 0 && y == 0 { return 1 }
      if x == 0 && y == 1 { return 2 }
      if x == 0 && y == 2 { return 4 }
      if x == 1 && y == 0 { return 8 }
      if x == 1 && y == 1 { return 16 }
      if x == 1 && y == 2 { return 32 }
      if x == 0 && y == 3 { return 64 }
      return 128
    }
    if mode == CanvasMode.Quadrant {
      if x == 0 && y == 0 { return 1 }
      if x == 1 && y == 0 { return 2 }
      if x == 0 && y == 1 { return 4 }
      return 8
    }
    return y == 0 ? 1 : 2
  }

  private func glyph(mask int32) string {
    if mask == 0 { return " " }
    if mode == CanvasMode.Braille { return BrailleGlyphs[mask] }
    if mode == CanvasMode.Quadrant {
      if mask == 1 { return "▘" }
      if mask == 2 { return "▝" }
      if mask == 3 { return "▀" }
      if mask == 4 { return "▖" }
      if mask == 5 { return "▌" }
      if mask == 6 { return "▞" }
      if mask == 7 { return "▛" }
      if mask == 8 { return "▗" }
      if mask == 9 { return "▚" }
      if mask == 10 { return "▐" }
      if mask == 11 { return "▜" }
      if mask == 12 { return "▄" }
      if mask == 13 { return "▙" }
      if mask == 14 { return "▟" }
      return "█"
    }
    if mode == CanvasMode.HalfBlock { return mask == 1 ? "▀" : mask == 2 ? "▄" : "█" }
    return "█"
  }

  private func requireRgb(color Color, name string) {
    if color.Packed < 0 || color.Packed > 0x00ffffff {
      throw ArgumentException("Quadrant colors must be RGB colors.", name)
    }
  }

  private func quadrantMean(mask int32, foreground bool, topLeft Color, topRight Color,
      bottomLeft Color, bottomRight Color) Color {
    var red = 0
    var green = 0
    var blue = 0
    var count = 0
    for position in 0 ... 4 {
      let selected = (mask & (1 << position)) != 0
      if selected == foreground {
        let packed = quadrantColor(position, topLeft, topRight, bottomLeft, bottomRight).Packed
        red = red + ((packed >> 16) & 255)
        green = green + ((packed >> 8) & 255)
        blue = blue + (packed & 255)
        count = count + 1
      }
    }
    return Color.Rgb((red + count / 2) / count, (green + count / 2) / count, (blue + count / 2) / count)
  }

  private func quadrantError(mask int32, foreground Color, background Color, topLeft Color,
      topRight Color, bottomLeft Color, bottomRight Color) int32 {
    var error = 0
    for position in 0 ... 4 {
      let sample = quadrantColor(position, topLeft, topRight, bottomLeft, bottomRight).Packed
      let mean = ((mask & (1 << position)) != 0 ? foreground : background).Packed
      let red = ((sample >> 16) & 255) - ((mean >> 16) & 255)
      let green = ((sample >> 8) & 255) - ((mean >> 8) & 255)
      let blue = (sample & 255) - (mean & 255)
      error = error + red * red + green * green + blue * blue
    }
    return error
  }

  private func quadrantColor(position int32, topLeft Color, topRight Color,
      bottomLeft Color, bottomRight Color) Color {
    if position == 0 { return topLeft }
    if position == 1 { return topRight }
    if position == 2 { return bottomLeft }
    return bottomRight
  }

  private func abs(value int32) int32 -> value < 0 ? -value : value
}

/// Displays a retained CanvasSurface as ordinary terminal cells.
public open class CanvasView : Box {
  private var surface CanvasSurface

  /// The retained surface painted by this view.
  public prop Surface CanvasSurface {
    get -> surface
    set -> surface = value
  }

  /// Creates a one-cell cell-mode canvas.
  public init() {
    surface = CanvasSurface(1, 1, CanvasMode.Cell)
  }

  /// Creates a view for the given retained surface.
  /// @param surface The retained surface to display.
  public init(surface CanvasSurface) {
    this.surface = surface
  }

  /// Creates a view with an internally owned surface.
  /// @param width The number of terminal cells across the surface.
  /// @param height The number of terminal rows in the surface.
  /// @param mode The subcell packing mode.
  public init(width int32, height int32, mode CanvasMode) {
    surface = CanvasSurface(width, height, mode)
  }

  /// Always true, so an auto-sized canvas measures from its surface.
  protected override prop MeasuresIntrinsic bool -> true

  /// Reports the surface's terminal-cell dimensions.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    return CellSize{ WidthCells: surface.WidthCells, HeightRows: surface.HeightRows }
  }

  /// Paints the retained surface; subclasses may call base.Render before drawing clipped overlays.
  protected open override func Render(screen Screen, bounds CellRect, style Style) {
    surface.Draw(screen, bounds, style)
  }
}
