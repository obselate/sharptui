package SharpTui

import System
import System.Collections.Generic
import System.Text

internal class GlyphIds {
  shared {
    internal let Tail int32 = 0
    internal let AsciiFirst int32 = 1
    internal let AsciiLast int32 = 95
    internal let DynamicFirst int32 = 96
  }
}

internal class GlyphAscii {
  shared {
    internal let Text List[string] = List[string]()

    init {
      for i in 32 ... 127 {
        Text.Add(char(i).ToString())
      }
    }
  }
}

internal struct GlyphEntry {
  var Text string
  var Utf8 []uint8
  var Width int32
}

internal class GlyphCache {
  private var byText Dictionary[string, int32]
  private var entries List[GlyphEntry]

  internal init() {
    byText = Dictionary[string, int32](StringComparer.Ordinal)
    entries = List[GlyphEntry]()
  }

  internal func Find(text string) int32 {
    if text.Length == 0 { return GlyphIds.Tail }
    if ascii(text) { return GlyphIds.AsciiFirst + int32(text[0]) - 32 }

    var id = -1
    if byText.TryGetValue(text, &id) { return id }
    return -1
  }

  internal func Add(text string, width int32) int32 {
    let existing = Find(text)
    if existing >= 0 { return existing }

    var entry = GlyphEntry{}
    entry.Text = text
    entry.Utf8 = Encoding.UTF8.GetBytes(text)
    entry.Width = width
    return Adopt(entry)
  }

  internal func Adopt(entry GlyphEntry) int32 {
    let existing = Find(entry.Text)
    if existing >= 0 { return existing }

    let id = GlyphIds.DynamicFirst + entries.Count
    entries.Add(entry)
    byText.Add(entry.Text, id)
    return id
  }

  internal func Text(id int32) string {
    if id == GlyphIds.Tail { return "" }
    if id <= GlyphIds.AsciiLast { return GlyphAscii.Text[id - GlyphIds.AsciiFirst] }
    return entries[id - GlyphIds.DynamicFirst].Text
  }

  internal func Width(id int32) int32 {
    if id == GlyphIds.Tail { return 1 }
    if id <= GlyphIds.AsciiLast { return 1 }
    return entries[id - GlyphIds.DynamicFirst].Width
  }

  internal func Entry(id int32) GlyphEntry {
    return entries[id - GlyphIds.DynamicFirst]
  }

  internal func Append(id int32, output TerminalBuffer) {
    if id == GlyphIds.Tail {
      output.AppendByte(uint8(32))
      return
    }
    if id <= GlyphIds.AsciiLast {
      output.AppendByte(uint8(id + 31))
      return
    }
    output.AppendBytes(entries[id - GlyphIds.DynamicFirst].Utf8)
  }

  internal func Count() int32 {
    return entries.Count
  }

  internal func Limit(width int32, height int32) int32 {
    let cells = width * height
    return cells > 2048 ? cells * 2 : 4096
  }

  internal func Clear() {
    byText.Clear()
    entries.Clear()
  }

  private func ascii(text string) bool {
    return text.Length == 1 && text[0] >= char(32) && text[0] <= char(126)
  }
}
