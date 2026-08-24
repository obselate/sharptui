package SharpTui

import System
import System.Collections.Generic
import System.Text

/// Text attribute bits that can be combined on a Style.
@Flags
public enum TextAttributes {
  None = 0;
  Bold = 1;
  Dim = 2;
  Italic = 4;
  Underline = 8;
  Reverse = 16;
  Strikethrough = 32;
}

/// A foreground color, background color, and text attributes.
public struct Style {
  private var foreground Color
  private var background Color
  private var attributes TextAttributes

  /// The text color.
  public prop Foreground Color {
    get -> foreground
    init -> foreground = value
  }

  /// The fill color behind the text.
  public prop Background Color {
    get -> background
    init -> background = value
  }

  /// The bold, dim, italic, underline, reverse, and strikethrough bits applied to the text.
  public prop Attributes TextAttributes {
    get -> attributes
    init -> attributes = value
  }

  /// Creates a style that inherits its foreground, background, and attributes from its parent.
  public init() {
    foreground = Color.Inherit
    background = Color.Inherit
    attributes = TextAttributes.None
  }

  /// Returns this style with additional text attributes.
  /// @param bits The attribute bits to add, combined with the existing attributes.
  /// @returns A new style with the combined attributes.
  public func WithAttributes(bits TextAttributes) Style {
    return Style{
      Foreground: foreground,
      Background: background,
      Attributes: TextAttributes(int32(attributes) | int32(bits)),
    }
  }

  /// Returns this style with a different foreground color.
  /// @param color The new foreground color.
  /// @returns A new style with the given foreground color.
  public func WithForeground(color Color) Style {
    return Style{ Foreground: color, Background: background, Attributes: attributes }
  }

  /// Returns this style with a different background color.
  /// @param color The new background color.
  /// @returns A new style with the given background color.
  public func WithBackground(color Color) Style {
    return Style{ Foreground: foreground, Background: color, Attributes: attributes }
  }

  /// Returns this style with foreground and background swapped.
  /// @returns A new style with foreground and background exchanged.
  public func Inverted() Style -> Style{ Foreground: background, Background: foreground, Attributes: attributes }

  /// Merges this style over inherited: this style's explicit Foreground/Background win, IsInherited falls back to inherited, and Attributes combine with OR.
  /// @param inherited The style to fall back to.
  /// @returns The merged style.
  internal func MergedOver(inherited Style) Style {
    return Style{
      Foreground: foreground.IsInherited ? inherited.Foreground : foreground,
      Background: background.IsInherited ? inherited.Background : background,
      Attributes: TextAttributes(int32(inherited.Attributes) | int32(attributes)),
    }
  }

}

internal struct Cell {
  var Glyph int32
  var Fg int32
  var Bg int32
  var Attr int32
  var Link int32
}

/// A double-buffered terminal cell grid; draw calls stage into the back buffer and Flush emits only the cells that changed since the front buffer.
public class Screen {
  private var width int32
  private var height int32
  private var defaultStyle Style
  private var colorMode TerminalColorMode
  private var hyperlinksEnabled bool

  /// The screen dimensions measured in terminal cells and rows.
  public prop Size CellSize {
    get -> CellSize{ WidthCells: width, HeightRows: height }
  }

  /// The style used by draw calls that do not receive an explicit style.
  public prop DefaultStyle Style {
    get -> defaultStyle
    set -> defaultStyle = value
  }

  /// The terminal color encoding used by Flush and terminal presentation.
  public prop ColorMode TerminalColorMode {
    get -> colorMode
    set {
      let resolved = TerminalColors.Resolve(value)
      if colorMode == resolved { return }
      colorMode = resolved
      Invalidate()
    }
  }

  /// Whether semantic TextRun hyperlinks are emitted with OSC 8.
  public prop HyperlinksEnabled bool {
    get -> hyperlinksEnabled
    set {
      if hyperlinksEnabled == value { return }
      hyperlinksEnabled = value
      Invalidate()
    }
  }

  private var back List[Cell]
  private var front List[Cell]
  private var glyphs GlyphCache
  private var links HyperlinkCache
  private var compatibility TerminalBuffer?

  /// Creates a screen of the given size in cells, with the terminal-configured default style.
  /// @param width The screen width in terminal cells.
  /// @param height The screen height in terminal rows.
  public init(width int32, height int32) {
    this.width = width
    this.height = height
    defaultStyle = Style{
      Foreground: Color.TerminalDefault,
      Background: Color.TerminalDefault,
      Attributes: TextAttributes.None,
    }
    colorMode = TerminalColorMode.TrueColor
    hyperlinksEnabled = true
    back = List[Cell]()
    front = List[Cell]()
    glyphs = GlyphCache()
    links = HyperlinkCache()
    compatibility = nil
    resize(width, height)
  }

  /// Resizes and forces a full repaint on the next Flush.
  internal func Resize(width int32, height int32) {
    if width == this.width && height == this.height { return }
    resize(width, height)
  }

  private func resize(width int32, height int32) {
    this.width = width
    this.height = height
    back.Clear()
    front.Clear()
    let count = width * height
    for i in 0 ... count {
      back.Add(blank())
      front.Add(invalid())
    }
    if glyphs.Count() > glyphs.Limit(width, height) { glyphs.Clear() }
  }

  /// Forgets what the terminal is showing before the next renderer pass.
  internal func Invalidate() {
    for i in 0 ... front.Count {
      front[i] = invalid()
    }
  }

  /// Fills the whole screen with blank cells in the default style.
  public func Clear() {
    Clear(DefaultStyle)
  }

  /// Fills the whole screen with blank cells in the given style.
  /// @param s The style whose background and attributes are applied to every cell.
  public func Clear(s Style) {
    let resolved = resolveStyle(s)
    for i in 0 ... back.Count {
      var c = blank()
      c.Bg = resolved.Background.Packed
      c.Attr = int32(resolved.Attributes)
      back[i] = c
    }
  }

  /// Writes one grapheme cluster at a cell in the default style. Out-of-bounds coordinates are ignored.
  /// @param x The zero-based column of the cell.
  /// @param y The zero-based row of the cell.
  /// @param text The grapheme cluster to write.
  public func WriteCell(x int32, y int32, text string) {
    WriteCell(x, y, text, DefaultStyle)
  }

  /// Writes one grapheme cluster at a cell in the given style. Out-of-bounds coordinates are ignored.
  /// @param x The zero-based column of the cell.
  /// @param y The zero-based row of the cell.
  /// @param text The grapheme cluster to write.
  /// @param s The style to apply to the cell.
  public func WriteCell(x int32, y int32, text string, s Style) {
    if x < 0 || y < 0 || x >= width || y >= height { return }
    stage(x, y, resolve(text), resolveStyle(s))
  }

  private func control(c char) bool -> c < char(32) || (c >= char(127) && c <= char(159))

  /// Draws a string starting at x, advancing by display width.
  /// @param x The zero-based starting column.
  /// @param y The zero-based row.
  /// @param text The text to draw.
  /// @returns The column just past the last cell written.
  public func Write(x int32, y int32, text string) int32 -> Write(x, y, text, DefaultStyle)

  /// Returns the column just past the last cell written.
  /// @param x The zero-based starting column.
  /// @param y The zero-based row.
  /// @param text The text to draw.
  /// @param s The style to apply.
  /// @returns The column just past the last cell written.
  public func Write(x int32, y int32, text string, s Style) int32 {
    let resolved = resolveStyle(s)
    var col = x
    for cluster in Glyph.Elements(text) {
      let glyph = resolve(cluster)
      stage(col, y, glyph, resolved)
      col = col + glyphs.Width(glyph)
    }
    return col
  }

  /// Draws one styled text run, including its semantic hyperlink target.
  /// @param x The zero-based starting column.
  /// @param y The zero-based row.
  /// @param run The styled text and optional hyperlink target to draw.
  /// @returns The column just past the last cell written.
  public func Write(x int32, y int32, run TextRun) int32 {
    let resolved = resolveStyle(run.Style)
    let link = links.Resolve(run.Hyperlink)
    var col = x
    for cluster in Glyph.Elements(run.Text) {
      let glyph = resolve(cluster)
      stage(col, y, glyph, resolved, link)
      col = col + glyphs.Width(glyph)
    }
    return col
  }

  private func border(x int32, y int32, w int32, h int32, s Style) {
    if w < 2 || h < 2 { return }
    let resolved = resolveStyle(s)
    let right = x + w - 1
    let bottom = y + h - 1

    stage(x, y, resolve("┌"), resolved)
    stage(right, y, resolve("┐"), resolved)
    stage(x, bottom, resolve("└"), resolved)
    stage(right, bottom, resolve("┘"), resolved)

    for i in x + 1 ... right {
      stage(i, y, resolve("─"), resolved)
      stage(i, bottom, resolve("─"), resolved)
    }
    for j in y + 1 ... bottom {
      stage(x, j, resolve("│"), resolved)
      stage(right, j, resolve("│"), resolved)
    }
  }

  /// Fills a cell rectangle with a background color.
  /// @param r The cell rectangle to fill.
  /// @param s The style whose background color is applied.
  public func Fill(r CellRect, s Style) {
    let resolved = resolveStyle(s)
    let fill = Style{
      Foreground: Color.TerminalDefault,
      Background: resolved.Background,
      Attributes: resolved.Attributes,
    }
    for j in r.Row ... r.Row + r.HeightRows {
      for i in r.Column ... r.Column + r.WidthCells {
        stage(i, j, resolve(" "), fill)
      }
    }
  }

  internal func DimOutside(bounds CellRect) {
    var row = 0
    while row < height {
      var column = 0
      while column < width {
        if !bounds.Contains(column, row) {
          let index = row * width + column
          var cell = back[index]
          cell.Attr = cell.Attr | int32(TextAttributes.Dim)
          back[index] = cell
        }
        column = column + 1
      }
      row = row + 1
    }
  }

  /// Draws text inside a cell rectangle and clips it at both horizontal edges.
  /// @param r The cell rectangle to draw within.
  /// @param dx The column offset from the rectangle's left edge.
  /// @param dy The row offset from the rectangle's top edge.
  /// @param text The text to draw.
  public func WriteClipped(r CellRect, dx int32, dy int32, text string) {
    WriteClipped(r, dx, dy, text, DefaultStyle)
  }

  /// Draws text inside a cell rectangle in the given style and clips it at both horizontal edges.
  /// @param r The cell rectangle to draw within.
  /// @param dx The column offset from the rectangle's left edge.
  /// @param dy The row offset from the rectangle's top edge.
  /// @param text The text to draw.
  /// @param s The style to apply to the text.
  public func WriteClipped(r CellRect, dx int32, dy int32, text string, s Style) {
    if dy < 0 || dy >= r.HeightRows { return }
    let resolved = resolveStyle(s)
    var col = r.Column + dx
    let start = r.Column
    let limit = r.Column + r.WidthCells
    for cluster in Glyph.Elements(text) {
      let glyph = resolve(cluster)
      let w = glyphs.Width(glyph)
      if col + w <= start {
        col = col + w
        continue
      }
      if col < start {
        stage(start, r.Row + dy, resolve(" "), resolved)
        col = start + 1
        continue
      }
      if col + w > limit { return }
      stage(col, r.Row + dy, glyph, resolved)
      col = col + w
    }
  }

  /// Draws one styled text run inside a cell rectangle and clips it at both horizontal edges.
  /// @param r The cell rectangle to draw within.
  /// @param dx The column offset from the rectangle's left edge.
  /// @param dy The row offset from the rectangle's top edge.
  /// @param run The styled text and optional hyperlink target to draw.
  public func WriteClipped(r CellRect, dx int32, dy int32, run TextRun) {
    if dy < 0 || dy >= r.HeightRows { return }
    let resolved = resolveStyle(run.Style)
    let link = links.Resolve(run.Hyperlink)
    var col = r.Column + dx
    let start = r.Column
    let limit = r.Column + r.WidthCells
    for cluster in Glyph.Elements(run.Text) {
      let glyph = resolve(cluster)
      let width = glyphs.Width(glyph)
      if col + width <= start {
        col = col + width
        continue
      }
      if col < start {
        stage(start, r.Row + dy, resolve(" "), resolved, link)
        col = start + 1
        continue
      }
      if col + width > limit { return }
      stage(col, r.Row + dy, glyph, resolved, link)
      col = col + width
    }
  }

  internal func WriteClippedRange(r CellRect, dx int32, dy int32, text string,
    fromGrapheme int32, toGrapheme int32, skipCells int32, s Style) {
    writeClippedRange(r, dx, dy, text, fromGrapheme, toGrapheme, skipCells, s, 0)
  }

  internal func WriteClippedRange(r CellRect, dx int32, dy int32, run TextRun,
      fromGrapheme int32, toGrapheme int32, skipCells int32) {
    writeClippedRange(r, dx, dy, run.Text, fromGrapheme, toGrapheme, skipCells,
      run.Style, links.Resolve(run.Hyperlink))
  }

  private func writeClippedRange(r CellRect, dx int32, dy int32, text string,
      fromGrapheme int32, toGrapheme int32, skipCells int32, s Style, link int32) {
    if dy < 0 || dy >= r.HeightRows { return }
    let resolved = resolveStyle(s)
    var col = r.Column + dx
    let limit = r.Column + r.WidthCells
    var index = 0
    var skipped = 0
    for cluster in Glyph.Elements(text) {
      if index >= fromGrapheme {
        if toGrapheme >= 0 && index >= toGrapheme { return }
        let glyph = resolve(cluster)
        let w = glyphs.Width(glyph)
        if skipped < skipCells {
          skipped = skipped + w
          if skipped > skipCells {
            if col >= limit { return }
            stage(col, r.Row + dy, resolve(" "), resolved, link)
            col = col + 1
          }
        } else {
          if col + w > limit { return }
          stage(col, r.Row + dy, glyph, resolved, link)
          col = col + w
        }
      }
      index = index + 1
    }
  }

  /// Draws a border around a cell rectangle.
  /// @param r The cell rectangle to draw the border around.
  /// @param s The style to apply to the border.
  public func DrawBorder(r CellRect, s Style) {
    border(r.Column, r.Row, r.WidthCells, r.HeightRows, s)
  }

  internal func Flush() string {
    if compatibility == nil { compatibility = TerminalBuffer(4096) }
    guard let output = compatibility else { return "" }
    if Emit(output) == 0 { return "" }
    return output.Text()
  }

  internal func Emit(output TerminalBuffer) int32 {
    output.Reset()
    var lastFg = -2
    var lastBg = -2
    var lastAttr = -1
    var lastLink = 0
    var cursorX = -1
    var cursorY = -1
    var wrote = false

    for y in 0 ... height {
      var x = 0
      while x < width {
        let i = y * width + x
        let want = back[i]
        let have = front[i]

        if same(want, have) {
          x = x + 1
          continue
        }

        if !wrote {
          Ansi.AppendSyncOn(output)
          wrote = true
        }
        if cursorX != x || cursorY != y {
          if lastLink != 0 {
            Ansi.AppendHyperlinkEnd(output)
            lastLink = 0
          }
          Ansi.AppendMoveTo(output, x, y)
        }
        let wantLink = hyperlinksEnabled ? want.Link : 0
        if wantLink != lastLink {
          if lastLink != 0 { Ansi.AppendHyperlinkEnd(output) }
          if wantLink != 0 { Ansi.AppendHyperlink(output, wantLink, links.Target(wantLink)) }
          lastLink = wantLink
        }
        if want.Fg != lastFg || want.Bg != lastBg || want.Attr != lastAttr {
          Ansi.AppendStyle(output, want.Fg, want.Bg, want.Attr, colorMode)
          lastFg = want.Fg
          lastBg = want.Bg
          lastAttr = want.Attr
        }

        glyphs.Append(want.Glyph, output)
        front[i] = want

        let w = glyphs.Width(want.Glyph)
        cursorX = x + w
        cursorY = y

        if w > 1 && x + 1 < width {
          front[i + 1] = back[i + 1]
        }
        x = x + (w > 1 ? w : 1)
      }
    }

    if !wrote { return 0 }
    if lastLink != 0 { Ansi.AppendHyperlinkEnd(output) }
    Ansi.AppendReset(output)
    Ansi.AppendSyncOff(output)
    return output.Count()
  }

  internal func Probe(x int32, y int32) string -> glyphs.Text(back[y * width + x].Glyph)

  internal func FrameText() string {
    let output = StringBuilder()
    var y = 0
    while y < height {
      if y > 0 { output.Append(char(10)) }
      var x = 0
      while x < width {
        let cell = back[y * width + x]
        output.Append(glyphs.Text(cell.Glyph))
        if cell.Glyph == GlyphIds.Tail { output.Append(" ") }
        x = x + 1
      }
      y = y + 1
    }
    return output.ToString()
  }

  internal func GlyphIdAt(x int32, y int32) int32 -> back[y * width + x].Glyph

  internal func CachedGlyphs() int32 -> glyphs.Count()

  internal func GlyphLimit() int32 -> glyphs.Limit(width, height)

  private func same(a Cell, b Cell) bool -> a.Glyph == b.Glyph && a.Fg == b.Fg
    && a.Bg == b.Bg && a.Attr == b.Attr && a.Link == b.Link

  private func blank() Cell {
    var c = Cell{}
    c.Glyph = GlyphIds.AsciiFirst
    c.Fg = -1
    c.Bg = -1
    c.Attr = 0
    c.Link = 0
    return c
  }

  private func invalid() Cell {
    var c = Cell{}
    c.Glyph = GlyphIds.AsciiFirst
    c.Fg = -2
    c.Bg = -2
    c.Attr = -1
    c.Link = -1
    return c
  }

  private func resolve(text string) int32 {
    var body = text
    if body.Length > 0 && control(body[0]) { body = " " }

    let existing = glyphs.Find(body)
    if existing >= 0 { return existing }
    if glyphs.Count() >= glyphs.Limit(width, height) {
      compact()
      let retained = glyphs.Find(body)
      if retained >= 0 { return retained }
    }
    return glyphs.Add(body, Glyph.Of(body))
  }

  private func stage(x int32, y int32, glyph int32, s Style) {
    stage(x, y, glyph, s, 0)
  }

  private func stage(x int32, y int32, glyph int32, s Style, link int32) {
    if x < 0 || y < 0 || x >= width || y >= height { return }

    var c = Cell{}
    c.Glyph = glyph
    c.Fg = s.Foreground.Packed
    c.Bg = s.Background.Packed
    c.Attr = int32(s.Attributes)
    c.Link = link
    back[y * width + x] = c

    if glyphs.Width(glyph) == 2 && x + 1 < width {
      var tail = Cell{}
      tail.Glyph = GlyphIds.Tail
      tail.Fg = s.Foreground.Packed
      tail.Bg = s.Background.Packed
      tail.Attr = int32(s.Attributes)
      tail.Link = link
      back[y * width + x + 1] = tail
    }
  }

  private func resolveStyle(s Style) Style {
    let foreground = s.Foreground.IsInherited ? DefaultStyle.Foreground : s.Foreground
    let background = s.Background.IsInherited ? DefaultStyle.Background : s.Background
    return Style{
      Foreground: foreground.IsInherited ? Color.TerminalDefault : foreground,
      Background: background.IsInherited ? Color.TerminalDefault : background,
      Attributes: TextAttributes(int32(DefaultStyle.Attributes) | int32(s.Attributes)),
    }
  }

  private func compact() {
    let replacement = GlyphCache()
    let remap = Dictionary[int32, int32]()

    for i in 0 ... back.Count {
      let old = back[i].Glyph
      if old < GlyphIds.DynamicFirst { continue }

      var next = -1
      if !remap.TryGetValue(old, &next) {
        next = replacement.Adopt(glyphs.Entry(old))
        remap.Add(old, next)
      }

      var cell = back[i]
      cell.Glyph = next
      back[i] = cell
    }

    glyphs = replacement
    Invalidate()
  }
}
