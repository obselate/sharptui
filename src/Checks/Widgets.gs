package SharpTui

import SharpTui

import System
import System.Collections.Generic

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
      failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 0, "MoveCaretToStart uses CaretPlacement.Start")
      entry.MoveCaretToEnd()
      failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 3, "MoveCaretToEnd uses CaretPlacement.End")

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
      presented.RefreshItems()
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
      presented.RefreshItems()
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
      runs.Clear()
      runs.Add(TextRun("one two four", Style()))
      richRoot.Draw(Screen(8, 4))
      failed = failed + Checks.Expect(rich.LineCount() == 3, "RichTextBlock invalidates after Runs mutate")

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
      table.RefreshRows()
      failed = failed + Checks.Expect(table.SelectedRowIndex == 0 && table.ConsumeSelectionChange() == nil,
        "TableView.RefreshRows clears pending output after direct Rows mutation")

      let stable = makeTable()
      stable.SelectedRowIndex = 3
      stable.Rows = List[TableRow]{ tblRow("item8", "8"), tblRow("item3", "3"), tblRow("item9", "9") }
      failed = failed + Checks.Expect(stable.SelectedRowIndex == 1 && stable.SelectedRowId == "item3",
        "TableView restores selection by stable row Id after filtering or sorting")

      let skipped = makeTable()
      skipped.Rows[1].IsSelectable = false
      skipped.RefreshRows()
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
      tabs.RefreshTitles()
      failed = failed + Checks.Expect(tabs.SelectedIndex == 0 && tabs.ConsumeSelectionChange() == nil,
        "Tabs.RefreshTitles clears pending output after direct Titles mutation")
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
