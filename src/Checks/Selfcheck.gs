package SharpTui

import SharpTui

import System
import System.Diagnostics
import System.Collections.Generic
import System.IO
import System.Text
import System.Threading

public class Selfcheck {
  shared {
    public func Run() int32 {
      var failed = 0

      failed = failed + Checks.Expect(CellText.MeasureWidth("abc") == 3, "ascii width")
      failed = failed + Checks.Expect(CellText.MeasureWidth("日本語") == 6, "cjk is double width")
      failed = failed + Checks.Expect(CellText.MeasureWidth("é") == 1, "combining mark is zero width")
      failed = failed + Checks.Expect(CellText.Graphemes("é").Count == 1, "combining mark is one cluster")
      failed = failed + Checks.Expect(CellText.MeasureWidth("") == 0, "empty string")

      let flag = char.ConvertFromUtf32(0x1F1EF) + char.ConvertFromUtf32(0x1F1F5)
      failed = failed + Checks.Expect(CellText.Graphemes(flag).Count == 1, "a flag pair is one cluster")
      failed = failed + Checks.Expect(CellText.MeasureWidth(flag) == 2, "a flag pair is two cells wide")

      let scan = Screen(10, 2)
      scan.Write(0, 0, "éx")
      failed = failed + Checks.Expect(scan.Probe(0, 0) == "é", "scanner keeps a combining cluster whole")
      failed = failed + Checks.Expect(scan.Probe(1, 0) == "x", "scanner advances by one cluster")

      let s = Screen(10, 2)
      s.Write(0, 0, "日")
      failed = failed + Checks.Expect(s.Probe(1, 0) == "", "wide cluster reserves its tail cell")

      let raw = Screen(10, 2)
      raw.Write(0, 0, "a" + char(10).ToString() + "b" + char(9).ToString() + "c")
      failed = failed + Checks.Expect(raw.Probe(1, 0) == " ", "a newline becomes a blank cell")
      failed = failed + Checks.Expect(raw.Probe(2, 0) == "b", "and costs exactly one cell")
      failed = failed + Checks.Expect(raw.Probe(3, 0) == " ", "a tab becomes a blank cell")
      failed = failed + Checks.Expect(raw.Probe(4, 0) == "c", "the text after it stays aligned")

      raw.Write(0, 1, char(13).ToString() + char(10).ToString() + "z")
      failed = failed + Checks.Expect(raw.Probe(0, 1) == " ", "CRLF is one cluster and still blanked")
      failed = failed + Checks.Expect(raw.Probe(1, 1) == "z", "CRLF costs one cell, not two")

      raw.Write(6, 1, char(27).ToString() + char(0x9B).ToString())
      failed = failed + Checks.Expect(raw.Probe(6, 1) == " ", "an escape never reaches the buffer")
      failed = failed + Checks.Expect(raw.Probe(7, 1) == " ", "a C1 control is blanked too")

      let envelope = Ansi.SyncOn.Length + Ansi.SyncOff.Length + Ansi.Reset.Length

      let firstOut = s.Flush()
      let first = firstOut.Length - envelope
      failed = failed + Checks.Expect(first > 0, "first flush paints")
      failed = failed + Checks.Expect(firstOut.StartsWith(Ansi.SyncOn), "flush starts synchronized output")
      failed = failed + Checks.Expect(firstOut.EndsWith(Ansi.Reset + Ansi.SyncOff),
        "flush resets style before synchronized output ends")
      failed = failed + Checks.Expect(s.Flush().Length == 0, "clean reflush is a no-op")

      s.Write(3, 1, "x")
      let second = s.Flush().Length - envelope
      failed = failed + Checks.Expect(second > 0, "dirty cell repaints")
      failed = failed + Checks.Expect(second < first / 2, "dirty cell repaints only itself")

      let side = Box{ Width: CellLength.Cells(20) }
      let mid = Box{ GrowWeight: 1 }
      let right = Box{ GrowWeight: 1 }
      let root = Row{ GapCells: 1, Children: { side, mid, right } }
      root.Compute(80, 24)

      failed = failed + Checks.Expect(side.Bounds.WidthCells == 20, "fixed width honored")
      failed = failed + Checks.Expect(side.Bounds.HeightRows == 24, "cross axis stretches")
      failed = failed + Checks.Expect(mid.Bounds.Column == 21, "gap consumes one cell")
      failed = failed + Checks.Expect(mid.Bounds.WidthCells == 29 && right.Bounds.WidthCells == 29, "grow splits the remainder")
      failed = failed + Checks.Expect(right.Bounds.Column == 51, "second gap consumes one cell")
      failed = failed + Checks.Expect(right.Bounds.Column + right.Bounds.WidthCells == 80, "row fills the width exactly")

      root.Compute(81, 24)
      failed = failed + Checks.Expect(mid.Bounds.Column + mid.Bounds.WidthCells + 1 == right.Bounds.Column,
        "odd remainder still tiles without a seam")
      failed = failed + Checks.Expect(right.Bounds.Column + right.Bounds.WidthCells == 81,
        "odd remainder still fills the width")

      let clip = Screen(20, 3)
      let box = CellRect{ Column: 2, Row: 0, WidthCells: 5, HeightRows: 1 }
      clip.WriteClipped(box, 0, 0, "abcdefghij")
      failed = failed + Checks.Expect(clip.Probe(6, 0) == "e", "clipped text fills its rect")
      failed = failed + Checks.Expect(clip.Probe(7, 0) == " ", "clipped text stops at the edge")

      clip.WriteClipped(box, 4, 0, "日")
      failed = failed + Checks.Expect(clip.Probe(6, 0) == "e", "half-fitting wide cluster is dropped")

      let wrapped = CellText.Wrap("hello world foo", 10)
      failed = failed + Checks.Expect(wrapped.Count == 2, "wrap breaks at the space")
      failed = failed + Checks.Expect(wrapped[0] == "hello", "wrap keeps whole words")
      failed = failed + Checks.Expect(wrapped[1] == "world foo", "wrap fills the next line")
      let hard = CellText.Wrap("abcdefgh", 5)
      failed = failed + Checks.Expect(hard.Count == 2 && hard[0] == "abcde", "an overlong word breaks")
      let wide = CellText.Wrap("日本語", 4)
      failed = failed + Checks.Expect(wide[0] == "日本", "wrap never splits a wide cluster")

      let list = ListView()
      for n in 0 ... 100 {
        list.Add("item " + n.ToString())
      }
      let pane = Box{ ShowBorder: true, Title: "items", Children: { list } }
      let rows = Screen(22, 14)
      pane.Draw(rows)

      failed = failed + Checks.Expect(list.Bounds.WidthCells == 20, "border insets the child")
      failed = failed + Checks.Expect(list.ContentBounds.HeightRows == 12, "child height is the interior")
      failed = failed + Checks.Expect(rows.Probe(0, 0) == "┌", "the border is drawn")
      failed = failed + Checks.Expect(rows.Probe(2, 0) == "i", "the title sits on the top border")

      let down = UiEvent{ Kind: UiEventKind.Key, Key: Key.Down }
      for n in 0 ... 14 {
        failed = failed + Checks.Expect(pane.Handle(down) == EventResult.Handled, "the tree routes the arrow to the list")
      }
      failed = failed + Checks.Expect(list.SelectedIndex == 14, "fourteen downs select item 14")
      failed = failed + Checks.Expect(list.FirstVisibleItemIndex == 3, "window follows the selection by the minimum")

      pane.Draw(rows)
      failed = failed + Checks.Expect(rows.Probe(3, 1) == "i", "the top row is the scrolled-to item")
      failed = failed + Checks.Expect(rows.Probe(1, 12) == ">", "the selected row carries the marker")

      let click = UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Position: CellPoint{ Column: 5, Row: 3 } }
      failed = failed + Checks.Expect(pane.Handle(click) == EventResult.Handled, "a click inside the rect selects")
      failed = failed + Checks.Expect(list.SelectedIndex == 5, "click maps a screen row back to its item")
      let outsideClick = UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Position: CellPoint{ Column: 5, Row: 40 } }
      failed = failed + Checks.Expect(pane.Handle(outsideClick) == EventResult.Continue, "a click outside the rect is ignored")

      let end = UiEvent{ Kind: UiEventKind.Key, Key: Key.End }
      failed = failed + Checks.Expect(pane.Handle(end) == EventResult.Handled, "End moves to the last item")
      failed = failed + Checks.Expect(list.FirstVisibleItemIndex == 88, "the last window is flush with the end")

      let scrolled = ListView()
      for n in 0 ... 100 {
        scrolled.Add("row " + n.ToString())
      }
      let barred = Box{ ShowBorder: true, ShowScrollbar: true, Children: { scrolled } }
      let barScreen = Screen(20, 12)
      barred.Draw(barScreen)
      let block = char(0x2588).ToString()
      failed = failed + Checks.Expect(barScreen.Probe(19, 1) == block, "the thumb starts at the top")
      failed = failed + Checks.Expect(barScreen.Probe(19, 10) != block, "the thumb is not the whole track")

      scrolled.FirstVisibleItemIndex = 90
      barred.Draw(barScreen)
      failed = failed + Checks.Expect(barScreen.Probe(19, 10) == block, "the thumb follows the scroll to the end")
      failed = failed + Checks.Expect(barScreen.Probe(19, 1) != block, "and leaves the top behind")

      let one = ListView()
      let two = ListView()
      one.Add("a")
      two.Add("b")
      two.Add("c")
      let form = Row{ Children: { one, two } }
      form.Draw(Screen(40, 6))

      let tab = UiEvent{ Kind: UiEventKind.Key, Key: Key.Tab }
      failed = failed + Checks.Expect(form.Handle(tab) == EventResult.Handled, "tab takes focus")
      failed = failed + Checks.Expect(one.IsFocused, "tab focuses the first widget")
      form.Handle(tab)
      failed = failed + Checks.Expect(two.IsFocused && !one.IsFocused, "tab moves on, and only one holds focus")
      form.Handle(tab)
      failed = failed + Checks.Expect(one.IsFocused, "tab wraps around")

      let back = UiEvent{ Kind: UiEventKind.Key, Key: Key.BackTab }
      form.Handle(back)
      failed = failed + Checks.Expect(two.IsFocused, "backtab wraps the other way")

      form.Handle(down)
      failed = failed + Checks.Expect(two.SelectedIndex == 1 && one.SelectedIndex == 0,
        "the arrow goes to the focused widget only")

      let styled = List[TextRun]()
      styled.Add(TextRun("plain ", Style()))
      styled.Add(TextRun("bold", Style{ Attributes: TextAttributes.Bold }))
      styled.Add(TextRun(" tail words here", Style()))
      let flowed = WrapTextRuns(styled, 12)
      failed = failed + Checks.Expect(flowed.Count == 3, "styled text wraps to three lines")
      failed = failed + Checks.Expect(flowed[0].Count == 2, "the first line keeps both runs")
      failed = failed + Checks.Expect(flowed[0][1].Style.Attributes == TextAttributes.Bold, "the bold run stays bold")
      failed = failed + Checks.Expect(TextRunWidth(flowed[0]) <= 12, "no wrapped line overruns the width")
      failed = failed + Checks.Expect(TextRunWidth(flowed[2]) <= 12, "the last line fits too")

      let directStyle = StringBuilder()
      let styleBits = int32(TextAttributes.Bold) | int32(TextAttributes.Dim) | int32(TextAttributes.Italic)
        | int32(TextAttributes.Underline) | int32(TextAttributes.Reverse) | int32(TextAttributes.Strikethrough)
      Ansi.AppendStyle(directStyle, 0x010203, 0xA0B0C0, styleBits)
      let wireEsc = char(27).ToString()
      let expectedStyle = wireEsc + "[0m"
        + wireEsc + "[1m" + wireEsc + "[2m" + wireEsc + "[3m"
        + wireEsc + "[4m" + wireEsc + "[7m" + wireEsc + "[9m"
        + wireEsc + "[38;2;1;2;3m" + wireEsc + "[48;2;160;176;192m"
      failed = failed + Checks.Expect(directStyle.ToString() == expectedStyle,
        "direct ANSI style append emits exact bytes")
      failed = failed + Checks.Expect(Ansi.Style(0x010203, 0xA0B0C0, styleBits) == expectedStyle,
        "ANSI style string API emits exact bytes")
      let styleWire = TerminalBuffer(128)
      Ansi.AppendStyle(styleWire, 0x010203, 0xA0B0C0, styleBits)
      failed = failed + Checks.Expect(styleWire.Text() == expectedStyle,
        "direct ANSI style bytes are exact")

      failed = failed + rendererChecks()

      Environment.SetEnvironmentVariable("SHARPTUI_TRACE", nil)
      Trace.Open()
      Trace.Mark("selfcheck")
      Trace.Close()

      failed = failed + Checks.Widgets()

      if failed == 0 {
        Console.WriteLine("selfcheck: ok")
      }
      return failed
    }

    /// Times a full-screen repaint the exact work a resize forces.
    public func Bench() int32 {
      let w = 200
      let h = 50
      let screen = Screen(w, h)
      screen.DefaultStyle = Style{ Foreground: Color.Rgb("C8CEDA"), Background: Color.Rgb("0E1117") }
      let sw = Stopwatch()

      var frame = 0
      sw.Start()
      while frame < 200 {
        screen.Resize(w, h + (frame % 2))
        screen.Clear()
        for y in 0 ... h {
          screen.Write(0, y, "the quick brown fox 日本語 jumps over the lazy dog")
        }
        let out = screen.Flush()
        if out.Length == 0 { Console.WriteLine("bench: empty frame") }
        frame = frame + 1
      }
      sw.Stop()

      Console.WriteLine("bench: " + (sw.Elapsed.TotalMilliseconds / 200.0).ToString("0.00")
        + " ms per full repaint at " + w.ToString() + "x" + h.ToString())
      return 0
    }
  }
}

func rendererChecks() int32 {
  var failed = 0
  let esc = char(27).ToString()
  let syncOn = esc + "[?2026h"
  let syncOff = esc + "[?2026l"
  let reset = esc + "[0m"
  let flag = char.ConvertFromUtf32(0x1F1EF) + char.ConvertFromUtf32(0x1F1F5)
  let crab = char.ConvertFromUtf32(0x1F980)

  let ascii = Screen(1, 1)
  ascii.WriteCell(0, 0, "A", Style())
  let asciiWire = TerminalBuffer(64)
  ascii.Emit(asciiWire)
  let expectedAscii = syncOn + esc + "[1;1H" + reset + "A" + reset + syncOff
  failed = failed + Checks.Expect(asciiWire.Text() == expectedAscii,
    "direct ASCII wire fixture is exact")
  failed = failed + Checks.Expect(ascii.Emit(asciiWire) == 0 && asciiWire.Count() == 0,
    "direct clean emit is a no-op")

  let unicode = Screen(8, 1)
  unicode.Write(0, 0, "Aé日" + crab + flag, Style())
  let unicodeWire = TerminalBuffer(128)
  unicode.Emit(unicodeWire)
  let expectedUnicode = syncOn + esc + "[1;1H" + reset + "Aé日" + crab + flag + reset + syncOff
  failed = failed + Checks.Expect(unicodeWire.Text() == expectedUnicode,
    "direct UTF-8 Unicode wire fixture is exact")

  ascii.WriteCell(0, 0, "B", Style())
  ascii.Emit(asciiWire)
  let expectedDelta = syncOn + esc + "[1;1H" + reset + "B" + reset + syncOff
  failed = failed + Checks.Expect(asciiWire.Text() == expectedDelta,
    "direct one-cell delta wire fixture is exact")

  let wide = Screen(2, 1)
  wide.WriteCell(0, 0, "日", Style())
  let wideWire = TerminalBuffer(64)
  wide.Emit(wideWire)
  failed = failed + Checks.Expect(wide.Probe(1, 0) == "", "wide head stages an empty tail")
  failed = failed + Checks.Expect(wideWire.Text() == syncOn + esc + "[1;1H" + reset + "日" + reset + syncOff,
    "wide head emits once without its tail")
  failed = failed + Checks.Expect(wide.Emit(wideWire) == 0, "wide tail is clean after head emit")
  wide.WriteCell(1, 0, "x", Style())
  wide.Emit(wideWire)
  failed = failed + Checks.Expect(wideWire.Text() == syncOn + esc + "[1;2H" + reset + "x" + reset + syncOff,
    "wide tail replacement emits one normal cell")

  let controls = Screen(5, 1)
  controls.Write(0, 0, "a" + char(10).ToString() + "b" + char(9).ToString() + "c", Style())
  let controlsWire = TerminalBuffer(64)
  controls.Emit(controlsWire)
  failed = failed + Checks.Expect(controlsWire.Text() == syncOn + esc + "[1;1H" + reset + "a b c" + reset + syncOff,
    "direct controls become visible blanks")
  let c1 = Screen(4, 1)
  c1.Write(0, 0, "a" + char(27).ToString() + char(0x9B).ToString() + "b", Style())
  c1.Emit(controlsWire)
  failed = failed + Checks.Expect(controlsWire.Text() == syncOn + esc + "[1;1H" + reset + "a  b" + reset + syncOff,
    "direct ESC and C1 become visible blanks")

  let invalidated = Screen(3, 1)
  invalidated.Write(0, 0, "abc", Style())
  let invalidatedWire = TerminalBuffer(64)
  invalidated.Emit(invalidatedWire)
  let full = invalidatedWire.Text()
  invalidated.Invalidate()
  invalidated.Emit(invalidatedWire)
  failed = failed + Checks.Expect(invalidatedWire.Text() == full, "invalidate emits the full frame")
  failed = failed + Checks.Expect(invalidated.Emit(invalidatedWire) == 0, "invalidate repaint becomes clean")

  let cachedText = "é"
  let duplicateText = (cachedText + "x").Substring(0, cachedText.Length)
  let cached = Screen(2, 1)
  cached.WriteCell(0, 0, cachedText, Style())
  cached.WriteCell(1, 0, duplicateText, Style())
  let cachedId = cached.GlyphIdAt(0, 0)
  failed = failed + Checks.Expect(cachedId == cached.GlyphIdAt(1, 0),
    "equal distinct strings share one glyph cache entry")
  let cachedCount = cached.CachedGlyphs()
  cached.Resize(3, 1)
  cached.WriteCell(0, 0, cachedText, Style())
  failed = failed + Checks.Expect(cached.GlyphIdAt(0, 0) == cachedId && cached.CachedGlyphs() == cachedCount,
    "resize retains a warm glyph cache")

  let compacted = Screen(1, 1)
  var n = 0
  while n <= compacted.GlyphLimit() {
    compacted.WriteCell(0, 0, char.ConvertFromUtf32(0x1000 + n), Style())
    n = n + 1
  }
  let last = char.ConvertFromUtf32(0x1000 + n - 1)
  let compactedWire = TerminalBuffer(64)
  compacted.Emit(compactedWire)
  failed = failed + Checks.Expect(compacted.CachedGlyphs() < compacted.GlyphLimit(),
    "glyph cache compacts at its bound")
  failed = failed + Checks.Expect(compacted.Probe(0, 0) == last && compactedWire.Text().Contains(last),
    "glyph cache compaction preserves the live glyph")

  let resized = Screen(2, 1)
  resized.Write(0, 0, "ab", Style())
  let resizedWire = TerminalBuffer(64)
  resized.Emit(resizedWire)
  resized.Resize(3, 1)
  resized.Write(0, 0, "abc", Style())
  failed = failed + Checks.Expect(resized.Emit(resizedWire) > 0, "resize forces a repaint")
  failed = failed + Checks.Expect(resized.Emit(resizedWire) == 0, "resized frame becomes clean")

  let presentFirst = Screen(1, 1)
  presentFirst.WriteCell(0, 0, "p", Style())
  let firstSink = MemoryStream()
  let firstTerminal = Terminal(AutoResetEvent(false), firstSink)
  failed = failed + Checks.Expect(firstTerminal.Present(presentFirst) > 0 && presentFirst.Flush() == "",
    "present then flush shares screen state")
  let flushFirst = Screen(1, 1)
  flushFirst.WriteCell(0, 0, "f", Style())
  let legacyOut = flushFirst.Flush()
  let secondSink = MemoryStream()
  let secondTerminal = Terminal(AutoResetEvent(false), secondSink)
  failed = failed + Checks.Expect(legacyOut.Length > 0 && secondTerminal.Present(flushFirst) == 0
    && secondSink.ToArray().Length == 0, "flush then present shares screen state")

  let failedPresent = Screen(1, 1)
  failedPresent.WriteCell(0, 0, "r", Style())
  let closedSink = MemoryStream()
  closedSink.Dispose()
  let closedTerminal = Terminal(AutoResetEvent(false), closedSink)
  var threw = false
  try {
    closedTerminal.Present(failedPresent)
  } catch (e Exception) {
    threw = true
  }
  let retrySink = MemoryStream()
  let retryTerminal = Terminal(AutoResetEvent(false), retrySink)
  let retryBytes = retryTerminal.Present(failedPresent)
  let expectedRetry = syncOn + esc + "[1;1H" + reset + "r" + reset + syncOff
  failed = failed + Checks.Expect(threw && retryBytes > 0 && retrySink.ToArray().Length == retryBytes
    && Encoding.UTF8.GetString(retrySink.ToArray()) == expectedRetry,
    "failed present invalidates for a full successful retry")

  let measured = Screen(32, 8)
  for y in 0 ... 8 {
    measured.Write(0, y, "01234567890123456789012345678901", Style())
  }
  let measuredWire = TerminalBuffer(1024)
  measured.Emit(measuredWire)
  var pass = 0
  while pass < 16 {
    measured.Invalidate()
    measured.Emit(measuredWire)
    pass = pass + 1
  }
  let emitBefore = GC.GetAllocatedBytesForCurrentThread()
  pass = 0
  while pass < 64 {
    measured.Invalidate()
    measured.Emit(measuredWire)
    pass = pass + 1
  }
  failed = failed + Checks.Expect(GC.GetAllocatedBytesForCurrentThread() == emitBefore,
    "warmed invalidate and emit allocate zero bytes")

  let nullTerminal = Terminal(AutoResetEvent(false), Stream.Null)
  pass = 0
  while pass < 16 {
    measured.Invalidate()
    nullTerminal.Present(measured)
    pass = pass + 1
  }
  let presentBefore = GC.GetAllocatedBytesForCurrentThread()
  pass = 0
  while pass < 64 {
    measured.Invalidate()
    nullTerminal.Present(measured)
    pass = pass + 1
  }
  failed = failed + Checks.Expect(GC.GetAllocatedBytesForCurrentThread() == presentBefore,
    "warmed present to Stream.Null allocates zero bytes")

  return failed
}
