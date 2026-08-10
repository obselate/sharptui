package SharpTui

import System
import System.Collections.Generic
import System.Globalization
import System.Text

internal struct GlyphElements {
  private var Source string

  public init(source string) {
    Source = source
  }

  public func GetEnumerator() GlyphEnumerator {
    return GlyphEnumerator(Source)
  }
}

internal struct GlyphEnumerator {
  private var Source string
  private var Next int32
  public var Current string

  shared {
    private let Singles List[string] = List[string]()

    init {
      for i in 0 ... 128 {
        Singles.Add(char(i).ToString())
      }
    }
  }

  public init(source string) {
    Source = source
    Next = 0
    Current = ""
  }

  public func MoveNext() bool {
    if Next >= Source.Length { return false }

    let start = Next
    let length = StringInfo.GetNextTextElementLength(Source, start)
    Next = start + length

    if start == 0 && length == Source.Length {
      Current = Source
    } else if length == 1 && Source[start] < char(128) {
      Current = Singles[int32(Source[start])]
    } else {
      Current = Source.Substring(start, length)
    }
    return true
  }
}

internal class Glyph {
  shared {
    internal func Clusters(text string) List[string] {
      return CellText.Graphemes(text)
    }

    /// Scans grapheme clusters without allocating a list.
    internal func Elements(text string) GlyphElements {
      return GlyphElements(text)
    }

    /// Display width of one cluster, in terminal cells.
    public func Of(cluster string) int32 {
      if cluster.Length == 0 { return 0 }

      let cp = char.ConvertToUtf32(cluster, 0)

      if Glyph.IsZeroWidth(cp) { return 0 }
      if Glyph.IsWide(cp) { return 2 }
      return 1
    }

    /// Total display width of a whole string.
    public func WidthOf(text string) int32 {
      var total = 0
      for cluster in Glyph.Elements(text) {
        total = total + Glyph.Of(cluster)
      }
      return total
    }

    private func IsZeroWidth(cp int32) bool {
      let cat = CharUnicodeInfo.GetUnicodeCategory(cp)
      return cat == UnicodeCategory.NonSpacingMark
          || cat == UnicodeCategory.EnclosingMark
          || cat == UnicodeCategory.Format
    }

    private func IsWide(cp int32) bool {
      return (cp >= 0x1100 && cp <= 0x115F)
          || (cp >= 0x2E80 && cp <= 0x303E)
          || (cp >= 0x3041 && cp <= 0x33FF)
          || (cp >= 0x3400 && cp <= 0x4DBF)
          || (cp >= 0x4E00 && cp <= 0x9FFF)
          || (cp >= 0xA000 && cp <= 0xA4CF)
          || (cp >= 0xAC00 && cp <= 0xD7A3)
          || (cp >= 0xF900 && cp <= 0xFAFF)
          || (cp >= 0xFE30 && cp <= 0xFE6F)
          || (cp >= 0xFF00 && cp <= 0xFF60)
          || (cp >= 0xFFE0 && cp <= 0xFFE6)
          || (cp >= 0x1F1E6 && cp <= 0x1F1FF)
          || (cp >= 0x1F300 && cp <= 0x1F64F)
          || (cp >= 0x1F900 && cp <= 0x1F9FF)
          || (cp >= 0x20000 && cp <= 0x3FFFD)
    }
  }
}
