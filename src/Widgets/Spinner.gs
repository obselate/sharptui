package SharpTui

import System
import System.Collections.Generic

/// An animated frame that advances only when the app calls Advance.
public open class Spinner : Box {
  private var step int32

  /// The sequence of glyphs cycled through as the spinner advances.
  public prop Frames List[string] { get; set; }
  /// The index into Frames currently shown, derived from the number of Advance calls.
  public prop FrameIndex int32 { get { return currentFrameIndex() } }
  /// Text drawn after the frame glyph, separated by one space.
  public prop Text string { get; set; }

  /// Creates a spinner with the default braille frame set and no text.
  public init() {
    Frames = List[string]()
    Frames.Add(char(0x280B).ToString())
    Frames.Add(char(0x2819).ToString())
    Frames.Add(char(0x2839).ToString())
    Frames.Add(char(0x2838).ToString())
    Frames.Add(char(0x283C).ToString())
    Frames.Add(char(0x2834).ToString())
    Frames.Add(char(0x2826).ToString())
    Frames.Add(char(0x2827).ToString())
    Frames.Add(char(0x2807).ToString())
    Frames.Add(char(0x280F).ToString())
    step = 0
    Text = ""
  }

  /// Always true, so this spinner sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the widest frame glyph plus Text, with a one-cell gap when both are present.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    var frameWidth = 0
    for frame in Frames {
      let width = Glyph.WidthOf(frame)
      if width > frameWidth { frameWidth = width }
    }
    let textWidth = Glyph.WidthOf(Text)
    let gap = frameWidth > 0 && textWidth > 0 ? 1 : 0
    return CellSize{ WidthCells: frameWidth + gap + textWidth, HeightRows: 1 }
  }

  /// Paints the current frame glyph followed by Text.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    if r.WidthCells <= 0 || r.HeightRows <= 0 { return }
    let frame = Frames.Count > 0 ? Frames[FrameIndex] : ""
    var x = 0
    if frame != "" {
      screen.WriteClipped(r, x, 0, frame, ink)
      x = x + Glyph.WidthOf(frame)
    }
    if frame != "" && Text != "" {
      screen.WriteClipped(r, x, 0, " ", ink)
      x = x + 1
    }
    screen.WriteClipped(r, x, 0, Text, ink)
  }

  /// Advances to the next frame, wrapping back to the first frame once the internal step counter would overflow.
  public func Advance() {
    if step == Int32.MaxValue { step = 0 }
    else { step = step + 1 }
  }

  private func currentFrameIndex() int32 {
    if Frames.Count == 0 { return 0 }
    return step % Frames.Count
  }
}

/// A filled text pill, drawn with the ink flipped.
public open class Badge : Box {
  /// The label centred within the badge.
  public prop Text string { get; set; }

  /// Creates an empty badge.
  public init() {
    Text = ""
  }

  /// Always true, so this badge sizes itself via MeasureIntrinsic.
  protected override prop MeasuresIntrinsic bool { get { return true } }

  /// Measures the badge as the text width plus one cell of padding on each side.
  /// @param availableWidth The available width in cells, or nil when unconstrained.
  /// @param availableHeight The available height in rows, or nil when unconstrained.
  /// @returns The measured size in cells.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    return CellSize{ WidthCells: Glyph.WidthOf(Text) + 2, HeightRows: 1 }
  }

  /// Paints " Text " with the ink flipped, regardless of focus.
  /// @param screen The screen to paint into.
  /// @param r The rect to paint within.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, r CellRect, ink Style) {
    let style = ink.Inverted()
    screen.WriteClipped(r, 0, 0, " ", style)
    screen.WriteClipped(r, 1, 0, Text, style)
    screen.WriteClipped(r, 1 + Glyph.WidthOf(Text), 0, " ", style)
  }

}
