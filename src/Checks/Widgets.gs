package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.Threading

func charEv(text string) UiEvent {
  return UiEvent{ Kind: UiEventKind.TextInput, Key: Key.Character, Text: text }
}

func keyEv(key Key) UiEvent {
  return UiEvent{ Kind: UiEventKind.Key, Key: key }
}

func mouseEv(column int32, row int32) UiEvent {
  return UiEvent{
    Kind: UiEventKind.Mouse,
    Mouse: MouseKind.Press,
    Position: CellPoint{ Column: column, Row: row },
  }
}

func tblRow(a string, b string) TableRow {
  let r = TableRow{ Id: a }
  r.Cells.Add(TableCell(a))
  r.Cells.Add(TableCell(b))
  return r
}

func makeTable() TableView {
  let t = TableView{ GrowWeight: 0, Height: CellLength.Cells(6) }
  t.Columns.Add(TableColumn{ Header: "Name", ColumnWidth: ColumnWidth.Cells(5) })
  t.Columns.Add(TableColumn{ Header: "Age", ColumnWidth: ColumnWidth.Share(1) })
  for n in 0 ... 20 {
    t.Rows.Add(tblRow("item" + n.ToString(), n.ToString()))
  }
  return t
}

public class WidgetCheck {
  shared {
    public func Run() int32 {
      var failed = 0

      let entry = TextInput{}
      let eroot = Box{ Children: { entry } }
      let escr = Screen(20, 3)
      eroot.Draw(escr)
      eroot.Handle(keyEv(Key.Tab))
      failed = failed + Checks.Expect(entry.IsFocused, "tab focuses the text input")

      eroot.Handle(charEv("a"))
      eroot.Handle(charEv("b"))
      eroot.Handle(charEv("c"))
      failed = failed + Checks.Expect(entry.Text == "abc", "three chars land in Text")
      failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 3, "caret follows the typing")

      eroot.Handle(keyEv(Key.Backspace))
      failed = failed + Checks.Expect(entry.Text == "ab", "backspace removes the char before the caret")
      failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 2, "caret moves back with the deletion")

      eroot.Handle(keyEv(Key.Left))
      eroot.Handle(charEv("X"))
      failed = failed + Checks.Expect(entry.Text == "aXb", "typing after Left inserts in the middle")

      eroot.Handle(keyEv(Key.Home))
      failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 0, "Home moves the caret to the start")
      eroot.Handle(keyEv(Key.End))
      failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 3, "End moves the caret to the end")
      entry.MoveCaretToStart()
      failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 0, "MoveCaretToStart moves to the first grapheme")
      entry.MoveCaretToEnd()
      failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 3, "MoveCaretToEnd moves past the final grapheme")

      let wide = TextInput{}
      let wroot = Box{ Children: { wide } }
      wroot.Draw(Screen(20, 3))
      wroot.Handle(keyEv(Key.Tab))
      wroot.Handle(charEv("日"))
      failed = failed + Checks.Expect(wide.Text == "日", "a CJK char is typed whole")
      failed = failed + Checks.Expect(wide.CaretGraphemeIndex == 1, "caret advances one cluster, not two columns")
      wroot.Handle(keyEv(Key.Backspace))
      failed = failed + Checks.Expect(wide.Text == "", "backspace removes the whole wide cluster")

      let secret = TextInput{ IsPassword: true }
      secret.Text = "hi"
      let sroot = Box{ Children: { secret } }
      let sscr = Screen(20, 3)
      sroot.Draw(sscr)
      failed = failed + Checks.Expect(sscr.Probe(0, 0) == "•", "a password input renders bullets, not the text")

      let ph = TextInput{ Placeholder: "hint", PlaceholderStyle: Style{} }
      let proot = Box{ Children: { ph } }
      let pscr = Screen(20, 3)
      proot.Draw(pscr)
      failed = failed + Checks.Expect(pscr.Probe(0, 0) == "h", "placeholder shows while empty and unfocused")
      proot.Handle(keyEv(Key.Tab))
      proot.Draw(pscr)
      failed = failed + Checks.Expect(pscr.Probe(0, 0) == " ", "placeholder hides once focused")

      let label = Label{ Text: "x", Alignment: HorizontalAlignment.Right, Width: CellLength.Cells(4) }
      let lroot = Box{ Children: { label } }
      let lscr = Screen(8, 3)
      lroot.Draw(lscr)
      failed = failed + Checks.Expect(lscr.Probe(3, 0) == "x", "Label.Alignment positions Text")
      label.Text = "日本"
      lroot.Draw(lscr)
      failed = failed + Checks.Expect(lscr.Probe(0, 0) == "日" && lscr.Probe(2, 0) == "本",
        "Label refreshes cached Unicode graphemes when Text changes")

      let boundedLabel = Label{ Text: "longer than its parent" }
      let boundedRoot = Column{
        Width: CellLength.Cells(5),
        Children: { boundedLabel },
      }
      let boundedScreen = Screen(12, 2)
      boundedRoot.Draw(boundedScreen)
      failed = failed + Checks.Expect(boundedLabel.Bounds.WidthCells == 5
        && boundedScreen.Probe(4, 0) == "e" && boundedScreen.Probe(5, 0) == " ",
        "auto-width Label respects available width and clips at its parent")

      let list = ListView{
        Width: CellLength.Cells(8),
        Height: CellLength.Cells(2),
        SelectionMarker: ">> ",
      }
      list.Add("one")
      list.Add("two")
      list.SelectedIndex = 1
      let listScreen = Screen(8, 2)
      list.Draw(listScreen)
      failed = failed + Checks.Expect(listScreen.Probe(0, 0) == " "
        && listScreen.Probe(2, 0) == " " && listScreen.Probe(3, 0) == "o"
        && listScreen.Probe(0, 1) == ">" && listScreen.Probe(3, 1) == "t",
        "ListView reserves the marker cells without joining each row")
      list.SelectedIndex = 0
      list.Draw(listScreen)
      failed = failed + Checks.Expect(listScreen.Probe(0, 0) == ">"
        && listScreen.Probe(0, 1) == " " && listScreen.Probe(2, 1) == " ",
        "ListView clears the previous marker cells when selection moves")

      let heading = ListItem{ Id: "heading", Text: "Inbox", IsSelectable: false }
      let inbox = ListItem{
        Id: "inbox",
        Text: "ignored",
        Runs: { TextRun("inbox", Style{ Attributes: TextAttributes.Bold }) },
      }
      let archive = ListItem{ Id: "archive", Text: "archive" }
      let presented = ListView{ Width: CellLength.Cells(12), Height: CellLength.Cells(3), SelectionMarker: "" }
      presented.Items.Add(heading)
      presented.Items.Add(inbox)
      presented.Items.Add(archive)
      presented.Refresh()
      let presentedRoot = Box{ Children: { presented } }
      let presentedScreen = Screen(12, 3)
      presentedRoot.Draw(presentedScreen)
      failed = failed + Checks.Expect(presented.SelectedIndex == 1 && presented.SelectedId == "inbox"
        && presentedScreen.Probe(0, 1) == "i", "ListView skips non-selectable rows and Runs override Text")
      presentedRoot.Focus(presented)
      presentedRoot.Handle(keyEv(Key.Down))
      if let moved = presented.ConsumeSelectionChange() {
        failed = failed + Checks.Expect(moved.PreviousIndex == 1 && moved.SelectedIndex == 2,
          "ListView exposes and consumes keyboard selection changes")
      } else {
        failed = failed + Checks.Expect(false, "ListView exposes keyboard selection changes")
      }
      presented.Items = List[ListItem]{ archive, heading, inbox }
      failed = failed + Checks.Expect(presented.SelectedIndex == 0 && presented.SelectedId == "archive"
        && presented.ConsumeSelectionChange() == nil,
        "ListView keeps a stable Id across item replacement without emitting a change")
      archive.IsSelectable = false
      presented.Refresh()
      failed = failed + Checks.Expect(presented.SelectedIndex == 2 && presented.SelectedId == "inbox",
        "ListView leaves an item that becomes non-selectable")

      let generated = ListView{}
      let generatedFirst = generated.Add("first")
      let generatedSecond = generated.Add("second")
      generated.SelectedIndex = 1
      generated.Items = List[ListItem]{ ListItem{ Id: generatedSecond.Id, Text: "second replacement" } }
      failed = failed + Checks.Expect(generatedFirst.Id != "" && generatedSecond.Id != ""
          && generatedFirst.Id != generatedSecond.Id && generated.SelectedIndex == 0
          && generated.SelectedId == generatedSecond.Id,
        "ListItem supplies a unique lifetime Id and caller Id restores replacement selection")

      let tail = ListView{ Width: CellLength.Cells(8), Height: CellLength.Cells(2), SelectionMarker: "", FollowTail: true }
      tail.Add("one")
      tail.Add("two")
      tail.Add("three")
      let tailRoot = Box{ Children: { tail } }
      let tailScreen = Screen(8, 2)
      tailRoot.Draw(tailScreen)
      failed = failed + Checks.Expect(tail.SelectedIndex == 2 && tail.FirstVisibleItemIndex == 1,
        "ListView.FollowTail pins selection and viewport to the tail")
      tail.Add("four")
      tailRoot.Draw(tailScreen)
      failed = failed + Checks.Expect(tail.SelectedIndex == 3 && tail.FirstVisibleItemIndex == 2,
        "ListView.FollowTail keeps up with appended items")
      tailRoot.Focus(tail)
      tailRoot.Handle(keyEv(Key.Up))
      tailRoot.Draw(tailScreen)
      failed = failed + Checks.Expect(!tail.FollowTail && tail.SelectedIndex == 2,
        "ListView.FollowTail disengages on upward navigation")

      let text = TextBlock{ Text: "one two four", Width: CellLength.Cells(4), Height: CellLength.Cells(2), Wrapping: TextWrapping.Word }
      let textRoot = Box{ Children: { text } }
      let textScreen = Screen(8, 4)
      textRoot.Draw(textScreen)
      failed = failed + Checks.Expect(textScreen.Probe(0, 0) == "o" && textScreen.Probe(0, 1) == "t",
        "TextBlock.Wrapping lays text out by words")
      text.ScrollToLine(1)
      failed = failed + Checks.Expect(text.FirstVisibleLine == 1, "TextBlock.ScrollToLine names the viewport state")

      let runs = List[TextRun]()
      runs.Add(TextRun("one two", Style()))
      let rich = RichTextBlock{ Runs: runs, Width: CellLength.Cells(4), Height: CellLength.Cells(2) }
      let richRoot = Box{ Children: { rich } }
      richRoot.Draw(Screen(8, 4))
      failed = failed + Checks.Expect(rich.LineCount() == 2, "RichTextBlock wraps Runs")
      rich.Runs = List[TextRun]{ TextRun("one two four", Style()) }
      richRoot.Draw(Screen(8, 4))
      failed = failed + Checks.Expect(rich.LineCount() == 3, "RichTextBlock invalidates after Runs replacement")

      let toggle = Toggle{ Text: "notifications", CheckedGlyph: "[yes] ", UncheckedGlyph: "[no] " }
      let troot = Box{ Children: { toggle } }
      let tscr = Screen(20, 3)
      troot.Draw(tscr)
      troot.Handle(keyEv(Key.Tab))
      troot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(toggle.IsChecked, "Enter flips Toggle.IsChecked on")
      troot.Handle(charEv(" "))
      failed = failed + Checks.Expect(!toggle.IsChecked, "space flips Toggle.IsChecked off")
      failed = failed + Checks.Expect(troot.Handle(mouseEv(2, 0)) == EventResult.Handled, "a click inside is accepted")
      failed = failed + Checks.Expect(toggle.IsChecked, "the inside click flipped Toggle.IsChecked back on")
      failed = failed + Checks.Expect(troot.Handle(mouseEv(2, 5)) == EventResult.Continue, "a click outside is ignored")
      failed = failed + Checks.Expect(toggle.IsChecked, "the outside click left Toggle.IsChecked alone")

      let one = Toggle{ Text: "one" }
      let two = Toggle{ Text: "two" }
      let group = RadioGroup{}
      group.Add(one)
      group.Add(two)
      let rroot = Box{ Children: { group } }
      rroot.Draw(Screen(20, 3))
      rroot.Focus(one)
      failed = failed + Checks.Expect(rroot.Handle(keyEv(Key.Enter)) == EventResult.Handled, "Enter selects a Toggle in a RadioGroup")
      failed = failed + Checks.Expect(one.IsChecked && Object.ReferenceEquals(group.SelectedToggle, one),
        "RadioGroup exposes its selected toggle")
      rroot.Focus(two)
      failed = failed + Checks.Expect(rroot.Handle(keyEv(Key.Enter)) == EventResult.Handled, "Enter selects another Toggle")
      failed = failed + Checks.Expect(two.IsChecked && !one.IsChecked && Object.ReferenceEquals(group.SelectedToggle, two),
        "RadioGroup clears the previous selection")
      failed = failed + Checks.Expect(rroot.Handle(keyEv(Key.Enter)) == EventResult.Handled && two.IsChecked && !one.IsChecked,
        "pressing the selected Toggle keeps the group selection")

      let declaredOne = Toggle{ Text: "declared one" }
      let declaredTwo = Toggle{ Text: "declared two" }
      let declaredGroup = RadioGroup{ Children: { declaredOne, declaredTwo } }
      let declaredRoot = Box{ Children: { declaredGroup } }
      declaredRoot.Draw(Screen(30, 4))
      declaredRoot.Focus(declaredOne)
      declaredRoot.Handle(keyEv(Key.Enter))
      declaredRoot.Focus(declaredTwo)
      declaredRoot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(declaredTwo.IsChecked && !declaredOne.IsChecked
        && Object.ReferenceEquals(declaredGroup.SelectedToggle, declaredTwo),
        "RadioGroup attaches declarative Children before selection handling")

      let button = Button{ Text: "apply" }
      let buttonRoot = Box{ Children: { button } }
      buttonRoot.Draw(Screen(20, 3))
      buttonRoot.Focus(button)
      buttonRoot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(button.IsPressed, "Button.IsPressed records Enter")
      failed = failed + Checks.Expect(button.ConsumePress(), "Button.ConsumePress reports the pending press")
      failed = failed + Checks.Expect(!button.IsPressed && !button.ConsumePress(),
        "Button.ConsumePress clears the pending press once")

      let half = ProgressBar{ Value: 5.0, Maximum: 10.0, Width: CellLength.Cells(10) }
      let hroot = Box{ Children: { half } }
      let hscr = Screen(20, 3)
      hroot.Draw(hscr)
      failed = failed + Checks.Expect(hscr.Probe(4, 0) == half.FilledGlyph, "half value fills up to the midpoint")
      failed = failed + Checks.Expect(hscr.Probe(5, 0) == half.EmptyGlyph, "half value leaves the rest empty")

      let zero = ProgressBar{ Value: 0.0, Maximum: 10.0, Width: CellLength.Cells(10) }
      let zroot = Box{ Children: { zero } }
      let zscr = Screen(20, 3)
      zroot.Draw(zscr)
      failed = failed + Checks.Expect(zscr.Probe(0, 0) == zero.EmptyGlyph, "zero value fills nothing")

      let over = ProgressBar{ Value: 25.0, Maximum: 10.0, Width: CellLength.Cells(10) }
      let oroot = Box{ Children: { over } }
      let oscr = Screen(20, 3)
      oroot.Draw(oscr)
      failed = failed + Checks.Expect(oscr.Probe(9, 0) == over.FilledGlyph, "a value above Maximum clamps to full")

      let maxless = ProgressBar{ Value: 5.0, Maximum: 0.0, Width: CellLength.Cells(10) }
      let mroot = Box{ Children: { maxless } }
      let mscr = Screen(20, 3)
      mroot.Draw(mscr)
      failed = failed + Checks.Expect(mscr.Probe(0, 0) == maxless.EmptyGlyph,
        "Maximum of 0 does not crash and fills nothing")

      let overlay = ProgressBar{ Value: 1.0, Maximum: 1.0, OverlayText: "ok", Width: CellLength.Cells(4) }
      let overlayRoot = Box{ Children: { overlay } }
      let overlayScreen = Screen(8, 3)
      overlayRoot.Draw(overlayScreen)
      failed = failed + Checks.Expect(overlayScreen.Probe(1, 0) == "o" && overlayScreen.Probe(2, 0) == "k",
        "ProgressBar.OverlayText overlays the centered label")

      let scale = NumericRange.Fixed(2.0, 6.0)
      failed = failed + Checks.Expect(!scale.IsAuto && scale.Minimum == 2.0 && scale.Maximum == 6.0,
        "NumericRange.Fixed preserves an explicit scale")
      failed = failed + Checks.Expect(NumericRange.Auto.IsAuto && rejectsNumericRange(3.0, 3.0)
        && rejectsNumericRange(4.0, 3.0), "NumericRange rejects an empty or reversed scale")

      let sparkline = Sparkline{ Values: { 0.0, 10.0 }, ValueRange: NumericRange.Fixed(0.0, 10.0), Width: CellLength.Cells(2) }
      let sparkRoot = Box{ Children: { sparkline } }
      let sparkScreen = Screen(4, 3)
      sparkRoot.Draw(sparkScreen)
      failed = failed + Checks.Expect(sparkScreen.Probe(0, 0) == char(0x2581).ToString()
        && sparkScreen.Probe(1, 0) == char(0x2588).ToString(),
        "Sparkline.ValueRange maps a fixed minimum and maximum")

      let autoSparkline = Sparkline{ Values: { 4.0, 8.0 }, Width: CellLength.Cells(2) }
      let autoSparkRoot = Box{ Children: { autoSparkline } }
      let autoSparkScreen = Screen(4, 3)
      autoSparkRoot.Draw(autoSparkScreen)
      failed = failed + Checks.Expect(autoSparkline.ValueRange.IsAuto
        && autoSparkScreen.Probe(0, 0) == char(0x2581).ToString()
        && autoSparkScreen.Probe(1, 0) == char(0x2588).ToString(),
        "Sparkline.ValueRange.Auto derives its scale from Values")

      let table = makeTable()
      let tabroot = Box{ Children: { table } }
      let tabscr = Screen(20, 10)
      tabroot.Draw(tabscr)
      failed = failed + Checks.Expect(tabscr.Probe(0, table.Bounds.Row) == "N", "the header sits on the first row")

      var downs = 0
      while downs < 6 {
        tabroot.Handle(keyEv(Key.Down))
        downs = downs + 1
      }
      failed = failed + Checks.Expect(table.SelectedRowIndex == 6, "six downs select row 6")
      failed = failed + Checks.Expect(table.FirstVisibleRowIndex == 2, "the window scrolls by the minimum to keep it visible")
      if let moved = table.ConsumeSelectionChange() {
        failed = failed + Checks.Expect(moved.PreviousIndex == 5 && moved.SelectedIndex == 6,
          "TableView exposes and consumes the latest user selection change")
      } else {
        failed = failed + Checks.Expect(false, "TableView exposes user selection changes")
      }
      table.SelectedRowIndex = 2
      failed = failed + Checks.Expect(table.ConsumeSelectionChange() == nil,
        "programmatic TableView selection clears pending output")
      tabroot.Handle(keyEv(Key.Down))
      table.Rows = List[TableRow]{ tblRow("replacement", "0") }
      failed = failed + Checks.Expect(table.SelectedRowIndex == 0 && table.ConsumeSelectionChange() == nil,
        "TableView Rows replacement normalizes selection and clears pending output")
      table.Rows.Add(tblRow("second", "1"))
      tabroot.Handle(keyEv(Key.Down))
      table.Rows.RemoveAt(1)
      table.Refresh()
      failed = failed + Checks.Expect(table.SelectedRowIndex == 0 && table.ConsumeSelectionChange() == nil,
        "TableView.Refresh clears pending output after direct Rows mutation")

      let stable = makeTable()
      stable.SelectedRowIndex = 3
      stable.Rows = List[TableRow]{ tblRow("item8", "8"), tblRow("item3", "3"), tblRow("item9", "9") }
      failed = failed + Checks.Expect(stable.SelectedRowIndex == 1 && stable.SelectedRowId == "item3",
        "TableView restores selection by stable row Id after filtering or sorting")

      let skipped = makeTable()
      skipped.Rows[1].IsSelectable = false
      skipped.Refresh()
      skipped.SelectedRowIndex = 0
      let skippedRoot = Box{ Children: { skipped } }
      skippedRoot.Draw(Screen(20, 10))
      skippedRoot.Focus(skipped)
      skippedRoot.Handle(keyEv(Key.Down))
      failed = failed + Checks.Expect(skipped.SelectedRowIndex == 2,
        "TableView keyboard navigation skips non-selectable rows")

      let table2 = makeTable()
      let tab2root = Box{ Children: { table2 } }
      tab2root.Draw(Screen(20, 10))
      tab2root.Handle(mouseEv(0, table2.Bounds.Row + 2))
      failed = failed + Checks.Expect(table2.SelectedRowIndex == 1, "a click on a data row selects it")

      let tableBlank = TableView{ GrowWeight: 0, Height: CellLength.Cells(5) }
      tableBlank.Columns.Add(TableColumn{ Header: "Name", ColumnWidth: ColumnWidth.Cells(5) })
      tableBlank.Rows.Add(tblRow("only", ""))
      let blankRoot = Box{ Children: { tableBlank } }
      blankRoot.Draw(Screen(20, 10))
      let blankResult = blankRoot.Handle(mouseEv(0, tableBlank.Bounds.Row + tableBlank.Bounds.HeightRows - 1))
      failed = failed + Checks.Expect(blankResult == EventResult.Continue && tableBlank.SelectedRowIndex == 0
          && tableBlank.ConsumeSelectionChange() == nil,
        "a click in empty TableView space does not select the last row")

      let table3 = TableView{ GrowWeight: 0, Height: CellLength.Cells(3) }
      table3.Columns.Add(TableColumn{ Header: "Name", ColumnWidth: ColumnWidth.Cells(5) })
      table3.Rows.Add(tblRow("abcdefgh", "x"))
      let tab3root = Box{ Children: { table3 } }
      let tab3scr = Screen(20, 10)
      tab3root.Draw(tab3scr)
      let dataY = table3.Bounds.Row + 1
      failed = failed + Checks.Expect(tab3scr.Probe(4, dataY) == "e", "a fixed width column truncates by display width")
      failed = failed + Checks.Expect(tab3scr.Probe(5, dataY) == " ", "truncation never spills into the gutter")

      let aligned = TableView{ GrowWeight: 0, Height: CellLength.Cells(3) }
      aligned.Columns.Add(TableColumn{
        Header: "N",
        ColumnWidth: ColumnWidth.Cells(4),
        Alignment: HorizontalAlignment.Right,
      })
      aligned.Rows.Add(tblRow("7", ""))
      let alignedRoot = Box{ Children: { aligned } }
      let alignedScreen = Screen(10, 5)
      alignedRoot.Draw(alignedScreen)
      failed = failed + Checks.Expect(alignedScreen.Probe(0, aligned.Bounds.Row) == "N",
        "TableColumn.HeaderAlignment remains independent from body alignment")
      failed = failed + Checks.Expect(alignedScreen.Probe(3, aligned.Bounds.Row + 1) == "7",
        "TableColumn.Alignment positions a cell")

      let richTable = TableView{
        GrowWeight: 0,
        Height: CellLength.Cells(3),
        ColumnSeparator: "│",
        ColumnSeparatorStyle: Style{ Foreground: Color.Rgb("E5484D") },
      }
      richTable.Columns.Add(TableColumn{ Header: "State", ColumnWidth: ColumnWidth.Cells(6) })
      richTable.Columns.Add(TableColumn{
        Header: "ID",
        ColumnWidth: ColumnWidth.Cells(8),
        Alignment: HorizontalAlignment.Right,
      })
      richTable.Rows.Add(TableRow{
        Id: "V-1",
        Cells: {
          TableCell{
            Runs: List[TextRun]{
              TextRun{ Text: "●", Style: Style{ Foreground: Color.Rgb("E5484D") } },
              TextRun{ Text: " open", Style: Style{ Foreground: Color.Rgb("FFFFFF") } },
            },
          },
          TableCell{ Text: "V-1", Style: Style{ Foreground: Color.Rgb("FFFFFF") } },
        },
      })
      let richTableRoot = Box{ Children: { richTable } }
      let richTableScreen = Screen(20, 5)
      richTableRoot.Draw(richTableScreen)
      let richY = richTable.Bounds.Row + 1
      failed = failed + Checks.Expect(richTableScreen.Probe(0, richY) == "●"
          && richTableScreen.Probe(6, richY) == "│" && richTableScreen.Probe(12, richY) == "V",
        "TableView draws styled runs, column separators, and aligned structured cells")
      failed = failed + Checks.Expect(richTableScreen.Flush().Contains("[38;2;229;72;77m"),
        "TableView emits cell and separator colors")

      let tabs = Tabs{ Titles: { "aa", "bb", "cc" } }
      let tsroot = Box{ Children: { tabs } }
      tsroot.Draw(Screen(30, 3))
      failed = failed + Checks.Expect(tsroot.Handle(keyEv(Key.Left)) == EventResult.Continue, "Left at the first tab clamps, no wrap")
      failed = failed + Checks.Expect(tabs.SelectedIndex == 0, "SelectedIndex stays at the first tab")
      failed = failed + Checks.Expect(tsroot.Handle(keyEv(Key.Right)) == EventResult.Handled, "Right moves to the next tab")
      failed = failed + Checks.Expect(tabs.SelectedIndex == 1, "SelectedIndex is now the second tab")
      if let moved = tabs.ConsumeSelectionChange() {
        failed = failed + Checks.Expect(moved.PreviousIndex == 0 && moved.SelectedIndex == 1,
          "Tabs exposes and consumes user selection changes")
      } else {
        failed = failed + Checks.Expect(false, "Tabs exposes user selection changes")
      }
      tsroot.Handle(keyEv(Key.Right))
      failed = failed + Checks.Expect(tabs.SelectedIndex == 2, "SelectedIndex is now the last tab")
      failed = failed + Checks.Expect(tsroot.Handle(keyEv(Key.Right)) == EventResult.Continue, "Right at the last tab clamps, no wrap")
      failed = failed + Checks.Expect(tabs.SelectedIndex == 2, "SelectedIndex stays at the last tab")
      tabs.Titles = List[string]{ "replacement" }
      failed = failed + Checks.Expect(tabs.SelectedIndex == 0 && tabs.ConsumeSelectionChange() == nil,
        "Tabs Titles replacement normalizes selection and clears pending output")
      tabs.Titles.Add("second")
      tsroot.Handle(keyEv(Key.Right))
      tabs.Titles.RemoveAt(1)
      tabs.Refresh()
      failed = failed + Checks.Expect(tabs.SelectedIndex == 0 && tabs.ConsumeSelectionChange() == nil,
        "Tabs.Refresh clears pending output after direct Titles mutation")
      tabs.Titles.Clear()
      failed = failed + Checks.Expect(tabs.SelectedIndex == 0, "SelectedIndex normalizes when Titles becomes empty")
      failed = failed + Checks.Expect(rejectsTabIndex(), "Tabs rejects a negative SelectedIndex")

      let click = Tabs{ Titles: { "aa", "bb", "cc" } }
      let ckroot = Box{ Children: { click } }
      ckroot.Draw(Screen(30, 3))
      ckroot.Handle(mouseEv(4, 0))
      failed = failed + Checks.Expect(click.SelectedIndex == 1, "a click activates the title under the pointer")
      let bar = StatusBar{ LeftText: "L", CenterText: "M", RightText: "R" }
      let broot = Box{ Children: { bar } }
      let bscr = Screen(10, 3)
      broot.Draw(bscr)
      failed = failed + Checks.Expect(bscr.Probe(0, 0) == "L", "LeftText lands at column zero")
      failed = failed + Checks.Expect(bscr.Probe(4, 0) == "M", "CenterText lands centred")
      failed = failed + Checks.Expect(bscr.Probe(bar.Bounds.WidthCells - 1, 0) == "R", "RightText is flush with the right edge")

      let area = TextArea{}
      area.Text = "ab\ncd"
      let aroot = Box{ Children: { area } }
      aroot.Draw(Screen(20, 6))
      aroot.Focus(area)
      failed = failed + Checks.Expect(area.Text == "ab\ncd", "Text preserves newlines")
      failed = failed + Checks.Expect(!area.IsModified, "Text assignment leaves the buffer clean")

      aroot.Handle(keyEv(Key.Down))
      failed = failed + Checks.Expect(area.Caret.LineIndex == 1 && !area.IsModified,
        "moving the caret is not an edit")

      aroot.Handle(keyEv(Key.Right))
      aroot.Handle(charEv("X"))
      failed = failed + Checks.Expect(area.Text == "ab\ncXd" && area.IsModified,
        "a typed cluster inserts at the caret")

      aroot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(area.Text == "ab\ncX\nd", "Enter splits at the caret")

      aroot.Handle(keyEv(Key.Backspace))
      failed = failed + Checks.Expect(area.Caret.LineIndex == 1, "Backspace at column zero joins lines")
      failed = failed + Checks.Expect(area.Text == "ab\ncXd", "Text round trips the buffer")

      let cjk = TextArea{}
      cjk.Text = "日本"
      let cjkRoot = Box{ Children: { cjk } }
      cjkRoot.Draw(Screen(20, 6))
      cjkRoot.Focus(cjk)
      cjkRoot.Handle(keyEv(Key.Right))
      cjkRoot.Handle(charEv("!"))
      failed = failed + Checks.Expect(cjk.Text == "日!本", "the caret indexes clusters, not bytes")

      failed = failed + runWidgetScenario()
      return failed
    }
  }
}

private func rejectsNumericRange(minimum float64, maximum float64) bool {
  try {
    NumericRange.Fixed(minimum, maximum)
    return false
  } catch (error ArgumentOutOfRangeException) {
    return true
  }
}

private func rejectsTabIndex() bool {
  try {
    let tabs = Tabs{}
    tabs.SelectedIndex = -1
    return false
  } catch (error ArgumentOutOfRangeException) {
    return true
  }
}
private class CheckListSource : KeyedSource[ListItem, string] {
  private var items List[ListItem]

  public init() {
    items = List[ListItem]{
      ListItem{ Id: "first", Text: "first" },
      ListItem{ Id: "selected", Text: "selected" },
    }
  }

  public func Count() int32 { return items.Count }
  public func ItemAt(index int32) ListItem { return items[index] }

  public func IndexOfKey(key string) int32 {
    var i = 0
    while i < items.Count {
      if items[i].Id == key { return i }
      i = i + 1
    }
    return -1
  }

  public func MoveSelectedFirst() {
    let selected = items[1]
    items[1] = items[0]
    items[0] = selected
  }
}

private class CheckTableSource : KeyedSource[TableRow, string] {
  private var rows List[TableRow]

  public init() {
    rows = List[TableRow]{
      TableRow{ Id: "first", Cells: { TableCell("first") } },
      TableRow{ Id: "selected", Cells: { TableCell("selected") } },
    }
  }

  public func Count() int32 { return rows.Count }
  public func ItemAt(index int32) TableRow { return rows[index] }

  public func IndexOfKey(key string) int32 {
    var i = 0
    while i < rows.Count {
      if rows[i].Id == key { return i }
      i = i + 1
    }
    return -1
  }

  public func MoveSelectedFirst() {
    let selected = rows[1]
    rows[1] = rows[0]
    rows[0] = selected
  }
}

private class ScenarioTreeSource : TreeSource {
  private var root TreeNode
  private var child TreeNode

  public init() {
    root = TreeNode{ Text: "virtual root", Value: "root", IsExpanded: true }
    child = TreeNode{ Text: "virtual child", Value: "child" }
  }

  public func Count() int32 {
    return root.IsExpanded ? 2 : 1
  }

  public func ItemAt(index int32) TreeRow {
    if index == 0 {
      return TreeRow{ Node: root, Depth: 0, ParentIndex: -1, ChildCount: 1 }
    }
    return TreeRow{ Node: child, Depth: 1, ParentIndex: 0, ChildCount: 0 }
  }

  public func IndexOfKey(key string) int32 {
    if root.Id == key { return 0 }
    if root.IsExpanded && child.Id == key { return 1 }
    return -1
  }

  public func Toggle(index int32) {
    if index == 0 { root.IsExpanded = !root.IsExpanded }
  }
}

private class MillionTreeSource : TreeSource {
  private var nodes List[TreeNode]
  public prop ItemReads int32 { get; set; }

  public init() {
    nodes = List[TreeNode]()
    for i in 0 ... 8 {
      nodes.Add(TreeNode{ Text: "virtual row " + i.ToString(), Value: i.ToString() })
    }
    ItemReads = 0
  }

  public func Count() int32 {
    return 1000000
  }

  public func ItemAt(index int32) TreeRow {
    ItemReads = ItemReads + 1
    let at = index < nodes.Count ? index : 0
    return TreeRow{ Node: nodes[at], Depth: 0, ParentIndex: -1, ChildCount: 0 }
  }

  public func IndexOfKey(key string) int32 {
    var i = 0
    while i < nodes.Count {
      if nodes[i].Id == key { return i }
      i = i + 1
    }
    return -1
  }

  public func Toggle(index int32) {}
}

private class WidgetScenarioView : View {
  private var root Box
  private var surface CanvasSurface
  private var status Label
  private var worker Worker[string]?
  private var trigger Command

  public prop Root Box { get { return root } }
  public prop Trigger Command { get { return trigger } }
  public prop Surface CanvasSurface { get { return surface } }

  public init() {
    let tree = TreeView{
      Width: CellLength.Cells(28),
      Height: CellLength.Cells(3),
    }
    tree.Source = ScenarioTreeSource()
    let canvas = CanvasView(4, 2, CanvasMode.Braille)
    canvas.Width = CellLength.Cells(4)
    canvas.Height = CellLength.Cells(2)
    surface = canvas.Surface
    status = Label{ Text: "idle", Width: CellLength.Cells(28) }
    root = Column{
      Width: CellLength.Cells(28),
      Height: CellLength.Cells(8),
      Children: { tree, canvas, status },
    }
    trigger = Command("scenario.command", "scenario command", KeyGesture.Ctrl("k"))
    worker = nil
  }

  public func Attach(worker Worker[string]) {
    this.worker = worker
  }

  public func ApplyPending() {
    if trigger.Consume() { status.Text = "command activated" }
    if let active = worker {
      var value string
      if active.ConsumeResult(out value) { status.Text = value }
      if active.ConsumeError() != nil { status.Text = "worker failed" }
    }
  }

  public func Draw(screen Screen) {
    ApplyPending()
    root.Draw(screen)
  }

  public func Handle(ev UiEvent) EventResult {
    return root.Handle(ev)
  }
}

private func runWidgetScenario() int32 {
  var failed = 0
  let ownedCanvas = CanvasView(3, 2, CanvasMode.Cell)
  ownedCanvas.Surface.Point(0, 0)
  ownedCanvas.Surface.Resize(4, 2)
  let ownedScreen = Screen(4, 2)
  ownedCanvas.Draw(ownedScreen)
  failed = failed + Checks.Expect(ownedCanvas.Surface.WidthCells == 4
      && ownedCanvas.Surface.HeightRows == 2
      && ownedScreen.Probe(0, 0) == " ",
    "owned canvases resize by clearing their retained surface")

  let firstDuplicate = TreeNode{ Id: "first", Text: "first", Value: "duplicate" }
  let selectedDuplicate = TreeNode{ Id: "selected", Text: "selected", Value: "duplicate" }
  let identityTree = TreeView{
    Roots: { firstDuplicate, selectedDuplicate },
    Width: CellLength.Cells(12),
    Height: CellLength.Cells(2),
  }
  identityTree.SelectedIndex = 1
  identityTree.Roots = List[TreeNode]{
    TreeNode{ Id: "selected", Text: "selected rebuilt", Value: "duplicate" },
    TreeNode{ Id: "first", Text: "first rebuilt", Value: "duplicate" },
  }
  failed = failed + Checks.Expect(identityTree.SelectedIndex == 0
      && identityTree.SelectedNode != nil
      && identityTree.SelectedNode!!.Id == "selected",
    "tree selection restoration uses stable Id rather than duplicate Value")

  let listSource = CheckListSource()
  let sourcedList = ListView{ Source: listSource }
  sourcedList.SelectedIndex = 1
  listSource.MoveSelectedFirst()
  sourcedList.Refresh()
  failed = failed + Checks.Expect(sourcedList.SelectedIndex == 0
      && sourcedList.SelectedId == "selected",
    "list source refresh restores selection through source-owned key lookup")

  let tableSource = CheckTableSource()
  let sourcedTable = TableView{ Source: tableSource }
  sourcedTable.SelectedRowIndex = 1
  tableSource.MoveSelectedFirst()
  sourcedTable.Refresh()
  failed = failed + Checks.Expect(sourcedTable.SelectedRowIndex == 0
      && sourcedTable.SelectedRowId == "selected",
    "table source refresh restores selection through source-owned key lookup")

  let million = MillionTreeSource()
  let virtualTree = TreeView{
    Source: million,
    Width: CellLength.Cells(20),
    Height: CellLength.Cells(3),
  }
  virtualTree.Draw(Screen(20, 3))
  failed = failed + Checks.Expect(million.ItemReads <= 8,
    "virtual tree fetches visible rows instead of materializing its million-row source")

  let timeline = TestDriver(Label{ Text: "timeline" }, 12, 2)
  var firstProgress = -1.0
  var secondProgress = -1.0
  let timelineRecipe = Animation.Sequence(
    Animation.Tween(TimeSpan.FromMilliseconds(100.0),
      (progress float64) -> { firstProgress = progress }, Easing.Linear),
    Animation.Wait(TimeSpan.FromMilliseconds(50.0)),
    Animation.Tween(TimeSpan.FromMilliseconds(100.0),
      (progress float64) -> { secondProgress = progress }, Easing.Linear))
  let sequenceHandle = timeline.App.Animations.Play(timelineRecipe)
  timeline.Advance(TimeSpan.FromMilliseconds(125.0))
  failed = failed + Checks.Expect(Math.Abs(firstProgress - 1.0) < 0.0001
      && secondProgress < 0.0 && sequenceHandle.State == AnimationState.Running,
    "animation sequence finishes prior children and holds during waits")
  timeline.Advance(TimeSpan.FromMilliseconds(75.0))
  failed = failed + Checks.Expect(Math.Abs(secondProgress - 0.5) < 0.0001,
    "animation sequence maps absolute time into the active child")
  timeline.Advance(TimeSpan.FromMilliseconds(50.0))
  failed = failed + Checks.Expect(Math.Abs(secondProgress - 1.0) < 0.0001
      && sequenceHandle.State == AnimationState.Completed,
    "animation sequence applies its exact terminal state")

  var repeatProgress = -1.0
  var parallelProgress = -1.0
  let parallel = Animation.Parallel(
    Animation.Repeat(Animation.Tween(TimeSpan.FromMilliseconds(20.0),
      (progress float64) -> { repeatProgress = progress }, Easing.Linear), 2),
    Animation.Tween(TimeSpan.FromMilliseconds(40.0),
      (progress float64) -> { parallelProgress = progress }, Easing.Linear))
  let parallelHandle = timeline.App.Animations.Play(parallel)
  timeline.Advance(TimeSpan.FromMilliseconds(30.0))
  failed = failed + Checks.Expect(Math.Abs(repeatProgress - 0.5) < 0.0001
      && Math.Abs(parallelProgress - 0.75) < 0.0001,
    "parallel and repeat map the same absolute time independently")
  timeline.Advance(TimeSpan.FromMilliseconds(16.0))
  failed = failed + Checks.Expect(Math.Abs(repeatProgress - 1.0) < 0.0001,
    "repeat applies its exact terminal value")
  failed = failed + Checks.Expect(Math.Abs(parallelProgress - 1.0) < 0.0001,
    "parallel applies each child's exact terminal value")
  failed = failed + Checks.Expect(parallelHandle.State == AnimationState.Completed,
    "parallel handle completes with its children")

  var cancelledProgress = -1.0
  let cancelled = timeline.App.Animations.Play(Animation.Repeat(
    Animation.Tween(TimeSpan.FromMilliseconds(100.0),
      (progress float64) -> { cancelledProgress = progress }, Easing.SineInOut)))
  cancelled.Cancel()
  timeline.Pump()
  failed = failed + Checks.Expect(cancelled.State == AnimationState.Cancelled
      && cancelledProgress < 0.0,
    "cancelling before a sample removes the animation without mutating state")

  var finishedProgress = -1.0
  let finished = timeline.App.Animations.Play(Animation.Tween(
    TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> { finishedProgress = progress }, Easing.CubicInOut))
  finished.Finish()
  timeline.Pump()
  failed = failed + Checks.Expect(finished.State == AnimationState.Completed
      && Math.Abs(finishedProgress - 1.0) < 0.0001,
    "finishing applies the exact terminal sample")
  var elasticProgress = -1.0
  let elasticDriver = TestDriver(Label{ Text: "elastic" }, 1, 1)
  let elasticHandle = elasticDriver.App.Animations.Play(Animation.Tween(
    TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> { elasticProgress = progress }, Easing.ElasticInOut))
  elasticDriver.Pump()
  let elasticStart = elasticProgress
  elasticDriver.Advance(TimeSpan.FromMilliseconds(50.0))
  let elasticMiddle = elasticProgress
  elasticDriver.Advance(TimeSpan.FromMilliseconds(50.0))
  failed = failed + Checks.Expect(Math.Abs(elasticStart) < 0.0001
      && Math.Abs(elasticMiddle - 0.5) < 0.0001
      && Math.Abs(elasticProgress - 1.0) < 0.0001
      && elasticHandle.State == AnimationState.Completed,
    "ElasticInOut preserves its start, midpoint, and end")

  var elasticInProgress = -1.0
  elasticDriver.App.Animations.Play(Animation.Tween(
    TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> { elasticInProgress = progress }, Easing.ElasticIn))
  elasticDriver.Advance(TimeSpan.FromMilliseconds(50.0))
  let elasticInMiddle = elasticInProgress
  var elasticOutProgress = -1.0
  elasticDriver.App.Animations.Play(Animation.Tween(
    TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> { elasticOutProgress = progress }, Easing.ElasticOut))
  elasticDriver.Advance(TimeSpan.FromMilliseconds(50.0))
  failed = failed + Checks.Expect(Math.Abs(elasticInMiddle + 0.015625) < 0.0001
      && Math.Abs(elasticOutProgress - 1.015625) < 0.0001,
    "ElasticIn and ElasticOut preserve their mirrored midpoint overshoot")

  let lerpScalarLow = Animation.Lerp(10.0, 20.0, -1.0)
  let lerpScalarHigh = Animation.Lerp(10.0, 20.0, 2.0)
  let lerpIntLow = Animation.Lerp(int32(10), int32(20), -1.0)
  let lerpIntHigh = Animation.Lerp(int32(10), int32(20), 2.0)
  let lerpPointFrom = CellPoint{ Column: 2, Row: 4 }
  let lerpPointTo = CellPoint{ Column: 8, Row: 10 }
  let lerpPointLow = Animation.Lerp(lerpPointFrom, lerpPointTo, -1.0)
  let lerpPointHigh = Animation.Lerp(lerpPointFrom, lerpPointTo, 2.0)
  let lerpColorFrom = Color.Rgb(16, 32, 48)
  let lerpColorTo = Color.Rgb(160, 176, 192)
  let lerpColorLow = Animation.Lerp(lerpColorFrom, lerpColorTo, -1.0)
  let lerpColorHigh = Animation.Lerp(lerpColorFrom, lerpColorTo, 2.0)
  failed = failed + Checks.Expect(
    Math.Abs(lerpScalarLow - 10.0) < 0.0001
      && Math.Abs(lerpScalarHigh - 20.0) < 0.0001
      && lerpIntLow == int32(10) && lerpIntHigh == int32(20)
      && lerpPointLow.Column == lerpPointFrom.Column
      && lerpPointLow.Row == lerpPointFrom.Row
      && lerpPointHigh.Column == lerpPointTo.Column
      && lerpPointHigh.Row == lerpPointTo.Row
      && lerpColorLow == lerpColorFrom && lerpColorHigh == lerpColorTo,
    "all Animation.Lerp overloads clamp out-of-range progress")

  var sequenceChildSamples = 0
  let sequenceChildDriver = TestDriver(Label{ Text: "sequence callbacks" }, 1, 1)
  let sequenceChildRecipe = Animation.Sequence(
    Animation.Tween(TimeSpan.FromMilliseconds(20.0),
      (progress float64) -> { sequenceChildSamples = sequenceChildSamples + 1 }, Easing.Linear),
    Animation.Wait(TimeSpan.FromMilliseconds(100.0)))
  let sequenceChildHandle = sequenceChildDriver.App.Animations.Play(sequenceChildRecipe)
  sequenceChildDriver.Advance(TimeSpan.FromMilliseconds(20.0))
  sequenceChildDriver.Advance(TimeSpan.FromMilliseconds(16.0))
  failed = failed + Checks.Expect(sequenceChildSamples == 1
      && sequenceChildHandle.State == AnimationState.Running,
    "a completed Sequence child is not sampled again")

  var parallelChildSamples = 0
  let parallelChildDriver = TestDriver(Label{ Text: "parallel callbacks" }, 1, 1)
  let parallelChildRecipe = Animation.Parallel(
    Animation.Tween(TimeSpan.FromMilliseconds(20.0),
      (progress float64) -> { parallelChildSamples = parallelChildSamples + 1 }, Easing.Linear),
    Animation.Wait(TimeSpan.FromMilliseconds(100.0)))
  let parallelChildHandle = parallelChildDriver.App.Animations.Play(parallelChildRecipe)
  parallelChildDriver.Advance(TimeSpan.FromMilliseconds(20.0))
  parallelChildDriver.Advance(TimeSpan.FromMilliseconds(16.0))
  failed = failed + Checks.Expect(parallelChildSamples == 1
      && parallelChildHandle.State == AnimationState.Running,
    "a completed Parallel child is not sampled again")

  var replaySamples = 0
  let replayDriver = TestDriver(Label{ Text: "recipe replay" }, 1, 1)
  let replayRecipe = Animation.Sequence(
    Animation.Tween(TimeSpan.FromMilliseconds(10.0),
      (progress float64) -> { replaySamples = replaySamples + 1 }, Easing.Linear),
    Animation.Wait(TimeSpan.FromMilliseconds(10.0)))
  let firstReplay = replayDriver.App.Animations.Play(replayRecipe)
  replayDriver.Advance(TimeSpan.FromMilliseconds(20.0))
  let secondReplay = replayDriver.App.Animations.Play(replayRecipe)
  replayDriver.Advance(TimeSpan.FromMilliseconds(20.0))
  failed = failed + Checks.Expect(replaySamples == 2
      && firstReplay.State == AnimationState.Completed
      && secondReplay.State == AnimationState.Completed,
    "one animation recipe can be played again after completion")

  var concurrentSamples = 0
  let concurrentDriver = TestDriver(Label{ Text: "concurrent recipe" }, 1, 1)
  let concurrentRecipe = Animation.Tween(TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> { concurrentSamples = concurrentSamples + 1 }, Easing.Linear)
  let concurrentFirst = concurrentDriver.App.Animations.Play(concurrentRecipe)
  let concurrentSecond = concurrentDriver.App.Animations.Play(concurrentRecipe)
  concurrentDriver.Advance(TimeSpan.FromMilliseconds(50.0))
  failed = failed + Checks.Expect(concurrentSamples == 2
      && concurrentFirst.State == AnimationState.Running
      && concurrentSecond.State == AnimationState.Running,
    "concurrent plays of one recipe own isolated runtime state")

  var finiteZeroRejected = false
  try {
    Animation.Repeat(Animation.Wait(TimeSpan.Zero), 2)
  } catch (error ArgumentException) {
    finiteZeroRejected = true
  }
  var indefiniteZeroRejected = false
  try {
    Animation.Repeat(Animation.Wait(TimeSpan.Zero))
  } catch (error ArgumentException) {
    indefiniteZeroRejected = true
  }
  let indefiniteChild = Animation.Repeat(Animation.Wait(
    TimeSpan.FromMilliseconds(20.0)))
  var indefiniteChildRejected = false
  try {
    Animation.Repeat(indefiniteChild, 2)
  } catch (error ArgumentException) {
    indefiniteChildRejected = true
  }
  failed = failed + Checks.Expect(finiteZeroRejected && indefiniteZeroRejected
      && indefiniteChildRejected,
    "Repeat rejects zero-duration and indefinite children")

  var boundarySamples = 0
  var boundaryProgress = -1.0
  let boundaryDriver = TestDriver(Label{ Text: "repeat boundary" }, 1, 1)
  let boundaryHandle = boundaryDriver.App.Animations.Play(Animation.Repeat(
    Animation.Tween(TimeSpan.FromMilliseconds(20.0),
      (progress float64) -> {
        boundarySamples = boundarySamples + 1
        boundaryProgress = progress
      }, Easing.Linear), 2))
  boundaryDriver.Advance(TimeSpan.FromMilliseconds(20.0))
  let startsNextCycle = boundarySamples == 1 && Math.Abs(boundaryProgress) < 0.0001
  boundaryDriver.Advance(TimeSpan.FromMilliseconds(20.0))
  failed = failed + Checks.Expect(startsNextCycle && boundarySamples == 2
      && Math.Abs(boundaryProgress - 1.0) < 0.0001
      && boundaryHandle.State == AnimationState.Completed,
    "an exact repeat boundary invokes one callback per boundary")

  var scaledProgress = -1.0
  let scaleDriver = TestDriver(Label{ Text: "motion scale" }, 1, 1)
  let scaledHandle = scaleDriver.App.Animations.Play(Animation.Tween(
    TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> { scaledProgress = progress }, Easing.Linear))
  scaleDriver.Advance(TimeSpan.FromMilliseconds(20.0))
  let beforeScaleChange = scaledProgress
  scaleDriver.App.Animations.MotionScale = 2.0
  scaleDriver.Pump()
  let unchangedAtScaleChange = Math.Abs(scaledProgress - beforeScaleChange) < 0.0001
  scaleDriver.Advance(TimeSpan.FromMilliseconds(20.0))
  failed = failed + Checks.Expect(unchangedAtScaleChange
      && Math.Abs(scaledProgress - 0.6) < 0.0001
      && scaledHandle.State == AnimationState.Running,
    "MotionScale changes preserve progress until new time accrues")

  var rejectsNaN = false
  try {
    scaleDriver.App.Animations.MotionScale = Double.NaN
  } catch (error ArgumentOutOfRangeException) {
    rejectsNaN = true
  }
  var rejectsPositiveInfinity = false
  try {
    scaleDriver.App.Animations.MotionScale = Double.PositiveInfinity
  } catch (error ArgumentOutOfRangeException) {
    rejectsPositiveInfinity = true
  }
  failed = failed + Checks.Expect(rejectsNaN && rejectsPositiveInfinity,
    "MotionScale rejects NaN and positive infinity")

  let waitDriver = TestDriver(Label{ Text: "wait" }, 1, 1)
  let waitHandle = waitDriver.App.Animations.Play(Animation.Wait(
    TimeSpan.FromMilliseconds(100.0)))
  let waitActiveChanged = waitDriver.App.SampleAnimations(0)
  let waitCompletedChanged = waitDriver.App.SampleAnimations(100)
  failed = failed + Checks.Expect(!waitActiveChanged
      && waitCompletedChanged && waitHandle.State == AnimationState.Completed,
    "Wait sampling is quiet while active but changes on completion")

  var requestProgress = -1.0
  let requestDriver = TestDriver(Label{ Text: "requests" }, 1, 1)
  let requestHandle = requestDriver.App.Animations.Play(Animation.Tween(
    TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> { requestProgress = progress }, Easing.Linear))
  requestHandle.Cancel()
  requestHandle.Finish()
  let requestStillRunning = requestHandle.State == AnimationState.Running
  requestDriver.Pump()
  failed = failed + Checks.Expect(requestStillRunning
      && requestHandle.State == AnimationState.Cancelled,
    "Cancel then Finish keeps the first request and defers State until Pump")

  var finishFirstProgress = -1.0
  let finishFirst = requestDriver.App.Animations.Play(Animation.Tween(
    TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> { finishFirstProgress = progress }, Easing.Linear))
  finishFirst.Finish()
  finishFirst.Cancel()
  let finishFirstStillRunning = finishFirst.State == AnimationState.Running
  requestDriver.Pump()
  failed = failed + Checks.Expect(finishFirstStillRunning
      && finishFirst.State == AnimationState.Completed
      && Math.Abs(finishFirstProgress - 1.0) < 0.0001,
    "Finish then Cancel keeps the first request and applies its terminal sample")

  let view = WidgetScenarioView()
  let driver = TestDriver(view.Root, 30, 8)
  driver.App.Keys.Add(view.Trigger, BindingPhase.BeforeWidgets)

  let first = driver.Draw()
  failed = failed + Checks.Expect(first.Contains("virtual child"), "TestDriver draws virtual source data")

  let animation = Animation.Tween(TimeSpan.FromMilliseconds(100.0),
    (progress float64) -> {
      view.Surface.Clear()
      let x = int32(progress * float64(view.Surface.SubcellWidth - 1))
      view.Surface.Point(x, 0)
    }, Easing.Linear)
  driver.App.Animations.Play(animation)
  let animatedBefore = driver.Draw()
  driver.Advance(TimeSpan.FromMilliseconds(50.0))
  let animatedAfter = driver.Draw()
  failed = failed + Checks.Expect(animatedBefore != animatedAfter,
    "manual animation time changes the captured canvas frame")

  driver.Send(UiEvent{
    Kind: UiEventKind.Key,
    Key: Key.Character,
    Text: "k",
    Modifiers: KeyModifiers.Ctrl,
    Phase: KeyPhase.Press,
  })
  view.ApplyPending()
  let commandFrame = driver.Draw()
  failed = failed + Checks.Expect(commandFrame.Contains("command activated"),
    "normal App key routing activates a Command")

  let ready = AutoResetEvent(false)
  let worker = driver.App.StartWorker[string]((token CancellationToken) -> {
    ready.Set()
    return "worker complete"
  })
  view.Attach(worker)
  ready.WaitOne(1000)
  var turns = 0
  while turns < 1000 && worker.State == WorkerState.Running {
    driver.Pump()
    Thread.Yield()
    turns = turns + 1
  }
  view.ApplyPending()
  driver.Resize(31, 8)
  let finalFrame = driver.Draw()
  failed = failed + Checks.Expect(finalFrame.Contains("virtual child"),
    "worker completion preserves virtual source data")
  failed = failed + Checks.Expect(finalFrame.Contains("worker complete"),
    "worker completion becomes visible after App pumping")
  failed = failed + Checks.Expect(worker.State == WorkerState.Completed,
    "worker reaches completed state on the UI thread")

  let failedWorker = driver.App.StartWorker[string]((token CancellationToken) -> {
    throw InvalidOperationException("worker failure")
  })
  turns = 0
  while turns < 1000 && failedWorker.State == WorkerState.Running {
    driver.Pump()
    Thread.Yield()
    turns = turns + 1
  }
  let workerError = failedWorker.ConsumeError()
  failed = failed + Checks.Expect(failedWorker.State == WorkerState.Failed
      && workerError != nil && workerError!!.Message == "worker failure"
      && failedWorker.ConsumeError() == nil,
    "worker failures become terminal and are consumed once")

  let cancellationStarted = AutoResetEvent(false)
  let cancellationRelease = AutoResetEvent(false)
  let cancelledWorker = driver.App.StartWorker[string]((token CancellationToken) -> {
    cancellationStarted.Set()
    cancellationRelease.WaitOne()
    return "ignored cancellation"
  })
  cancellationStarted.WaitOne(1000)
  cancelledWorker.Cancel()
  let stayedRunning = cancelledWorker.State == WorkerState.Running
  cancellationRelease.Set()
  turns = 0
  while turns < 1000 && cancelledWorker.State == WorkerState.Running {
    driver.Pump()
    Thread.Yield()
    turns = turns + 1
  }
  var cancelledValue string
  failed = failed + Checks.Expect(stayedRunning
      && cancelledWorker.State == WorkerState.Cancelled
      && !cancelledWorker.ConsumeResult(out cancelledValue),
    "worker cancellation becomes terminal only after ignored work exits")
  driver.Send(UiEvent{ Kind: UiEventKind.Key, Key: Key.Tab, Phase: KeyPhase.Press })
  failed = failed + Checks.Expect(driver.FocusedElement != nil,
    "TestDriver exposes focus after normal input routing")
  return failed
}
