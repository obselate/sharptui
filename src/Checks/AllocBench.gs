package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Threading

public class AllocBench {
  shared {
    public func Run() int32 {
      let w = 200
      let h = 50
      let warm = 64
      let frames = 2000
      let line = "the quick brown fox 日本語 jumps over the lazy dog"
      let direct = Screen(w, h)
      let present = Screen(w, h)
      let output = TerminalBuffer(32768)
      let sink = Terminal(AutoResetEvent(false), Stream.Null)
      direct.DefaultStyle = Style{ Foreground: Color.Rgb("C8CEDA"), Background: Color.Rgb("0E1117") }
      present.DefaultStyle = Style{ Foreground: Color.Rgb("C8CEDA"), Background: Color.Rgb("0E1117") }

      var i = 0
      while i < warm {
        benchPaint(direct, w, h, i, line)
        direct.Emit(output)
        benchPaint(present, w, h, i, line)
        sink.Present(present)
        i = i + 1
      }

      let sw = Stopwatch()
      var before = GC.GetAllocatedBytesForCurrentThread()
      sw.Restart()
      i = 0
      while i < frames {
        benchPaint(direct, w, h, i, line)
        if direct.Emit(output) == 0 { Console.WriteLine("direct full repaint: empty") }
        i = i + 1
      }
      sw.Stop()
      var after = GC.GetAllocatedBytesForCurrentThread()
      benchReport("A full-repaint-with-resize", sw, before, after, frames)

      before = GC.GetAllocatedBytesForCurrentThread()
      sw.Restart()
      i = 0
      while i < frames {
        direct.Invalidate()
        if direct.Emit(output) == 0 { Console.WriteLine("direct invalidate: empty") }
        i = i + 1
      }
      sw.Stop()
      after = GC.GetAllocatedBytesForCurrentThread()
      benchReport("B invalidate+emit", sw, before, after, frames)

      let clean = Screen(w, h)
      clean.DefaultStyle = Style{ Foreground: Color.Rgb("C8CEDA"), Background: Color.Rgb("0E1117") }
      benchPaint(clean, w, h, 0, line)
      clean.Emit(output)
      before = GC.GetAllocatedBytesForCurrentThread()
      sw.Restart()
      i = 0
      while i < frames {
        if clean.Emit(output) != 0 { Console.WriteLine("clean emit: unexpected diff") }
        i = i + 1
      }
      sw.Stop()
      after = GC.GetAllocatedBytesForCurrentThread()
      benchReport("C clean emit", sw, before, after, frames)

      before = GC.GetAllocatedBytesForCurrentThread()
      sw.Restart()
      i = 0
      while i < frames {
        present.Invalidate()
        if sink.Present(present) == 0 { Console.WriteLine("present null: empty") }
        i = i + 1
      }
      sw.Stop()
      after = GC.GetAllocatedBytesForCurrentThread()
      benchReport("D present Stream.Null", sw, before, after, frames)

      let print = Screen(w, h)
      print.DefaultStyle = Style{ Foreground: Color.Rgb("C8CEDA"), Background: Color.Rgb("0E1117") }
      before = GC.GetAllocatedBytesForCurrentThread()
      sw.Restart()
      i = 0
      while i < frames {
        for y in 0 ... h { print.Write(0, y, line) }
        i = i + 1
      }
      sw.Stop()
      after = GC.GetAllocatedBytesForCurrentThread()
      benchReport("E write-50-lines", sw, before, after, frames)

      before = GC.GetAllocatedBytesForCurrentThread()
      sw.Restart()
      i = 0
      var widthTotal = 0
      while i < 100000 {
        widthTotal = widthTotal + CellText.MeasureWidth(line)
        i = i + 1
      }
      sw.Stop()
      after = GC.GetAllocatedBytesForCurrentThread()
      benchMicro("F MeasureWidth x100k (acc " + widthTotal.ToString() + ")", sw, before, after, 100000)

      before = GC.GetAllocatedBytesForCurrentThread()
      sw.Restart()
      i = 0
      var styleTotal = 0
      while i < 100000 {
        styleTotal = styleTotal + Ansi.Style(0xC8CEDA, 0x0E1117, 0).Length
        i = i + 1
      }
      sw.Stop()
      after = GC.GetAllocatedBytesForCurrentThread()
      benchMicro("G Ansi.Style x100k (len " + styleTotal.ToString() + ")", sw, before, after, 100000)

      return 0
    }

    public func RunUi() int32 {
      let w = 200
      let h = 50
      Console.WriteLine("framework|operation|us/op|B/op|Gen0/op|terminal bytes")
      uiBenchSelection()
      uiBenchScroll()
      uiBenchListCleanRedraw()
      uiBenchDefaultMarkerListSelection()
      uiBenchDefaultMarkerListCleanRedraw()
      uiBenchPresentedListSelection10k()
      uiBenchPresentedListCleanRedraw10k()
      uiBenchEdit()
      uiBenchDamage()
      uiBenchTableSelection()
      uiBenchTableVerticalScroll()
      uiBenchTableHorizontalScroll()
      uiBenchTableCleanRedraw()
      uiBenchTreeSelection()
      uiBenchTreeExpandCollapse()
      uiBenchTreeCleanRedraw()
      uiBenchTreeScrollbarScroll()
      uiBenchStatusCleanRedraw()
      uiBenchStatusTextChange()
      uiBenchTextBlockScroll()
      uiBenchTextBlockCleanRedraw()
      uiBenchRichTextBlockScroll()
      uiBenchRichTextBlockCleanRedraw()
      uiBenchRichTextBlockFollowEnd()
      uiBenchRichTextBlockPrependAnchor()
      uiBenchMarkdownViewScroll()
      uiBenchMarkdownViewCleanRedraw()
      uiBenchCleanRedraw("box unchanged redraw", uiBenchBoxLayout(w, h), w, h)
      uiBenchCleanRedraw("row unchanged redraw", uiBenchRowLayout(w, h), w, h)
      uiBenchCleanRedraw("column unchanged redraw", uiBenchColumnLayout(w, h), w, h)
      uiBenchLayoutReflow()
      uiBenchCleanRedraw("label unchanged redraw", uiBenchLabel(w), w, h)
      uiBenchCleanRedraw("text input unchanged redraw", uiBenchTextInput(w), w, h)
      uiBenchCleanRedraw("text area unchanged redraw", uiBenchTextArea(200, w, h), w, h)
      uiBenchTextAreaEdit()
      uiBenchTextAreaScroll()
      uiBenchCleanRedraw("tabs unchanged redraw", uiBenchTabs(w), w, h)
      uiBenchTabsSelection()
      uiBenchCleanRedraw("select closed unchanged redraw", uiBenchSelect(w), w, h)
      uiBenchCleanRedraw("select 1000 options auto width unchanged redraw", uiBenchAutoSelect(1000), w, h)
      uiBenchSelectOpenMove()
      uiBenchSelectChange()
      uiBenchCleanRedraw("button unchanged redraw", uiBenchButton(w), w, h)
      uiBenchButtonPress()
      uiBenchCleanRedraw("dialog unchanged redraw", uiBenchDialogScene(uiBenchDialog()), w, h)
      uiBenchDialogNavigation()
      uiBenchCleanRedraw("overlay unchanged redraw", uiBenchOverlayScene(), w, h)
      uiBenchVisibilityChange()
      uiBenchCleanRedraw("toggle unchanged redraw", uiBenchToggle(w), w, h)
      uiBenchToggleChange()
      uiBenchCleanRedraw("radio button unchanged redraw", uiBenchRadioButton(w), w, h)
      uiBenchRadioButtonChange()
      uiBenchCleanRedraw("radio group unchanged redraw", uiBenchRadioGroup(w), w, h)
      uiBenchRadioGroupChange()
      uiBenchCleanRedraw("progress bar unchanged redraw", uiBenchProgressBar(w), w, h)
      uiBenchProgressBarChange()
      uiBenchCleanRedraw("sparkline unchanged redraw", uiBenchSparkline(w), w, h)
      uiBenchCleanRedraw("sparkline 10k auto range unchanged redraw", uiBenchLargeSparkline(10000, w), w, h)
      uiBenchSparklineChange()
      uiBenchCleanRedraw("spinner unchanged redraw", uiBenchSpinner(w), w, h)
      uiBenchSpinnerAdvance()
      uiBenchCleanRedraw("badge unchanged redraw", uiBenchBadge(w), w, h)
      uiBenchBadgeChange()
      uiBenchCleanRedraw("separator unchanged redraw", uiBenchSeparator(w, h), w, h)
      uiBenchSeparatorChange()
      uiBenchSplitterChangedVsDirect()
      return 0
    }

  }
}

func uiBenchSelection() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let list = uiBenchList(200, w, h)
  list.SelectedIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  list.Focus(list)
  uiBenchDraw(list, screen, sink)

  var i = 0
  while i < warm {
    list.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(list, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    list.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(list, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if list.SelectedIndex != 20 || list.FirstVisibleItemIndex != 0 {
    Console.WriteLine("SharpTUI selection validation failed")
  }
  list.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(list, screen, sink)
  uiBenchResult("selection move", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchScroll() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let list = uiBenchList(1000, w, h)
  list.SelectedIndex = h - 1
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  list.Focus(list)
  uiBenchDraw(list, screen, sink)

  var i = 0
  while i < warm {
    list.Handle(uiBenchKey(Key.Down))
    uiBenchDraw(list, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    list.Handle(uiBenchKey(Key.Down))
    uiBenchDraw(list, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if list.SelectedIndex != h - 1 + warm + frames || list.FirstVisibleItemIndex != warm + frames {
    Console.WriteLine("SharpTUI scroll validation failed")
  }
  list.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(list, screen, sink)
  uiBenchResult("scroll one row", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchListCleanRedraw() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let list = uiBenchList(1000, w, h)
  list.SelectedIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  list.Focus(list)
  uiBenchDraw(list, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(list, screen, sink) != 0 { Console.WriteLine("SharpTUI list clean redraw warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(list, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || list.SelectedIndex != 20 || list.FirstVisibleItemIndex != 0 {
    Console.WriteLine("SharpTUI list clean redraw validation failed")
  }
  list.Handle(uiBenchKey(Key.Down))
  if uiBenchDraw(list, screen, sink) == 0 { Console.WriteLine("SharpTUI list clean redraw change failed") }
  let bytes = uiBenchDrawClean(list, screen, sink)
  if bytes != 0 || list.SelectedIndex != 21 { Console.WriteLine("SharpTUI list clean redraw final validation failed") }
  uiBenchResult("list unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchDefaultMarkerListSelection() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let list = uiBenchDefaultMarkerList(200, w, h)
  list.SelectedIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  list.Focus(list)
  uiBenchDraw(list, screen, sink)

  var i = 0
  while i < warm {
    list.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(list, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    list.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(list, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if list.SelectedIndex != 20 || list.FirstVisibleItemIndex != 0 || list.SelectionMarker != "> " {
    Console.WriteLine("SharpTUI default marker selection validation failed")
  }
  list.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(list, screen, sink)
  if bytes == 0 || list.SelectedIndex != 21 { Console.WriteLine("SharpTUI default marker selection final validation failed") }
  uiBenchResult("list default marker selection move", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchDefaultMarkerListCleanRedraw() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let list = uiBenchDefaultMarkerList(1000, w, h)
  list.SelectedIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  list.Focus(list)
  uiBenchDraw(list, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(list, screen, sink) != 0 { Console.WriteLine("SharpTUI default marker clean redraw warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(list, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || list.SelectedIndex != 20 || list.FirstVisibleItemIndex != 0 || list.SelectionMarker != "> " {
    Console.WriteLine("SharpTUI default marker clean redraw validation failed")
  }
  list.Handle(uiBenchKey(Key.Down))
  if uiBenchDraw(list, screen, sink) == 0 { Console.WriteLine("SharpTUI default marker clean redraw change failed") }
  let bytes = uiBenchDrawClean(list, screen, sink)
  if bytes != 0 || list.SelectedIndex != 21 { Console.WriteLine("SharpTUI default marker clean redraw final validation failed") }
  uiBenchResult("list default marker unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchPresentedListSelection10k() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let list = uiBenchPresentedList(10000, w, h)
  list.SelectedIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  list.Focus(list)
  uiBenchDraw(list, screen, sink)

  var i = 0
  while i < warm {
    list.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    if list.ConsumeSelectionChange() == nil { Console.WriteLine("SharpTUI presented list selection warmup failed") }
    uiBenchDraw(list, screen, sink)
    i = i + 1
  }

  let sw = Stopwatch()
  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  sw.Start()
  i = 0
  while i < frames {
    list.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    if list.ConsumeSelectionChange() == nil { Console.WriteLine("SharpTUI presented list selection measurement failed") }
    uiBenchDraw(list, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if after != before || genAfter != genBefore || list.SelectedIndex != 20 || list.FirstVisibleItemIndex != 0 {
    Console.WriteLine("SharpTUI presented list selection allocation validation failed")
  }
  list.Handle(uiBenchKey(Key.Down))
  if list.ConsumeSelectionChange() == nil { Console.WriteLine("SharpTUI presented list selection final consume failed") }
  let bytes = uiBenchDraw(list, screen, sink)
  uiBenchResult("list presented 10k selection move", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchPresentedListCleanRedraw10k() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let list = uiBenchPresentedList(10000, w, h)
  list.SelectedIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  list.Focus(list)
  uiBenchDraw(list, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(list, screen, sink) != 0 { Console.WriteLine("SharpTUI presented list clean redraw warmup failed") }
    i = i + 1
  }

  let sw = Stopwatch()
  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(list, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || after != before || genAfter != genBefore || list.SelectedIndex != 20 || list.FirstVisibleItemIndex != 0 {
    Console.WriteLine("SharpTUI presented list clean redraw allocation validation failed")
  }
  list.Handle(uiBenchKey(Key.Down))
  if list.ConsumeSelectionChange() == nil { Console.WriteLine("SharpTUI presented list clean redraw final consume failed") }
  if uiBenchDraw(list, screen, sink) == 0 { Console.WriteLine("SharpTUI presented list clean redraw change failed") }
  let bytes = uiBenchDrawClean(list, screen, sink)
  if bytes != 0 { Console.WriteLine("SharpTUI presented list clean redraw final validation failed") }
  uiBenchResult("list presented 10k unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchEdit() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let initial = "the quick brown fox jumps over the lazy dog"
  let entry = TextInput()
  entry.Width = CellLength.Cells(w)
  entry.Text = initial
  entry.CaretGraphemeIndex = initial.Length
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  entry.Focus(entry)
  uiBenchDraw(entry, screen, sink)

  var i = 0
  while i < warm {
    entry.Handle((i % 2) == 0 ? uiBenchChar("x") : uiBenchKey(Key.Backspace))
    uiBenchDraw(entry, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    entry.Handle((i % 2) == 0 ? uiBenchChar("x") : uiBenchKey(Key.Backspace))
    uiBenchDraw(entry, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if entry.Text != initial || entry.CaretGraphemeIndex != initial.Length {
    Console.WriteLine("SharpTUI edit validation failed")
  }
  entry.Handle(uiBenchChar("x"))
  let bytes = uiBenchDraw(entry, screen, sink)
  uiBenchResult("edit one character", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchDamage() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let a = "status: frame A"
  let b = "status: frame B"
  let label = Label()
  label.Width = CellLength.Cells(w)
  label.Text = a
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(label, screen, sink)

  var i = 0
  while i < warm {
    label.Text = (i % 2) == 0 ? b : a
    uiBenchDraw(label, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    label.Text = (i % 2) == 0 ? b : a
    uiBenchDraw(label, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if label.Text != a {
    Console.WriteLine("SharpTUI damage validation failed")
  }
  label.Text = b
  let bytes = uiBenchDraw(label, screen, sink)
  uiBenchResult("update one line", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTableSelection() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let table = uiBenchTable(8, 200, w, h)
  table.SelectedRowIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  table.Focus(table)
  uiBenchDraw(table, screen, sink)

  var i = 0
  while i < warm {
    table.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(table, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    table.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(table, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if table.SelectedRowIndex != 20 || table.FirstVisibleRowIndex != 0 {
    Console.WriteLine("SharpTUI table selection validation failed")
  }
  table.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(table, screen, sink)
  uiBenchResult("table selection move", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTableVerticalScroll() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let table = uiBenchTable(8, 1000, w, h)
  table.SelectedRowIndex = h - 2
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  table.Focus(table)
  uiBenchDraw(table, screen, sink)

  var i = 0
  while i < warm {
    table.Handle(uiBenchKey(Key.Down))
    uiBenchDraw(table, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    table.Handle(uiBenchKey(Key.Down))
    uiBenchDraw(table, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if table.SelectedRowIndex != h - 2 + warm + frames || table.FirstVisibleRowIndex != warm + frames {
    Console.WriteLine("SharpTUI table vertical scroll validation failed")
  }
  table.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(table, screen, sink)
  uiBenchResult("table scroll one row", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTableHorizontalScroll() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let table = uiBenchTable(8, 100, w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  table.Focus(table)
  uiBenchDraw(table, screen, sink)

  var i = 0
  while i < warm {
    table.Handle(uiBenchKey((i % 2) == 0 ? Key.Right : Key.Left))
    uiBenchDraw(table, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    table.Handle(uiBenchKey((i % 2) == 0 ? Key.Right : Key.Left))
    uiBenchDraw(table, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if table.FirstVisibleColumnIndex != 0 {
    Console.WriteLine("SharpTUI table horizontal scroll validation failed")
  }
  table.Handle(uiBenchKey(Key.Right))
  let bytes = uiBenchDraw(table, screen, sink)
  uiBenchResult("table scroll one column", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTableCleanRedraw() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let table = uiBenchTable(8, 1000, w, h)
  table.SelectedRowIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  table.Focus(table)
  uiBenchDraw(table, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(table, screen, sink) != 0 { Console.WriteLine("SharpTUI table clean redraw warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(table, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || table.SelectedRowIndex != 20 || table.FirstVisibleRowIndex != 0 {
    Console.WriteLine("SharpTUI table clean redraw validation failed")
  }
  table.Handle(uiBenchKey(Key.Down))
  if uiBenchDraw(table, screen, sink) == 0 { Console.WriteLine("SharpTUI table clean redraw change failed") }
  let bytes = uiBenchDrawClean(table, screen, sink)
  if bytes != 0 || table.SelectedRowIndex != 21 { Console.WriteLine("SharpTUI table clean redraw final validation failed") }
  uiBenchResult("table unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTreeSelection() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let tree = uiBenchTree(1000, true, w, h)
  tree.SelectedIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  tree.Focus(tree)
  uiBenchDraw(tree, screen, sink)

  var i = 0
  while i < warm {
    tree.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(tree, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    tree.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(tree, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if tree.SelectedIndex != 20 || tree.FirstVisibleNodeIndex != 0 {
    Console.WriteLine("SharpTUI tree selection validation failed")
  }
  tree.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(tree, screen, sink)
  uiBenchResult("tree selection move", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTreeExpandCollapse() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let tree = uiBenchTree(200, false, w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  tree.Focus(tree)
  uiBenchDraw(tree, screen, sink)

  var i = 0
  while i < warm {
    tree.Handle(uiBenchKey(Key.Enter))
    uiBenchDraw(tree, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    tree.Handle(uiBenchKey(Key.Enter))
    uiBenchDraw(tree, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if tree.Roots[0].IsExpanded || tree.SelectedIndex != 0 || tree.FirstVisibleNodeIndex != 0 {
    Console.WriteLine("SharpTUI tree expand/collapse validation failed")
  }
  tree.Handle(uiBenchKey(Key.Enter))
  let bytes = uiBenchDraw(tree, screen, sink)
  uiBenchResult("tree expand/collapse", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTreeCleanRedraw() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let tree = uiBenchTree(1000, true, w, h)
  tree.SelectedIndex = 20
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  tree.Focus(tree)
  uiBenchDraw(tree, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(tree, screen, sink) != 0 { Console.WriteLine("SharpTUI tree clean redraw warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(tree, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || tree.SelectedIndex != 20 || tree.FirstVisibleNodeIndex != 0 {
    Console.WriteLine("SharpTUI tree clean redraw validation failed")
  }
  tree.Handle(uiBenchKey(Key.Down))
  if uiBenchDraw(tree, screen, sink) == 0 { Console.WriteLine("SharpTUI tree clean redraw change failed") }
  let bytes = uiBenchDrawClean(tree, screen, sink)
  if bytes != 0 || tree.SelectedIndex != 21 { Console.WriteLine("SharpTUI tree clean redraw final validation failed") }
  uiBenchResult("tree unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTreeScrollbarScroll() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let tree = uiBenchTree(1000, true, w, h)
  tree.ShowScrollbar = true
  tree.SelectedIndex = h - 1
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  tree.Focus(tree)
  uiBenchDraw(tree, screen, sink)

  var i = 0
  while i < warm {
    tree.Handle(uiBenchKey(Key.Down))
    uiBenchDraw(tree, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    tree.Handle(uiBenchKey(Key.Down))
    uiBenchDraw(tree, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if tree.SelectedIndex != h - 1 + warm + frames || tree.FirstVisibleNodeIndex != warm + frames {
    Console.WriteLine("SharpTUI tree scrollbar scroll validation failed")
  }
  tree.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(tree, screen, sink)
  if bytes == 0 || tree.SelectedIndex != h + warm + frames {
    Console.WriteLine("SharpTUI tree scrollbar scroll final validation failed")
  }
  uiBenchResult("tree scrollbar scroll one row", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchStatusCleanRedraw() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let bar = uiBenchStatus(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(bar, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(bar, screen, sink) != 0 { Console.WriteLine("SharpTUI status clean redraw warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(bar, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || bar.LeftText != "^C quit" || bar.CenterText != "widget audit" || bar.RightText != "200 items" {
    Console.WriteLine("SharpTUI status clean redraw validation failed")
  }
  bar.RightText = "201 items"
  if uiBenchDraw(bar, screen, sink) == 0 { Console.WriteLine("SharpTUI status clean redraw change failed") }
  let bytes = uiBenchDrawClean(bar, screen, sink)
  if bytes != 0 || bar.RightText != "201 items" { Console.WriteLine("SharpTUI status clean redraw final validation failed") }
  uiBenchResult("status unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchStatusTextChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let bar = uiBenchStatus(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(bar, screen, sink)

  var i = 0
  while i < warm {
    uiBenchStatusText(bar, (i % 2) == 0)
    uiBenchDraw(bar, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    uiBenchStatusText(bar, (i % 2) == 0)
    uiBenchDraw(bar, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if bar.LeftText != "^C quit" || bar.CenterText != "widget audit" || bar.RightText != "200 items" {
    Console.WriteLine("SharpTUI status text validation failed")
  }
  uiBenchStatusText(bar, true)
  let bytes = uiBenchDraw(bar, screen, sink)
  if bytes == 0 || bar.LeftText != "^F filter" || bar.CenterText != "filter: error" || bar.RightText != "17 matches" {
    Console.WriteLine("SharpTUI status text final validation failed")
  }
  uiBenchResult("status text change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTextBlockScroll() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let text = uiBenchTextBlock(w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  text.Focus(text)
  uiBenchDraw(text, screen, sink)

  var i = 0
  while i < warm {
    text.ScrollToLine((i % 2) == 0 ? 20 : 21)
    uiBenchDraw(text, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    text.ScrollToLine((i % 2) == 0 ? 20 : 21)
    uiBenchDraw(text, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if text.FirstVisibleLine != 21 {
    Console.WriteLine("SharpTUI text block scroll validation failed")
  }
  text.ScrollToLine(22)
  let bytes = uiBenchDraw(text, screen, sink)
  if bytes == 0 || text.FirstVisibleLine != 22 { Console.WriteLine("SharpTUI text block scroll final validation failed") }
  uiBenchResult("text block scroll one line", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTextBlockCleanRedraw() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let text = uiBenchTextBlock(w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  text.Focus(text)
  uiBenchDraw(text, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(text, screen, sink) != 0 { Console.WriteLine("SharpTUI text block clean redraw warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(text, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || text.FirstVisibleLine != 0 {
    Console.WriteLine("SharpTUI text block clean redraw validation failed")
  }
  text.ScrollToLine(20)
  if uiBenchDraw(text, screen, sink) == 0 { Console.WriteLine("SharpTUI text block clean redraw change failed") }
  let bytes = uiBenchDrawClean(text, screen, sink)
  if bytes != 0 || text.FirstVisibleLine != 20 { Console.WriteLine("SharpTUI text block clean redraw final validation failed") }
  uiBenchResult("text block unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchRichTextBlockScroll() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let rich = uiBenchRichTextBlock(600, w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  rich.Focus(rich)
  uiBenchDraw(rich, screen, sink)

  var i = 0
  while i < warm {
    rich.ScrollToLine((i % 2) == 0 ? 20 : 21)
    uiBenchDraw(rich, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    rich.ScrollToLine((i % 2) == 0 ? 20 : 21)
    uiBenchDraw(rich, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if rich.LineCount() <= h + 22 || rich.FirstVisibleLine != 21 {
    Console.WriteLine("SharpTUI rich text block scroll validation failed")
  }
  rich.ScrollToLine(22)
  let bytes = uiBenchDraw(rich, screen, sink)
  if bytes == 0 || rich.FirstVisibleLine != 22 { Console.WriteLine("SharpTUI rich text block scroll final validation failed") }
  uiBenchResult("rich text block scroll one line", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchRichTextBlockCleanRedraw() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let rich = uiBenchRichTextBlock(600, w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  rich.Focus(rich)
  uiBenchDraw(rich, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(rich, screen, sink) != 0 { Console.WriteLine("SharpTUI rich text block clean redraw warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(rich, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || rich.LineCount() <= h + 20 || rich.FirstVisibleLine != 0 {
    Console.WriteLine("SharpTUI rich text block clean redraw validation failed")
  }
  rich.ScrollToLine(20)
  if uiBenchDraw(rich, screen, sink) == 0 { Console.WriteLine("SharpTUI rich text block clean redraw change failed") }
  let bytes = uiBenchDrawClean(rich, screen, sink)
  if bytes != 0 || rich.FirstVisibleLine != 20 { Console.WriteLine("SharpTUI rich text block clean redraw final validation failed") }
  uiBenchResult("rich text block unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchRichTextBlockFollowEnd() {
  let w = 200
  let h = 50
  let warm = 32
  let frames = 200
  let rich = uiBenchRichTextBlock(600, w, h)
  let tail = TextRun("follow-end appended row alpha bravo charlie delta\n", Style())
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  rich.ScrollToEnd()
  uiBenchDraw(rich, screen, sink)

  var i = 0
  while i < warm {
    if (i % 2) == 0 { rich.Runs.Add(tail) }
    else { rich.Runs.RemoveAt(rich.Runs.Count - 1) }
    uiBenchDraw(rich, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    if (i % 2) == 0 { rich.Runs.Add(tail) }
    else { rich.Runs.RemoveAt(rich.Runs.Count - 1) }
    uiBenchDraw(rich, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  let end = rich.LineCount() - h
  if rich.FirstVisibleLine != (end < 0 ? 0 : end) {
    Console.WriteLine("SharpTUI rich text follow-end validation failed")
  }
  rich.Runs.Add(tail)
  let bytes = uiBenchDraw(rich, screen, sink)
  if bytes == 0 { Console.WriteLine("SharpTUI rich text follow-end final validation failed") }
  uiBenchResult("rich text block follow-end append", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchRichTextBlockPrependAnchor() {
  let w = 200
  let h = 50
  let warm = 16
  let frames = 100
  let rich = uiBenchRichTextBlock(600, w, h)
  let added = List[TextRun]()
  added.Add(TextRun("prepended row alpha bravo charlie delta\n", Style()))
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  rich.ScrollToLine(20)
  uiBenchDraw(rich, screen, sink)

  var i = 0
  while i < warm {
    rich.PrependRuns(added)
    uiBenchDraw(rich, screen, sink)
    rich.Runs.RemoveAt(0)
    rich.ScrollToLine(20)
    uiBenchDraw(rich, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    rich.PrependRuns(added)
    uiBenchDraw(rich, screen, sink)
    rich.Runs.RemoveAt(0)
    rich.ScrollToLine(20)
    uiBenchDraw(rich, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if rich.FirstVisibleLine != 20 {
    Console.WriteLine("SharpTUI rich text prepend anchor validation failed")
  }
  rich.PrependRuns(added)
  let bytes = uiBenchDraw(rich, screen, sink)
  if bytes != 0 || rich.FirstVisibleLine <= 20 {
    Console.WriteLine("SharpTUI rich text prepend anchor final validation failed")
  }
  uiBenchResult("rich text block prepend anchor", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchMarkdownViewScroll() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let markdown = uiBenchMarkdownView(200, w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  markdown.Focus(markdown)
  uiBenchDraw(markdown, screen, sink)

  var i = 0
  while i < warm {
    markdown.ScrollToLine((i % 2) == 0 ? 20 : 21)
    uiBenchDraw(markdown, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    markdown.ScrollToLine((i % 2) == 0 ? 20 : 21)
    uiBenchDraw(markdown, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if markdown.LineCount() <= h + 22 || markdown.FirstVisibleLine != 21 {
    Console.WriteLine("SharpTUI markdown view scroll validation failed")
  }
  markdown.ScrollToLine(22)
  let bytes = uiBenchDraw(markdown, screen, sink)
  if bytes == 0 || markdown.FirstVisibleLine != 22 { Console.WriteLine("SharpTUI markdown view scroll final validation failed") }
  uiBenchResult("markdown view scroll one line", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchMarkdownViewCleanRedraw() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let markdown = uiBenchMarkdownView(200, w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  markdown.Focus(markdown)
  uiBenchDraw(markdown, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(markdown, screen, sink) != 0 { Console.WriteLine("SharpTUI markdown view clean redraw warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(markdown, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if cleanBytes != 0 || markdown.LineCount() <= h + 20 || markdown.FirstVisibleLine != 0 {
    Console.WriteLine("SharpTUI markdown view clean redraw validation failed")
  }
  markdown.ScrollToLine(20)
  if uiBenchDraw(markdown, screen, sink) == 0 { Console.WriteLine("SharpTUI markdown view clean redraw change failed") }
  let bytes = uiBenchDrawClean(markdown, screen, sink)
  if bytes != 0 || markdown.FirstVisibleLine != 20 { Console.WriteLine("SharpTUI markdown view clean redraw final validation failed") }
  uiBenchResult("markdown view unchanged redraw", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchCleanRedraw(name string, root Box, width int32, height int32) {
  let warm = 64
  let frames = 500
  let screen = uiBenchScreen(width, height)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(root, screen, sink)

  var i = 0
  while i < warm {
    if uiBenchDrawClean(root, screen, sink) != 0 { Console.WriteLine("SharpTUI " + name + " warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  var cleanBytes = 0
  while i < frames {
    cleanBytes = cleanBytes + uiBenchDrawClean(root, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  let bytes = uiBenchDrawClean(root, screen, sink)
  if cleanBytes != 0 || bytes != 0 { Console.WriteLine("SharpTUI " + name + " validation failed") }
  uiBenchResult(name, sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchLayoutReflow() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let root = uiBenchNestedLayout(w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(root, screen, sink)

  var i = 0
  while i < warm {
    root.GapCells = (i % 2) == 0 ? 1 : 2
    uiBenchDraw(root, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    root.GapCells = (i % 2) == 0 ? 1 : 2
    uiBenchDraw(root, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if root.GapCells != 2 { Console.WriteLine("SharpTUI layout reflow validation failed") }
  root.GapCells = 1
  let bytes = uiBenchDraw(root, screen, sink)
  if bytes == 0 || root.GapCells != 1 { Console.WriteLine("SharpTUI layout reflow final validation failed") }
  uiBenchResult("box row column gap reflow", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTextAreaEdit() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let firstLine = "line 0000 alpha bravo charlie delta echo foxtrot golf hotel"
  let area = uiBenchTextArea(200, w, h)
  let initial = area.Text
  area.Caret = TextPosition{ LineIndex: 0, GraphemeIndex: firstLine.Length }
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  area.Focus(area)
  uiBenchDraw(area, screen, sink)

  var i = 0
  while i < warm {
    area.Handle((i % 2) == 0 ? uiBenchChar("x") : uiBenchKey(Key.Backspace))
    uiBenchDraw(area, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    area.Handle((i % 2) == 0 ? uiBenchChar("x") : uiBenchKey(Key.Backspace))
    uiBenchDraw(area, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if area.Text != initial || area.Caret.GraphemeIndex != firstLine.Length {
    Console.WriteLine("SharpTUI text area edit validation failed")
  }
  area.Caret = TextPosition{ LineIndex: 0, GraphemeIndex: 0 }
  uiBenchDraw(area, screen, sink)
  area.Handle(uiBenchChar("x"))
  let bytes = uiBenchDraw(area, screen, sink)
  if bytes == 0 || area.Text == initial || area.Caret.GraphemeIndex != 1 {
    Console.WriteLine("SharpTUI text area edit final validation failed")
  }
  uiBenchResult("text area edit in 200 lines", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTextAreaScroll() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let area = uiBenchTextArea(1000, w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  area.Focus(area)
  uiBenchDraw(area, screen, sink)
  area.Caret = TextPosition{ LineIndex: h - 1, GraphemeIndex: 0 }
  uiBenchDraw(area, screen, sink)

  var i = 0
  while i < warm {
    area.Handle(uiBenchKey(Key.Down))
    uiBenchDraw(area, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    area.Handle(uiBenchKey(Key.Down))
    uiBenchDraw(area, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if area.Caret.LineIndex != h - 1 + warm + frames || area.FirstVisibleRowIndex <= 0 {
    Console.WriteLine("SharpTUI text area scroll validation failed")
  }
  area.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(area, screen, sink)
  if bytes == 0 || area.Caret.LineIndex != h + warm + frames {
    Console.WriteLine("SharpTUI text area scroll final validation failed")
  }
  uiBenchResult("text area scroll one row", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchTabsSelection() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let tabs = uiBenchTabs(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  tabs.Focus(tabs)
  uiBenchDraw(tabs, screen, sink)

  var i = 0
  while i < warm {
    tabs.Handle(uiBenchKey((i % 2) == 0 ? Key.Right : Key.Left))
    uiBenchDraw(tabs, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    tabs.Handle(uiBenchKey((i % 2) == 0 ? Key.Right : Key.Left))
    uiBenchDraw(tabs, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if tabs.SelectedIndex != 0 { Console.WriteLine("SharpTUI tabs selection validation failed") }
  tabs.Handle(uiBenchKey(Key.Right))
  let bytes = uiBenchDraw(tabs, screen, sink)
  if bytes == 0 || tabs.SelectedIndex != 1 { Console.WriteLine("SharpTUI tabs selection final validation failed") }
  uiBenchResult("tabs selection move", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchSelectChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let picker = uiBenchSelect(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  picker.Focus(picker)
  uiBenchDraw(picker, screen, sink)

  var i = 0
  while i < warm {
    uiBenchSelectMove(picker, (i % 2) == 0)
    uiBenchDraw(picker, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    uiBenchSelectMove(picker, (i % 2) == 0)
    uiBenchDraw(picker, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if picker.SelectedIndex != 0 || picker.IsOpen { Console.WriteLine("SharpTUI select change validation failed") }
  uiBenchSelectMove(picker, true)
  let bytes = uiBenchDraw(picker, screen, sink)
  if bytes == 0 || picker.SelectedIndex != 1 || picker.IsOpen {
    Console.WriteLine("SharpTUI select change final validation failed")
  }
  uiBenchResult("select commit change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchSelectOpenMove() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let picker = uiBenchSelect(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  picker.Focus(picker)
  uiBenchDraw(picker, screen, sink)
  picker.Handle(uiBenchKey(Key.Enter))
  uiBenchDraw(picker, screen, sink)

  var i = 0
  while i < warm {
    picker.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(picker, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    picker.Handle(uiBenchKey((i % 2) == 0 ? Key.Down : Key.Up))
    uiBenchDraw(picker, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if picker.SelectedIndex != 0 || !picker.IsOpen { Console.WriteLine("SharpTUI open select validation failed") }
  picker.Handle(uiBenchKey(Key.Down))
  let bytes = uiBenchDraw(picker, screen, sink)
  if bytes == 0 || picker.SelectedIndex != 0 || !picker.IsOpen {
    Console.WriteLine("SharpTUI open select final validation failed")
  }
  uiBenchResult("select open highlight move", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchSelectMove(picker Select, forward bool) {
  picker.Handle(uiBenchKey(Key.Enter))
  picker.Handle(uiBenchKey(forward ? Key.Down : Key.Up))
  picker.Handle(uiBenchKey(Key.Enter))
}

func uiBenchButtonPress() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let button = uiBenchButton(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  button.Focus(button)
  uiBenchDraw(button, screen, sink)

  var i = 0
  while i < warm {
    button.Handle(uiBenchKey(Key.Enter))
    uiBenchDraw(button, screen, sink)
    if !button.ConsumePress() { Console.WriteLine("SharpTUI button press warmup failed") }
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    button.Handle(uiBenchKey(Key.Enter))
    uiBenchDraw(button, screen, sink)
    if !button.ConsumePress() { Console.WriteLine("SharpTUI button press measurement failed") }
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if button.IsPressed { Console.WriteLine("SharpTUI button press validation failed") }
  button.Handle(uiBenchKey(Key.Enter))
  let bytes = uiBenchDraw(button, screen, sink)
  if bytes != 0 || !button.IsPressed || !button.ConsumePress() || button.IsPressed {
    Console.WriteLine("SharpTUI button press final validation failed")
  }
  uiBenchResult("button press and consume", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchDialogNavigation() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let dialog = uiBenchDialog()
  let root = uiBenchDialogScene(dialog)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(root, screen, sink)

  var i = 0
  while i < warm {
    root.Handle(uiBenchKey(Key.Tab))
    uiBenchDraw(root, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    root.Handle(uiBenchKey(Key.Tab))
    uiBenchDraw(root, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if dialog.FocusedElement == nil || dialog.Result != nil { Console.WriteLine("SharpTUI dialog navigation validation failed") }
  root.Handle(uiBenchKey(Key.Tab))
  let bytes = uiBenchDraw(root, screen, sink)
  if bytes == 0 || dialog.FocusedElement == nil || dialog.Result != nil {
    Console.WriteLine("SharpTUI dialog navigation final validation failed")
  }
  uiBenchResult("dialog action navigation", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchToggleChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let toggle = uiBenchToggle(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  toggle.Focus(toggle)
  uiBenchDraw(toggle, screen, sink)

  var i = 0
  while i < warm {
    toggle.Handle(uiBenchKey(Key.Enter))
    uiBenchDraw(toggle, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    toggle.Handle(uiBenchKey(Key.Enter))
    uiBenchDraw(toggle, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if toggle.IsChecked { Console.WriteLine("SharpTUI toggle change validation failed") }
  toggle.Handle(uiBenchKey(Key.Enter))
  let bytes = uiBenchDraw(toggle, screen, sink)
  if bytes == 0 || !toggle.IsChecked { Console.WriteLine("SharpTUI toggle change final validation failed") }
  uiBenchResult("toggle change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchRadioButtonChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let button = uiBenchRadioButton(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  button.Focus(button)
  uiBenchDraw(button, screen, sink)

  var i = 0
  while i < warm {
    button.IsSelected = (i % 2) == 0
    uiBenchDraw(button, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    button.IsSelected = (i % 2) == 0
    uiBenchDraw(button, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if button.IsSelected { Console.WriteLine("SharpTUI radio button change validation failed") }
  button.IsSelected = true
  let bytes = uiBenchDraw(button, screen, sink)
  if bytes == 0 || !button.IsSelected { Console.WriteLine("SharpTUI radio button change final validation failed") }
  uiBenchResult("radio button change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchRadioGroupChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let group = RadioGroup()
  group.Width = CellLength.Cells(w)
  group.Height = CellLength.Cells(3)
  let first = RadioButton{ Text: "automatic scale", Width: CellLength.Cells(w) }
  let second = RadioButton{ Text: "fixed scale", Width: CellLength.Cells(w) }
  group.Add(first)
  group.Add(second)
  group.Select(first)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  group.Focus(first)
  uiBenchDraw(group, screen, sink)

  var i = 0
  while i < warm {
    let target = (i % 2) == 0 ? second : first
    group.Focus(target)
    group.Handle(uiBenchKey(Key.Enter))
    uiBenchDraw(group, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    let target = (i % 2) == 0 ? second : first
    group.Focus(target)
    group.Handle(uiBenchKey(Key.Enter))
    uiBenchDraw(group, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if !first.IsSelected || second.IsSelected || !Object.ReferenceEquals(group.SelectedButton, first) {
    Console.WriteLine("SharpTUI radio group change validation failed")
  }
  group.Focus(second)
  group.Handle(uiBenchKey(Key.Enter))
  let bytes = uiBenchDraw(group, screen, sink)
  if bytes == 0 || first.IsSelected || !second.IsSelected || !Object.ReferenceEquals(group.SelectedButton, second) {
    Console.WriteLine("SharpTUI radio group change final validation failed")
  }
  uiBenchResult("radio group selection change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchProgressBarChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let bar = uiBenchProgressBar(w)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(bar, screen, sink)

  var i = 0
  while i < warm {
    bar.Value = (i % 2) == 0 ? 25.0 : 75.0
    uiBenchDraw(bar, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    bar.Value = (i % 2) == 0 ? 25.0 : 75.0
    uiBenchDraw(bar, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if bar.Value != 75.0 { Console.WriteLine("SharpTUI progress bar change validation failed") }
  bar.Value = 25.0
  let bytes = uiBenchDraw(bar, screen, sink)
  if bytes == 0 || bar.Value != 25.0 { Console.WriteLine("SharpTUI progress bar change final validation failed") }
  uiBenchResult("progress bar value change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchSparklineChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let spark = uiBenchSparkline(w)
  let low = 0.0
  let high = 100.0
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(spark, screen, sink)

  var i = 0
  while i < warm {
    spark.Values[0] = (i % 2) == 0 ? high : low
    uiBenchDraw(spark, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    spark.Values[0] = (i % 2) == 0 ? high : low
    uiBenchDraw(spark, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if spark.Values[0] != low {
    Console.WriteLine("SharpTUI sparkline change validation failed")
  }
  spark.Values[0] = high
  let bytes = uiBenchDraw(spark, screen, sink)
  if bytes == 0 || spark.Values[0] != high {
    Console.WriteLine("SharpTUI sparkline change final validation failed")
  }
  uiBenchResult("sparkline value change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchSpinnerAdvance() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let spinner = uiBenchSpinner(w)
  let frameCount = spinner.Frames.Count
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(spinner, screen, sink)

  var i = 0
  while i < warm {
    spinner.Advance()
    uiBenchDraw(spinner, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    spinner.Advance()
    uiBenchDraw(spinner, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if spinner.FrameIndex != (warm + frames) % frameCount { Console.WriteLine("SharpTUI spinner advance validation failed") }
  spinner.Advance()
  let bytes = uiBenchDraw(spinner, screen, sink)
  if bytes == 0 || spinner.FrameIndex != (warm + frames + 1) % frameCount {
    Console.WriteLine("SharpTUI spinner advance final validation failed")
  }
  uiBenchResult("spinner advance", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchBadgeChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let badge = uiBenchBadge(w)
  let a = "build passed"
  let b = "build failed"
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(badge, screen, sink)

  var i = 0
  while i < warm {
    badge.Text = (i % 2) == 0 ? b : a
    uiBenchDraw(badge, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    badge.Text = (i % 2) == 0 ? b : a
    uiBenchDraw(badge, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if badge.Text != a { Console.WriteLine("SharpTUI badge change validation failed") }
  badge.Text = b
  let bytes = uiBenchDraw(badge, screen, sink)
  if bytes == 0 || badge.Text != b { Console.WriteLine("SharpTUI badge change final validation failed") }
  uiBenchResult("badge text change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchSeparatorChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let separator = uiBenchSeparator(w, h)
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(separator, screen, sink)

  var i = 0
  while i < warm {
    separator.Orientation = (i % 2) == 0 ? SeparatorOrientation.Vertical : SeparatorOrientation.Horizontal
    uiBenchDraw(separator, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    separator.Orientation = (i % 2) == 0 ? SeparatorOrientation.Vertical : SeparatorOrientation.Horizontal
    uiBenchDraw(separator, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if separator.Orientation != SeparatorOrientation.Horizontal {
    Console.WriteLine("SharpTUI separator orientation validation failed")
  }
  separator.Orientation = SeparatorOrientation.Vertical
  let bytes = uiBenchDraw(separator, screen, sink)
  if bytes == 0 || separator.Orientation != SeparatorOrientation.Vertical {
    Console.WriteLine("SharpTUI separator orientation final validation failed")
  }
  uiBenchResult("separator orientation change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchSplitterChangedVsDirect() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500

  let target = Column{
    Width: CellLength.Cells(60),
    Height: CellLength.Cells(h),
    Children: {
      Label{ Text: "splitter target", Width: CellLength.Cells(60) },
      Label{ Text: "retained Yoga child", Width: CellLength.Cells(60) },
    },
  }
  let splitter = Splitter(target, SplitterAxis.Columns)
  let root = Row{
    Width: CellLength.Cells(w),
    Height: CellLength.Cells(h),
    Children: {
      target,
      splitter,
      Column{
        GrowWeight: 1,
        Height: CellLength.Cells(h),
        Children: { Label{ Text: "direct comparison", GrowWeight: 1 } },
      },
    },
  }
  let children = root.Children
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(root, screen, sink)

  var i = 0
  while i < warm {
    splitter.ResizeBy((i % 2) == 0 ? 1 : -1)
    uiBenchDraw(root, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    splitter.ResizeBy((i % 2) == 0 ? 1 : -1)
    uiBenchDraw(root, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  splitter.ResizeBy(1)
  let bytes = uiBenchDraw(root, screen, sink)
  if !Object.ReferenceEquals(children, root.Children) || bytes == 0 {
    Console.WriteLine("SharpTUI splitter changed-cell validation failed")
  }
  uiBenchResult("splitter changed cell", sw, before, after, genBefore, genAfter, frames, bytes)

  let directTarget = Column{
    Width: CellLength.Cells(60),
    Height: CellLength.Cells(h),
    Children: {
      Label{ Text: "splitter target", Width: CellLength.Cells(60) },
      Label{ Text: "retained Yoga child", Width: CellLength.Cells(60) },
    },
  }
  let directDivider = Separator{
    Width: CellLength.Cells(1),
    Height: CellLength.Cells(h),
    Orientation: SeparatorOrientation.Vertical,
  }
  let directRoot = Row{
    Width: CellLength.Cells(w),
    Height: CellLength.Cells(h),
    Children: {
      directTarget,
      directDivider,
      Column{
        GrowWeight: 1,
        Height: CellLength.Cells(h),
        Children: { Label{ Text: "direct comparison", GrowWeight: 1 } },
      },
    },
  }
  let directChildren = directRoot.Children
  let directScreen = uiBenchScreen(w, h)
  let directSink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(directRoot, directScreen, directSink)

  i = 0
  while i < warm {
    let current = directTarget.Width.CellCount
    directTarget.Width = CellLength.Cells(current + ((i % 2) == 0 ? 1 : -1))
    uiBenchDraw(directRoot, directScreen, directSink)
    i = i + 1
  }

  uiBenchCollect()
  let directGenBefore = GC.CollectionCount(0)
  let directBefore = GC.GetAllocatedBytesForCurrentThread()
  let directSw = Stopwatch()
  directSw.Start()
  i = 0
  while i < frames {
    let current = directTarget.Width.CellCount
    directTarget.Width = CellLength.Cells(current + ((i % 2) == 0 ? 1 : -1))
    uiBenchDraw(directRoot, directScreen, directSink)
    i = i + 1
  }
  directSw.Stop()
  let directAfter = GC.GetAllocatedBytesForCurrentThread()
  let directGenAfter = GC.CollectionCount(0)
  directTarget.Width = CellLength.Cells(directTarget.Width.CellCount + 1)
  let directBytes = uiBenchDraw(directRoot, directScreen, directSink)
  if !Object.ReferenceEquals(directChildren, directRoot.Children) || directBytes == 0 {
    Console.WriteLine("SharpTUI direct changed-cell validation failed")
  }
  uiBenchResult("direct target width reflow", directSw, directBefore, directAfter,
    directGenBefore, directGenAfter, frames, directBytes)
}

func uiBenchBoxLayout(width int32, height int32) Box {
  let root = Box()
  root.Width = CellLength.Cells(width)
  root.Height = CellLength.Cells(height)
  root.Padding = CellInsets.All(1)
  root.GapCells = 1
  root.ShowBorder = true
  root.Title = "Box"
  root.Children.Add(Label{ Text: "box layout benchmark", Width: CellLength.Cells(80) })
  root.Children.Add(Label{ Text: "retained children", Width: CellLength.Cells(80) })
  return root
}

func uiBenchRowLayout(width int32, height int32) Row {
  let root = Row()
  root.Width = CellLength.Cells(width)
  root.Height = CellLength.Cells(height)
  root.Padding = CellInsets.All(1)
  root.GapCells = 2
  root.ShowBorder = true
  root.Title = "Row"
  root.Children.Add(Label{ Text: "name", Width: CellLength.Cells(32) })
  root.Children.Add(Label{ Text: "size", Width: CellLength.Cells(32) })
  root.Children.Add(Label{ Text: "modified", Width: CellLength.Cells(32) })
  return root
}

func uiBenchColumnLayout(width int32, height int32) Column {
  let root = Column()
  root.Width = CellLength.Cells(width)
  root.Height = CellLength.Cells(height)
  root.Padding = CellInsets.All(1)
  root.GapCells = 1
  root.ShowBorder = true
  root.Title = "Column"
  root.Children.Add(Label{ Text: "top", Width: CellLength.Cells(80) })
  root.Children.Add(Label{ Text: "middle", Width: CellLength.Cells(80) })
  root.Children.Add(Label{ Text: "bottom", Width: CellLength.Cells(80) })
  return root
}

func uiBenchNestedLayout(width int32, height int32) Column {
  let root = Column()
  root.Width = CellLength.Cells(width)
  root.Height = CellLength.Cells(height)
  root.Padding = CellInsets.All(1)
  root.GapCells = 2
  root.ShowBorder = true
  root.Title = "Layout"
  var i = 0
  while i < 4 {
    let row = Row{ Height: CellLength.Cells(3), GapCells: 1 }
    row.Children.Add(Label{ Text: "row-" + i.ToString(), Width: CellLength.Cells(24) })
    row.Children.Add(Label{ Text: "alpha bravo charlie", GrowWeight: 1 })
    row.Children.Add(Label{ Text: "ready", Width: CellLength.Cells(16) })
    root.Children.Add(row)
    i = i + 1
  }
  return root
}

func uiBenchLabel(width int32) Label {
  return Label{
    Text: "allocation benchmark label with 日本語 width",
    Width: CellLength.Cells(width),
    Alignment: HorizontalAlignment.Center,
  }
}

func uiBenchTextInput(width int32) TextInput {
  let input = TextInput()
  input.Width = CellLength.Cells(width)
  input.Text = "the quick brown fox jumps over the lazy dog"
  input.CaretGraphemeIndex = input.Text.Length
  return input
}

func uiBenchTextArea(lines int32, width int32, height int32) TextArea {
  let area = TextArea()
  area.Width = CellLength.Cells(width)
  area.Height = CellLength.Cells(height)
  area.Text = uiBenchTextAreaSource(lines)
  return area
}

func uiBenchTextAreaSource(lines int32) string {
  var source = ""
  var i = 0
  while i < lines {
    if i > 0 { source = source + "\n" }
    source = source + "line " + i.ToString("D4") + " alpha bravo charlie delta echo foxtrot golf hotel"
    i = i + 1
  }
  return source
}

func uiBenchTabs(width int32) Tabs {
  let tabs = Tabs()
  tabs.Width = CellLength.Cells(width)
  tabs.SelectedStyle = Style{ Foreground: Color.Rgb("0E1117"), Background: Color.Rgb("C8CEDA") }
  var i = 0
  while i < 24 {
    tabs.Titles.Add("section-" + i.ToString("D2"))
    i = i + 1
  }
  return tabs
}

func uiBenchSelect(width int32) Select {
  let picker = Select()
  picker.Width = CellLength.Cells(width)
  picker.Height = CellLength.Cells(1)
  picker.SelectedStyle = Style{ Foreground: Color.Rgb("0E1117"), Background: Color.Rgb("C8CEDA") }
  var i = 0
  while i < 12 {
    picker.Options.Add("option-" + i.ToString("D2") + " allocation benchmark")
    i = i + 1
  }
  return picker
}

func uiBenchAutoSelect(count int32) Select {
  let picker = Select()
  picker.Height = CellLength.Cells(1)
  var i = 0
  while i < count {
    picker.Options.Add("option-" + i.ToString("D4") + " allocation benchmark")
    i = i + 1
  }
  return picker
}

func uiBenchButton(width int32) Button {
  let button = Button()
  button.Width = CellLength.Cells(width)
  button.Text = "apply benchmark"
  return button
}

func uiBenchDialog() Dialog {
  let dialog = Dialog()
  dialog.Message = "This dialog contains a representative action row for the allocation benchmark."
  dialog.Actions.Add(DialogAction{ Text: "Apply" })
  dialog.Actions.Add(DialogAction{ Text: "Cancel", IsCancel: true })
  return dialog
}

func uiBenchDialogScene(dialog Dialog) Box {
  let root = Box()
  root.Width = CellLength.Cells(200)
  root.Height = CellLength.Cells(50)
  root.Children.Add(Label{ Text: "background allocation benchmark content", Width: CellLength.Cells(200) })
  root.Children.Add(Label{ Text: "the dialog dims this retained background", Width: CellLength.Cells(200) })
  root.Children.Add(dialog)
  return root
}

func uiBenchOverlayScene() Box {
  let content = Column{
    Width: CellLength.Cells(60),
    Height: CellLength.Cells(8),
    ShowBorder: true,
    Children: {
      TextInput{ Text: "overlay input" },
      Button{ Text: "apply" },
    },
  }
  let overlay = Overlay{ Content: content, DimBackground: true }
  return Box{
    Width: CellLength.Cells(200),
    Height: CellLength.Cells(50),
    Children: {
      Label{ Text: "background allocation benchmark", Width: CellLength.Cells(200) },
      overlay,
    },
  }
}

func uiBenchVisibilityChange() {
  let w = 200
  let h = 50
  let warm = 64
  let frames = 500
  let optional = Label{ Text: "optional pane", GrowWeight: 1 }
  let root = Row{
    Width: CellLength.Cells(w),
    Height: CellLength.Cells(h),
    Children: {
      Label{ Text: "fixed pane", GrowWeight: 1 },
      optional,
      Label{ Text: "detail pane", GrowWeight: 1 },
    },
  }
  let screen = uiBenchScreen(w, h)
  let sink = Terminal(AutoResetEvent(false), Stream.Null)
  uiBenchDraw(root, screen, sink)

  var i = 0
  while i < warm {
    optional.IsVisible = (i % 2) == 0
    uiBenchDraw(root, screen, sink)
    i = i + 1
  }

  uiBenchCollect()
  let genBefore = GC.CollectionCount(0)
  let before = GC.GetAllocatedBytesForCurrentThread()
  let sw = Stopwatch()
  sw.Start()
  i = 0
  while i < frames {
    optional.IsVisible = (i % 2) == 0
    uiBenchDraw(root, screen, sink)
    i = i + 1
  }
  sw.Stop()
  let after = GC.GetAllocatedBytesForCurrentThread()
  let genAfter = GC.CollectionCount(0)
  if optional.IsVisible {
    Console.WriteLine("SharpTUI visibility change validation failed")
  }
  optional.IsVisible = true
  let bytes = uiBenchDraw(root, screen, sink)
  if bytes == 0 || !optional.IsVisible {
    Console.WriteLine("SharpTUI visibility change final validation failed")
  }
  uiBenchResult("layout visibility change", sw, before, after, genBefore, genAfter, frames, bytes)
}

func uiBenchToggle(width int32) Toggle {
  let toggle = Toggle()
  toggle.Width = CellLength.Cells(width)
  toggle.Text = "enable allocation telemetry"
  return toggle
}

func uiBenchRadioButton(width int32) RadioButton {
  let button = RadioButton()
  button.Width = CellLength.Cells(width)
  button.Text = "automatic scale"
  return button
}

func uiBenchRadioGroup(width int32) RadioGroup {
  let group = RadioGroup()
  group.Width = CellLength.Cells(width)
  group.Height = CellLength.Cells(3)
  let first = RadioButton{ Text: "automatic scale", Width: CellLength.Cells(width) }
  let second = RadioButton{ Text: "fixed scale", Width: CellLength.Cells(width) }
  group.Add(first)
  group.Add(second)
  group.Select(first)
  return group
}

func uiBenchProgressBar(width int32) ProgressBar {
  return ProgressBar{
    Width: CellLength.Cells(width),
    Value: 50.0,
    Maximum: 100.0,
    OverlayText: "50%",
    FillStyle: Style{ Foreground: Color.Rgb("6CBC5F") },
  }
}

func uiBenchSparkline(width int32) Sparkline {
  return uiBenchLargeSparkline(width, width)
}

func uiBenchLargeSparkline(count int32, width int32) Sparkline {
  let spark = Sparkline()
  spark.Width = CellLength.Cells(width)
  var i = 0
  while i < count {
    spark.Values.Add(float64((i * 17) % 101))
    i = i + 1
  }
  return spark
}

func uiBenchSpinner(width int32) Spinner {
  return Spinner{ Width: CellLength.Cells(width), Text: "building allocation benchmark" }
}

func uiBenchBadge(width int32) Badge {
  return Badge{ Width: CellLength.Cells(width), Text: "build passed" }
}

func uiBenchSeparator(width int32, height int32) Separator {
  return Separator{ Width: CellLength.Cells(width), Height: CellLength.Cells(height), Orientation: SeparatorOrientation.Horizontal }
}

func uiBenchTable(columns int32, rows int32, width int32, height int32) TableView {
  let table = TableView()
  table.Width = CellLength.Cells(width)
  table.Height = CellLength.Cells(height)
  table.SelectedRowStyle = Style{ Foreground: Color.Rgb("0E1117"), Background: Color.Rgb("C8CEDA") }
  var c = 0
  while c < columns {
    let column = TableColumn()
    column.Header = "column-" + c.ToString("D2")
    column.ColumnWidth = ColumnWidth.Cells(32)
    column.Alignment = (c % 3) == 0 ? HorizontalAlignment.Right : HorizontalAlignment.Left
    table.Columns.Add(column)
    c = c + 1
  }
  var r = 0
  while r < rows {
    let row = List[string]()
    c = 0
    while c < columns {
      row.Add("row-" + r.ToString("D4") + " column-" + c.ToString("D2") + " value")
      c = c + 1
    }
    table.Rows.Add(row)
    r = r + 1
  }
  return table
}

func uiBenchTree(children int32, expanded bool, width int32, height int32) TreeView {
  let tree = TreeView()
  tree.Width = CellLength.Cells(width)
  tree.Height = CellLength.Cells(height)
  tree.SelectedNodeStyle = Style{ Foreground: Color.Rgb("0E1117"), Background: Color.Rgb("C8CEDA") }
  let root = TreeNode()
  root.Text = "root"
  root.IsExpanded = expanded
  var i = 0
  while i < children {
    let node = TreeNode()
    node.Text = "entry-" + i.ToString("D4") + " allocation benchmark node"
    root.Children.Add(node)
    i = i + 1
  }
  tree.Roots.Add(root)
  return tree
}

func uiBenchStatus(width int32) StatusBar {
  let bar = StatusBar()
  bar.Width = CellLength.Cells(width)
  bar.Height = CellLength.Cells(1)
  bar.LeftText = "^C quit"
  bar.CenterText = "widget audit"
  bar.RightText = "200 items"
  return bar
}

func uiBenchStatusText(bar StatusBar, filtered bool) {
  if filtered {
    bar.LeftText = "^F filter"
    bar.CenterText = "filter: error"
    bar.RightText = "17 matches"
  } else {
    bar.LeftText = "^C quit"
    bar.CenterText = "widget audit"
    bar.RightText = "200 items"
  }
}

func uiBenchTextBlock(width int32, height int32) TextBlock {
  let text = TextBlock()
  text.Width = CellLength.Cells(width)
  text.Height = CellLength.Cells(height)
  text.Text = uiBenchParagraph(600)
  return text
}

func uiBenchRichTextBlock(count int32, width int32, height int32) RichTextBlock {
  let rich = RichTextBlock()
  rich.Width = CellLength.Cells(width)
  rich.Height = CellLength.Cells(height)
  let plain = Style()
  let accent = Style{ Foreground: Color.Rgb("6CBC5F"), Attributes: TextAttributes.Bold }
  let runs = List[TextRun]()
  var i = 0
  while i < count {
    runs.Add(TextRun("entry " + i.ToString() + " alpha bravo charlie delta ", (i % 2) == 0 ? plain : accent))
    i = i + 1
  }
  rich.Runs = runs
  return rich
}

func uiBenchMarkdownView(count int32, width int32, height int32) MarkdownView {
  let markdown = MarkdownView()
  markdown.Width = CellLength.Cells(width)
  markdown.Height = CellLength.Cells(height)
  markdown.Source = uiBenchMarkdownSource(count)
  return markdown
}

func uiBenchMarkdownSource(count int32) string {
  var source = "# Allocation benchmark\n\n"
  var i = 0
  while i < count {
    source = source + "- entry " + i.ToString() + " alpha bravo charlie delta echo foxtrot golf hotel\n"
    i = i + 1
  }
  return source
}

func uiBenchParagraph(count int32) string {
  var text = ""
  var i = 0
  while i < count {
    text = text + "entry " + i.ToString() + " alpha bravo charlie delta echo foxtrot golf hotel "
    i = i + 1
  }
  return text
}

func uiBenchList(count int32, width int32, height int32) ListView {
  let list = ListView()
  list.Width = CellLength.Cells(width)
  list.Height = CellLength.Cells(height)
  list.SelectionMarker = ""
  list.SelectedStyle = Style{ Foreground: Color.Rgb("0E1117"), Background: Color.Rgb("C8CEDA") }
  var i = 0
  while i < count {
    list.Add("entry-" + i.ToString("D4") + ".txt  "
      + (1024 + i * 17).ToString() + " bytes")
    i = i + 1
  }
  return list
}

func uiBenchDefaultMarkerList(count int32, width int32, height int32) ListView {
  let list = ListView()
  list.Width = CellLength.Cells(width)
  list.Height = CellLength.Cells(height)
  list.SelectedStyle = Style{ Foreground: Color.Rgb("0E1117"), Background: Color.Rgb("C8CEDA") }
  var i = 0
  while i < count {
    list.Add("entry-" + i.ToString("D4") + ".txt  "
      + (1024 + i * 17).ToString() + " bytes")
    i = i + 1
  }
  return list
}

func uiBenchPresentedList(count int32, width int32, height int32) ListView {
  let list = ListView()
  list.Width = CellLength.Cells(width)
  list.Height = CellLength.Cells(height)
  list.SelectionMarker = ""
  list.SelectedStyle = Style{ Foreground: Color.Rgb("0E1117"), Background: Color.Rgb("C8CEDA") }
  let accent = Style{ Foreground: Color.Rgb("6CBC5F"), Attributes: TextAttributes.Bold }
  var i = 0
  while i < count {
    let item = ListItem{ Id: "entry-" + i.ToString("D5") }
    if (i % 250) == 0 {
      item.Text = "section " + (i / 250).ToString()
      item.IsSelectable = false
      item.Style = Style{ Attributes: TextAttributes.Bold }
    } else if (i % 2) == 0 {
      item.Runs.Add(TextRun("entry-" + i.ToString("D5") + " ", Style()))
      item.Runs.Add(TextRun("active", accent))
    } else {
      item.Text = "entry-" + i.ToString("D5") + " allocation benchmark"
    }
    list.Items.Add(item)
    i = i + 1
  }
  list.RefreshItems()
  return list
}

func uiBenchScreen(width int32, height int32) Screen {
  let screen = Screen(width, height)
  screen.DefaultStyle = Style{ Foreground: Color.Rgb("C8CEDA"), Background: Color.Rgb("0E1117") }
  return screen
}

func uiBenchDraw(root Box, screen Screen, sink Terminal) int32 {
  screen.Clear()
  root.Draw(screen)
  return sink.Present(screen)
}

func uiBenchDrawClean(root Box, screen Screen, sink Terminal) int32 {
  root.Draw(screen)
  return sink.Present(screen)
}

func uiBenchKey(key Key) UiEvent {
  return UiEvent{ Kind: UiEventKind.Key, Key: key }
}

func uiBenchChar(text string) UiEvent {
  return UiEvent{ Kind: UiEventKind.TextInput, Key: Key.Character, Text: text }
}

func uiBenchCollect() {
  GC.Collect()
  GC.WaitForPendingFinalizers()
  GC.Collect()
}

func uiBenchResult(name string, sw Stopwatch, before int64, after int64,
  genBefore int32, genAfter int32, frames int32, bytes int32) {
  Console.WriteLine("SharpTUI|" + name + "|"
    + (sw.Elapsed.TotalMilliseconds * 1000.0 / float64(frames)).ToString("0.0") + "|"
    + ((after - before) / int64(frames)).ToString() + "|"
    + (float64(genAfter - genBefore) / float64(frames)).ToString("0.0000") + "|"
    + bytes.ToString())
}

func benchPaint(screen Screen, width int32, height int32, frame int32, line string) {
  screen.Resize(width, height + (frame % 2))
  screen.Clear()
  for y in 0 ... height { screen.Write(0, y, line) }
}

func benchReport(name string, sw Stopwatch, before int64, after int64, frames int32) {
  Console.WriteLine(name + ": "
    + (sw.Elapsed.TotalMilliseconds * 1000.0 / float64(frames)).ToString("0.0") + " us/frame  "
    + ((after - before) / int64(frames)).ToString() + " B/frame")
}

func benchMicro(name string, sw Stopwatch, before int64, after int64, count int32) {
  Console.WriteLine(name + ": "
    + (sw.Elapsed.TotalMilliseconds * 1000.0 / float64(count)).ToString("0.00") + " us/call  "
    + ((after - before) / int64(count)).ToString() + " B/call")
}
