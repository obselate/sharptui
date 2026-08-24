package SharpTui

import System

/// Selects how RGB and indexed colors are serialized to the terminal.
public enum TerminalColorMode { Auto; TrueColor; Palette256; Palette16 }

/// The sixteen colors provided by the base ANSI terminal palette.
public enum AnsiColor {
  Black = 0;
  Red = 1;
  Green = 2;
  Yellow = 3;
  Blue = 4;
  Magenta = 5;
  Cyan = 6;
  White = 7;
  BrightBlack = 8;
  BrightRed = 9;
  BrightGreen = 10;
  BrightYellow = 11;
  BrightBlue = 12;
  BrightMagenta = 13;
  BrightCyan = 14;
  BrightWhite = 15;
}

/// Specifies an RGB color or a named style-resolution state.
public struct Color : IEquatable[Color] {
  private var packed int32

  /// Reports whether this color inherits from its parent style.
  public prop IsInherited bool -> packed == -1
  /// Reports whether this color uses the terminal-configured default.
  public prop IsTerminalDefault bool -> packed == -2
  /// Reports whether this color refers to the terminal's indexed palette.
  public prop IsIndexed bool -> packed >= 0x01000000 && packed < 0x01000100
  /// Returns the terminal palette index, or negative one when this is not an indexed color.
  public prop IndexedValue int32 -> IsIndexed ? packed - 0x01000000 : -1

  internal prop Packed int32 -> packed

  /// Tests whether another color has the same RGB or style-resolution value.
  /// @param other The color to compare against.
  /// @returns True when both colors have the same packed value.
  public func Equals(other Color) bool -> packed == other.packed

  shared {
    /// Creates an RGB color from exactly six hexadecimal digits.
    /// @param hex Six hexadecimal digits, no leading # or prefix.
    /// @returns The RGB color packed from the parsed digits.
    public func Rgb(hex string) Color {
      if hex.Length != 6 {
        throw ArgumentException("RGB color must contain exactly six hexadecimal digits.", "hex")
      }

      var value = 0
      for i in 0 ... 6 {
        let digit = hexDigit(hex[i])
        if digit < 0 {
          throw ArgumentException("RGB color must contain exactly six hexadecimal digits.", "hex")
        }
        value = (value << 4) | digit
      }
      return Color{ packed: value }
    }

    /// Creates an RGB color from three channel values.
    /// @param red The red channel, from 0 to 255.
    /// @param green The green channel, from 0 to 255.
    /// @param blue The blue channel, from 0 to 255.
    /// @returns The RGB color packed from the three channels.
    public func Rgb(red int32, green int32, blue int32) Color {
      if red < 0 || red > 255 { throw ArgumentOutOfRangeException("red") }
      if green < 0 || green > 255 { throw ArgumentOutOfRangeException("green") }
      if blue < 0 || blue > 255 { throw ArgumentOutOfRangeException("blue") }
      return Color{ packed: (red << 16) | (green << 8) | blue }
    }

    /// Creates a color from the terminal's 256-entry indexed palette.
    /// @param index The palette index from 0 through 255.
    /// @returns The indexed terminal color.
    public func Indexed(index int32) Color {
      if index < 0 || index > 255 { throw ArgumentOutOfRangeException("index") }
      return Color{ packed: 0x01000000 + index }
    }

    /// Creates a color from the base sixteen-color ANSI palette.
    /// @param color The named ANSI palette color.
    /// @returns The indexed terminal color.
    public func Ansi(color AnsiColor) Color -> Indexed(int32(color))

    /// Uses the parent style's corresponding color.
    public prop Inherit Color -> Color{ packed: -1 }
    /// Uses the terminal-configured default foreground or background.
    public prop TerminalDefault Color -> Color{ packed: -2 }
  }
}

/// Tests two colors for equality.
/// @param left The first color to compare.
/// @param right The second color to compare.
/// @returns True when both colors have the same packed value.
public func (left Color) operator == (right Color) bool -> left.Equals(right)

/// Tests two colors for inequality.
/// @param left The first color to compare.
/// @param right The second color to compare.
/// @returns True when the colors have different packed values.
public func (left Color) operator != (right Color) bool -> !left.Equals(right)

private func hexDigit(value char) int32 {
  if value >= char(48) && value <= char(57) { return int32(value) - 48 }
  if value >= char(65) && value <= char(70) { return int32(value) - 55 }
  if value >= char(97) && value <= char(102) { return int32(value) - 87 }
  return -1
}
