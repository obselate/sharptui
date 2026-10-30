package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.Threading

func charEv(text string) UiEvent -> UiEvent{ Kind: UiEventKind.TextInput, Key: Key.Character, Text: text }

func keyEv(key Key) UiEvent -> UiEvent{ Kind: UiEventKind.Key, Key: key }

func mouseEv(column int32, row int32) UiEvent {
  return UiEvent{
    Kind: UiEventKind.Mouse,
    Mouse: MouseKind.Press,
    Button: MouseButton.Left,
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
  let t = TableView{ Grow: 0, Height: CellLength.Cells(6) }
  t.Columns.Add(TableColumn{ Header: "Name", ColumnWidth: ColumnWidth.Cells(5) })
  t.Columns.Add(TableColumn{ Header: "Age", ColumnWidth: ColumnWidth.Share(1) })
  for n in 0 ... 20 {
    t.Rows.Add(tblRow("item" + n.ToString(), n.ToString()))
  }
  return t
}

class VariableSourceCheck : VirtualListSource {
  let heights List[int32]

  public init() {
    heights = List[int32]{ 2, 3, 1, 4 }
  }

  public func Count() int32 -> heights.Count

  public func KeyAt(index int32) string -> index.ToString()

  public func IndexOfKey(key string) int32 {
    var value = -1
    if !Int32.TryParse(key, out value) { return -1 }
    return value >= 0 && value < heights.Count ? value : -1
  }

  public func IsSelectable(index int32) bool -> true

  public func HeightAt(index int32, width int32) int32 -> heights[index]

  public func Render(index int32, screen Screen, bounds CellRect, clipBounds CellRect,
      style Style, state VirtualListItemState) {
    screen.Fill(clipBounds, style)
    if bounds.Row >= clipBounds.Row {
      screen.WriteClipped(clipBounds, 0, 0, index.ToString(), style)
    }
  }
}

public class WidgetCheck {
  shared {
    public func Run() int32 {
      var failed = 0
      failed = failed + checkKeyHints()
      failed = failed + checkPointerCorrectness()
      failed = failed + checkTableCellContent()

      failed = failed + Checks.Expect(Viewport.ClampOffset(20, 18, 5) == 15
        && Viewport.BringIntoView(20, 12, 2, 5) == 8,
        "Viewport clamps offsets and minimally reveals an indexed unit")

      let variable = VirtualListView{
        Source: VariableSourceCheck(),
        Width: CellLength.Cells(8),
        Height: CellLength.Cells(3),
      }
      let variableRoot = Box{ Children: { variable } }
      variableRoot.Draw(Screen(8, 3))
      variableRoot.Focus(variable)
      variableRoot.Handle(mouseEv(1, 2))
      failed = failed + Checks.Expect(variable.SelectedIndex == 1 && variable.FirstVisibleRowOffset == 2,
        "VirtualListView maps variable row heights to selection and reveals the whole item")
      let windowListMove = variableRoot.Handle(UiEvent{
        Kind: UiEventKind.Key,
        Key: Key.Down,
        Modifiers: KeyModifiers.Super,
      })
      failed = failed + Checks.Expect(windowListMove == EventResult.Continue && variable.SelectedIndex == 1,
        "collection views leave window-modified navigation unconsumed")

      let number = NumberInput{ Minimum: 0, Maximum: 10, Step: 3, Value: 8, Width: 12 }
      let numberOther = Button{ Text: "Next" }
      let numberRoot = Column{ Children: { number, numberOther } }
      let numberScreen = Screen(40, 12)
      numberRoot.Draw(numberScreen)
      numberRoot.Focus(number)
      var numberChanges = 0
      number.OnValueChange = value -> { numberChanges++ }
      numberRoot.Handle(keyEv(Key.Up))
      failed += Checks.Expect(number.Value == 10 && number.Text == "10", "NumberInput clamps an upward step")
      numberRoot.Handle(keyEv(Key.Down))
      failed += Checks.Expect(number.Value == 7 && numberChanges == 2, "NumberInput steps the committed value")
      number.Value = 1
      numberRoot.Handle(keyEv(Key.Down))
      failed += Checks.Expect(number.Value == 0 && numberChanges == 3, "NumberInput clamps a downward step and loads silently")
      number.Text = "invalid"
      numberRoot.Handle(keyEv(Key.Enter))
      failed += Checks.Expect(number.Value == 0 && number.Text == "invalid" && !number.Commit(), "NumberInput rejects invalid provisional text")
      numberRoot.Handle(keyEv(Key.Escape))
      failed += Checks.Expect(number.Text == "0", "NumberInput Escape restores committed text")
      failed += Checks.Expect(numberRoot.Handle(keyEv(Key.Escape)) == EventResult.Continue,
        "NumberInput leaves Escape unconsumed when there is no pending edit")
      number.Text = "4.5"
      numberRoot.Focus(numberOther)
      failed += Checks.Expect(number.Value == 0 && number.Text == "4.5", "NumberInput focus leave preserves provisional text")
      numberRoot.Focus(number)
      numberRoot.Handle(keyEv(Key.Enter))
      failed += Checks.Expect(number.Value == 4.5 && numberChanges == 4, "NumberInput Enter explicitly commits valid text")
      number.Text = "NaN"
      failed += Checks.Expect(!number.Commit() && number.Value == 4.5, "NumberInput rejects non-finite text")
      number.Text = "11"
      failed += Checks.Expect(!number.Commit(), "NumberInput rejects out-of-range text")
      number.Text = "日12"
      number.MoveCaretToStart()
      numberRoot.Draw(numberScreen)
      numberRoot.Handle(mouseEv(2, 0))
      failed += Checks.Expect(number.CaretGraphemeIndex == 1, "NumberInput inherits wide-grapheme click placement")
      numberRoot.Handle(keyEv(Key.Right))
      numberRoot.Handle(keyEv(Key.Left))
      failed += Checks.Expect(number.CaretGraphemeIndex == 1 && number.Value == 4.5, "NumberInput Left and Right remain caret keys")
      numberRoot.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollUp, Position: CellPoint{ Column: 0, Row: 0 } })
      failed += Checks.Expect(number.Value == 4.5, "NumberInput ignores wheel stepping")
      var invalidNumberProperties = 0
      try { number.Step = 0 } catch (error ArgumentOutOfRangeException) { invalidNumberProperties++ }
      try { number.Step = float64.PositiveInfinity } catch (error ArgumentOutOfRangeException) { invalidNumberProperties++ }
      try { number.Minimum = 11 } catch (error ArgumentOutOfRangeException) { invalidNumberProperties++ }
      try { number.Maximum = -1 } catch (error ArgumentOutOfRangeException) { invalidNumberProperties++ }
      try { number.Value = float64.NaN } catch (error ArgumentOutOfRangeException) { invalidNumberProperties++ }
      failed += Checks.Expect(invalidNumberProperties == 5, "NumberInput validates numeric properties")
      number.Value = 0
      numberRoot.Draw(numberScreen)
      let clampedNumberEvent = keyEv(Key.Down)
      for i in 0 ... 100 {
        numberRoot.Handle(clampedNumberEvent)
        numberRoot.Draw(numberScreen)
      }
      let numberAllocationStart = GC.GetAllocatedBytesForCurrentThread()
      for i in 0 ... 100 {
        numberRoot.Handle(clampedNumberEvent)
        numberRoot.Draw(numberScreen)
      }
      failed += Checks.Expect(GC.GetAllocatedBytesForCurrentThread() == numberAllocationStart, "NumberInput clamped step and steady repaint allocate zero bytes")

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
      let presentedChanges = SelectionProbe()
      let presented = ListView{ Width: CellLength.Cells(12), Height: CellLength.Cells(3), SelectionMarker: "" }
      presented.OnChange = presentedChanges.Record
      presented.Items.Add(heading)
      presented.Items.Add(inbox)
      presented.Items.Add(archive)
      let presentedRoot = Box{ Children: { presented } }
      let presentedScreen = Screen(12, 3)
      presentedRoot.Draw(presentedScreen)
      failed = failed + Checks.Expect(presented.SelectedIndex == 1 && presented.SelectedId == "inbox"
        && presentedScreen.Probe(0, 1) == "i", "ListView skips non-selectable rows and Runs override Text")
      presentedRoot.Focus(presented)
      presentedRoot.Handle(keyEv(Key.Down))
      if let moved = presentedChanges.Take() {
        failed = failed + Checks.Expect(moved.PreviousIndex == 1 && moved.SelectedIndex == 2,
          "ListView delivers keyboard selection changes")
      } else {
        failed = failed + Checks.Expect(false, "ListView exposes keyboard selection changes")
      }
      presentedChanges.Clear()
      presented.Items = List[ListItem]{ archive, heading, inbox }
      failed = failed + Checks.Expect(presented.SelectedIndex == 0 && presented.SelectedId == "archive"
        && presentedChanges.Take() == nil,
        "ListView keeps a stable Id across item replacement without emitting a change")
      archive.IsSelectable = false
      failed = failed + Checks.Expect(presented.SelectedIndex == 2 && presented.SelectedId == "inbox",
        "ListView leaves an item that becomes non-selectable without Refresh")

      let generated = ListView{}
      let generatedFirst = generated.Add("first")
      failed = failed + Checks.Expect(generated.SelectedIndex == 0
          && Object.ReferenceEquals(generated.SelectedItem, generatedFirst)
          && generated.SelectedId == generatedFirst.Id,
        "ListView.Add establishes complete selection state for the first item")
      let generatedSecond = generated.Add("second")
      generated.SelectedIndex = 1
      generated.Items = List[ListItem]{ ListItem{ Id: generatedSecond.Id, Text: "second replacement" } }
      failed = failed + Checks.Expect(generatedFirst.Id != "" && generatedSecond.Id != ""
          && generatedFirst.Id != generatedSecond.Id && generated.SelectedIndex == 0
          && generated.SelectedId == generatedSecond.Id,
        "ListItem supplies a unique lifetime Id and caller Id restores replacement selection")

      let directListItems = List[ListItem]{
        ListItem{ Id: "first", Text: "first" },
        ListItem{ Id: "selected", Text: "selected" },
        ListItem{ Id: "last", Text: "last" },
      }
      let directList = ListView{
        Items: directListItems,
        Width: CellLength.Cells(20),
        Height: CellLength.Cells(3),
        SelectionMarker: "",
      }
      directList.SelectedIndex = 1
      directListItems.Insert(0, ListItem{ Id: "before", Text: "before" })
      failed = failed + Checks.Expect(directList.SelectedIndex == 2 && directList.SelectedId == "selected",
        "ListView preserves Id selection after direct insertion without Refresh")
      directListItems.RemoveAt(2)
      failed = failed + Checks.Expect(directList.SelectedIndex == 2 && directList.SelectedId == "last",
        "ListView falls forward after direct removal of the selected item")
      directListItems[0].Text = "changed"
      let directListRoot = Box{ Children: { directList } }
      let directListScreen = Screen(20, 3)
      directListRoot.Draw(directListScreen)
      failed = failed + Checks.Expect(directListScreen.Probe(0, 0) == "c",
        "ListView renders direct item content mutation without Refresh")

      let deferredList = ListView{ Items: { ListItem{ Id: "heading", Text: "heading", IsSelectable: false } } }
      failed = failed + Checks.Expect(deferredList.SelectedId == "heading",
        "ListView retains a fallback selection when no row is selectable")
      deferredList.Items.Add(ListItem{ Id: "ready", Text: "ready" })
      failed = failed + Checks.Expect(deferredList.SelectedIndex == 1 && deferredList.SelectedId == "ready",
        "ListView selects the first available row after direct append without Refresh")
      deferredList.Items[0].IsSelectable = false
      deferredList.Items[1].IsSelectable = false
      deferredList.Refresh()
      deferredList.Items[0].IsSelectable = true
      deferredList.Refresh()
      failed = failed + Checks.Expect(deferredList.SelectedIndex == 0 && deferredList.SelectedId == "heading",
        "ListView.Refresh discovers same-count eligibility changes away from a fallback selection")

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
      one.IsChecked = true
      failed = failed + Checks.Expect(one.IsChecked && !two.IsChecked
          && Object.ReferenceEquals(group.SelectedToggle, one),
        "setting grouped Toggle.IsChecked preserves exclusive selection")
      one.IsChecked = false
      failed = failed + Checks.Expect(!one.IsChecked && !two.IsChecked && group.SelectedToggle == nil,
        "clearing grouped Toggle.IsChecked clears the group selection")

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
      var buttonClickes = 0
      button.OnClick = () -> buttonClickes = buttonClickes + 1
      let buttonRoot = Box{ Children: { button } }
      buttonRoot.Draw(Screen(20, 3))
      buttonRoot.Focus(button)
      buttonRoot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(buttonClickes == 1,
        "Button invokes OnClick once for Enter")
      buttonRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter, Phase: KeyPhase.Release })
      failed = failed + Checks.Expect(buttonClickes == 1,
        "Button ignores Enter release callbacks")

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

      let missingSparkline = Sparkline{
        Values: { Double.NaN, 4.0, 8.0, Double.PositiveInfinity },
        Width: CellLength.Cells(4),
      }
      let missingSparkRoot = Box{ Children: { missingSparkline } }
      let missingSparkScreen = Screen(4, 2)
      missingSparkRoot.Draw(missingSparkScreen)
      failed = failed + Checks.Expect(missingSparkScreen.Probe(0, 0) == " "
          && missingSparkScreen.Probe(1, 0) == char(0x2581).ToString()
          && missingSparkScreen.Probe(2, 0) == char(0x2588).ToString()
          && missingSparkScreen.Probe(3, 0) == " ",
        "Sparkline excludes non-finite samples from automatic ranges and renders them blank")

      let tableChanges = SelectionProbe()

      let table = makeTable()

      table.OnChange = tableChanges.Record
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
      if let moved = tableChanges.Take() {
        failed = failed + Checks.Expect(moved.PreviousIndex == 5 && moved.SelectedIndex == 6,
          "TableView delivers the latest user selection change")
      } else {
        failed = failed + Checks.Expect(false, "TableView delivers user selection changes")
      }
      tableChanges.Clear()
      table.SelectedRowIndex = 2
      failed = failed + Checks.Expect(tableChanges.Take() == nil,
        "programmatic TableView selection does not emit a user change")
      tabroot.Handle(keyEv(Key.Down))
      tableChanges.Clear()
      table.Rows = List[TableRow]{ tblRow("replacement", "0") }
      failed = failed + Checks.Expect(table.SelectedRowIndex == 0 && tableChanges.Take() == nil,
        "TableView Rows replacement normalizes selection and does not emit a user change")
      table.Rows.Add(tblRow("second", "1"))
      tabroot.Handle(keyEv(Key.Down))
      table.Rows.RemoveAt(1)
      tableChanges.Clear()
      table.Refresh()
      failed = failed + Checks.Expect(table.SelectedRowIndex == 0 && tableChanges.Take() == nil,
        "TableView.Refresh does not emit a user change after direct Rows mutation")

      let directTableRows = List[TableRow]{
        tblRow("first", "first"),
        tblRow("selected", "selected"),
        tblRow("last", "last"),
      }
      let directTable = TableView{
        Rows: directTableRows,
        Width: CellLength.Cells(20),
        Height: CellLength.Cells(5),
      }
      directTable.Columns.Add(TableColumn{ Header: "Name", ColumnWidth: ColumnWidth.Cells(12) })
      directTable.SelectedRowIndex = 1
      directTableRows.Insert(0, tblRow("before", "before"))
      failed = failed + Checks.Expect(directTable.SelectedRowIndex == 2 && directTable.SelectedRowId == "selected",
        "TableView preserves Id selection after direct insertion without Refresh")
      directTableRows.RemoveAt(2)
      failed = failed + Checks.Expect(directTable.SelectedRowIndex == 2 && directTable.SelectedRowId == "last",
        "TableView falls forward after direct removal of the selected row")
      directTableRows[0].Cells[0] = TableCell("changed")
      let directTableRoot = Box{ Children: { directTable } }
      let directTableScreen = Screen(20, 5)
      directTableRoot.Draw(directTableScreen)
      failed = failed + Checks.Expect(directTableScreen.Probe(0, directTable.Bounds.Row + 1) == "c",
        "TableView renders direct row content mutation without Refresh")

      let deferredTable = TableView{ Rows: { TableRow{ Id: "heading", IsSelectable: false } } }
      failed = failed + Checks.Expect(deferredTable.SelectedRowId == "heading",
        "TableView retains a fallback selection when no row is selectable")
      deferredTable.Rows.Add(TableRow{ Id: "ready" })
      failed = failed + Checks.Expect(deferredTable.SelectedRowIndex == 1 && deferredTable.SelectedRowId == "ready",
        "TableView selects the first available row after direct append without Refresh")
      deferredTable.Rows[0].IsSelectable = false
      deferredTable.Rows[1].IsSelectable = false
      deferredTable.Refresh()
      deferredTable.Rows[0].IsSelectable = true
      deferredTable.Refresh()
      failed = failed + Checks.Expect(deferredTable.SelectedRowIndex == 0 && deferredTable.SelectedRowId == "heading",
        "TableView.Refresh discovers same-count eligibility changes away from a fallback selection")

      let stable = makeTable()
      stable.SelectedRowIndex = 3
      stable.Rows = List[TableRow]{ tblRow("item8", "8"), tblRow("item3", "3"), tblRow("item9", "9") }
      failed = failed + Checks.Expect(stable.SelectedRowIndex == 1 && stable.SelectedRowId == "item3",
        "TableView restores selection by stable row Id after filtering or sorting")
      let selectionModes = List[bool]{false, true}
      for follow in selectionModes {
        for header in selectionModes {
          let pendingTable = makeTable()
          pendingTable.Height = CellLength.Cells(12)
          pendingTable.ShowHeader = header
          pendingTable.FollowTail = follow
          pendingTable.FirstVisibleRowIndex = 1
          failed = failed + Checks.Expect(
            pendingTable.SelectedRowIndex == (follow ? 19 : 0)
              && pendingTable.SelectedRowId == (follow ? "item19" : "item0"),
            "TableView reads selection before its first layout with FollowTail on and off")
          pendingTable.SelectedRowIndex = 3
          failed = failed + Checks.Expect(
            pendingTable.SelectedRowIndex == (follow ? 19 : 3)
              && pendingTable.SelectedRowId == (follow ? "item19" : "item3")
              && pendingTable.FirstVisibleRowIndex == 1,
            "TableView sets selection before layout without moving a zero-height viewport")
          let pendingRoot = Box{ Children: { pendingTable } }
          let pendingScreen = Screen(40, 12)
          pendingRoot.Draw(pendingScreen)
          failed = failed + Checks.Expect(
            pendingTable.SelectedRowIndex == (follow ? 19 : 3)
              && pendingTable.SelectedRowId == (follow ? "item19" : "item3")
              && pendingTable.FirstVisibleRowIndex == (follow ? (header ? 9 : 8) : 1)
              && pendingScreen.Probe(0, header ? 1 : 0) == "i",
            "TableView applies its selection and tail viewport on the first 40x12 layout")
        }
      }

      let following = makeTable()
      following.ShowHeader = false
      let followingRoot = Box{ Children: { following } }
      let followingScreen = Screen(40, 12)
      followingRoot.Draw(followingScreen)
      followingRoot.Focus(following)
      following.FollowTail = true
      following.Rows.Add(tblRow("末尾", "21"))
      followingRoot.Draw(followingScreen)
      failed = failed + Checks.Expect(following.SelectedRowId == "末尾"
          && following.FirstVisibleRowIndex == following.Rows.Count - 6,
        "TableView follows appended rows with a hidden header at 40x12")
      followingRoot.Handle(keyEv(Key.Up))
      let pausedIndex = following.SelectedRowIndex
      let pausedOffset = following.FirstVisibleRowIndex
      following.Rows.Add(tblRow("next", "22"))
      followingRoot.Draw(followingScreen)
      failed = failed + Checks.Expect(!following.FollowTail && following.SelectedRowIndex == pausedIndex
          && following.FirstVisibleRowIndex == pausedOffset,
        "TableView preserves paused selection and viewport on append")
      var activations = 0
      let activationChanges = SelectionProbe()
      following.OnChange = activationChanges.Record
      following.OnActivate = (row) -> activations = activations + 1
      followingRoot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(activationChanges.Take() == nil,
        "TableView Enter activation does not emit a selection change")
      followingRoot.Handle(mouseEv(0, 0))
      failed = failed + Checks.Expect(activations == 1, "TableView first click only selects")
      activationChanges.Clear()
      followingRoot.Handle(mouseEv(0, 0))
      failed = failed + Checks.Expect(activations == 2 && activationChanges.Take() == nil,
        "TableView second click activates without a selection change")
      followingRoot.Handle(UiEvent{
        Kind: UiEventKind.Mouse, Mouse: MouseKind.Press, Button: MouseButton.Right,
        Position: CellPoint{ Column: 0, Row: 1 },
      })
      failed = failed + Checks.Expect(activations == 2 && following.SelectedRowIndex == pausedOffset,
        "TableView right click does not select or activate")
      following.Rows.Clear()
      following.FollowTail = true
      followingRoot.Draw(followingScreen)
      followingRoot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(following.SelectedRowId == "" && activations == 2,
        "TableView empty follow does not activate")
      let replacedSourceTable = TableView{ Source: CheckTableSource() }
      replacedSourceTable.SelectedRowIndex = 1
      replacedSourceTable.Source = CheckTableSource()
      failed = failed + Checks.Expect(replacedSourceTable.SelectedRowId == "selected",
        "TableView source replacement preserves the selected row Id")

      let skipped = makeTable()
      skipped.Rows[1].IsSelectable = false
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

      let tableBlankChanges = SelectionProbe()

      let tableBlank = TableView{ Grow: 0, Height: CellLength.Cells(5) }

      tableBlank.OnChange = tableBlankChanges.Record
      tableBlank.Columns.Add(TableColumn{ Header: "Name", ColumnWidth: ColumnWidth.Cells(5) })
      tableBlank.Rows.Add(tblRow("only", ""))
      let blankRoot = Box{ Children: { tableBlank } }
      blankRoot.Draw(Screen(20, 10))
      let blankResult = blankRoot.Handle(mouseEv(0, tableBlank.Bounds.Row + tableBlank.Bounds.HeightRows - 1))
      failed = failed + Checks.Expect(blankResult == EventResult.Continue && tableBlank.SelectedRowIndex == 0
          && tableBlankChanges.Take() == nil,
        "a click in empty TableView space does not select the last row")

      let table3 = TableView{ Grow: 0, Height: CellLength.Cells(3) }
      table3.Columns.Add(TableColumn{ Header: "Name", ColumnWidth: ColumnWidth.Cells(5) })
      table3.Rows.Add(tblRow("abcdefgh", "x"))
      let tab3root = Box{ Children: { table3 } }
      let tab3scr = Screen(20, 10)
      tab3root.Draw(tab3scr)
      let dataY = table3.Bounds.Row + 1
      failed = failed + Checks.Expect(tab3scr.Probe(4, dataY) == "e", "a fixed width column truncates by display width")
      failed = failed + Checks.Expect(tab3scr.Probe(5, dataY) == " ", "truncation never spills into the gutter")

      let aligned = TableView{ Grow: 0, Height: CellLength.Cells(3) }
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
        Grow: 0,
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

      let tabsChanges = SelectionProbe()

      let tabs = Tabs{ Titles: { "aa", "bb", "cc" } }

      tabs.OnChange = tabsChanges.Record
      let tsroot = Box{ Children: { tabs } }
      tsroot.Draw(Screen(30, 3))
      failed = failed + Checks.Expect(tsroot.Handle(keyEv(Key.Left)) == EventResult.Continue, "Left at the first tab clamps, no wrap")
      failed = failed + Checks.Expect(tabs.SelectedIndex == 0, "SelectedIndex stays at the first tab")
      failed = failed + Checks.Expect(tsroot.Handle(keyEv(Key.Right)) == EventResult.Handled, "Right moves to the next tab")
      failed = failed + Checks.Expect(tabs.SelectedIndex == 1, "SelectedIndex is now the second tab")
      if let moved = tabsChanges.Take() {
        failed = failed + Checks.Expect(moved.PreviousIndex == 0 && moved.SelectedIndex == 1,
          "Tabs delivers user selection changes")
      } else {
        failed = failed + Checks.Expect(false, "Tabs delivers user selection changes")
      }
      tsroot.Handle(keyEv(Key.Right))
      failed = failed + Checks.Expect(tabs.SelectedIndex == 2, "SelectedIndex is now the last tab")
      failed = failed + Checks.Expect(tsroot.Handle(keyEv(Key.Right)) == EventResult.Continue, "Right at the last tab clamps, no wrap")
      failed = failed + Checks.Expect(tabs.SelectedIndex == 2, "SelectedIndex stays at the last tab")
      tabsChanges.Clear()
      tabs.Titles = List[string]{ "replacement" }
      failed = failed + Checks.Expect(tabs.SelectedIndex == 0 && tabsChanges.Take() == nil,
        "Tabs Titles replacement normalizes selection and does not emit a user change")
      tabs.Titles.Add("second")
      tsroot.Handle(keyEv(Key.Right))
      tabs.Titles.RemoveAt(1)
      tabsChanges.Clear()
      tabs.Refresh()
      failed = failed + Checks.Expect(tabs.SelectedIndex == 0 && tabsChanges.Take() == nil,
        "Tabs.Refresh does not emit a user change after direct Titles mutation")
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
      bar.LeftRuns.Add(TextRun("linked", Style(), "https://example.com"))
      broot.Draw(bscr)
      failed = failed + Checks.Expect(bscr.Probe(0, 0) == "l", "StatusBar rich segments take precedence over plain text")

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
      failed = failed + runTextOverflowChecks()
      failed = failed + runChartChecks()
      return failed
    }
  }
}

private func runTextOverflowChecks() int32 {
  var failed = 0
  let clusters = List[string]{ "a", "中", "é", "👩‍💻" }
  for cluster in clusters {
    let text = cluster + cluster + cluster + cluster + cluster + cluster
      + cluster + cluster + cluster + cluster + cluster
    let clusterWidth = CellText.MeasureWidth(cluster)
    for width in 1 ... 11 {
      let label = Label{ Text: text, Ellipsis: true, Width: CellLength.Cells(width) }
      let plain = StatusBar{ LeftText: text, Ellipsis: true, Width: CellLength.Cells(width) }
      let styled = StatusBar{
        LeftRuns: { TextRun(cluster, Style{ Foreground: Color.Indexed(1) }),
          TextRun(text.Substring(cluster.Length), Style{ Foreground: Color.Indexed(2) }) },
        Ellipsis: true, Width: CellLength.Cells(width),
      }
      let root = Column{ Children: { label, plain, styled } }
      let screen = Screen(40, 12)
      root.Draw(screen)
      let end = ((width - 1) / clusterWidth) * clusterWidth
      for row in 0 ... 3 {
        failed += Checks.Expect(screen.Probe(end, row) == "…"
          && screen.Probe(width, row) == " ", "ellipsis stays within widths 1 through 10")
        for column in 0 ... end {
          let expected = column % clusterWidth == 0 ? cluster : ""
          failed += Checks.Expect(screen.Probe(column, row) == expected,
            "ellipsis preserves whole graphemes and double-width cells")
        }
      }
      screen.ColorMode = TerminalColorMode.NoColor
      root.Draw(screen)
      let noColor = screen.Flush()
      failed += Checks.Expect(noColor.Contains("…") && !noColor.Contains("[38;")
        && !noColor.Contains("[48;"), "ellipsis preserves text in NoColor mode")
      for pass in 0 ... 64 { root.Draw(screen) }
      let before = GC.GetAllocatedBytesForCurrentThread()
      for pass in 0 ... 32 { root.Draw(screen) }
      failed += Checks.Expect(GC.GetAllocatedBytesForCurrentThread() == before,
        "ellipsis repaint allocates zero bytes")
    }
  }

  let left = StatusBar{ LeftText: "中文" }
  let right = StatusBar{ RightText: "right" }
  let flanks = StatusBar{ LeftText: "left", RightText: "right" }
  let middle = StatusBar{ CenterText: "center" }
  let measure = Row{ Children: { left, right, flanks, middle } }
  measure.Compute(40, 12)
  failed += Checks.Expect(left.Bounds.WidthCells == 4 && right.Bounds.WidthCells == 5
    && flanks.Bounds.WidthCells == 9 && middle.Bounds.WidthCells == 6,
    "StatusBar intrinsic width uses only non-empty segment content")
  left.LeftRuns = List[TextRun]{ TextRun("ready", Style()) }
  measure.Compute(40, 12)
  failed += Checks.Expect(left.Bounds.WidthCells == 5,
    "StatusBar styled segment replacement updates intrinsic width")

  let center = StatusBar{ LeftText: "L", CenterText: "abcdefghijk", RightText: "R",
    Ellipsis: true, Width: CellLength.Cells(7) }
  let centerRoot = Box{ Children: { center } }
  let centerScreen = Screen(40, 12)
  centerRoot.Draw(centerScreen)
  failed += Checks.Expect(centerScreen.Probe(0, 0) == "L"
    && centerScreen.Probe(1, 0) == "d" && centerScreen.Probe(5, 0) == "…"
    && centerScreen.Probe(6, 0) == "R", "center ellipsis fits between the flanking segments")

  let accent = Style{ Foreground: Color.Rgb(229, 72, 77), Attributes: TextAttributes.Bold }
  let tabs = Tabs{
    Titles: { "plain" },
    TitleRuns: {
      List[TextRun]{ TextRun("1", accent), TextRun("中文", Style()) },
      List[TextRun]{ TextRun("2", accent), TextRun("next", Style()) },
    },
    SelectedStyle: Style{ Attributes: TextAttributes.Underline },
    Width: CellLength.Cells(9),
  }
  let tabRoot = Box{ Children: { tabs } }
  let tabScreen = Screen(40, 12)
  tabRoot.Draw(tabScreen)
  failed += Checks.Expect(tabScreen.Probe(0, 0) == "1" && tabScreen.Probe(1, 0) == "中"
    && tabScreen.Probe(3, 0) == "文" && tabScreen.Probe(7, 0) == "2",
    "Tabs draws styled runs using their full cell widths")
  failed += Checks.Expect(tabScreen.Flush().Contains("[38;2;229;72;77m"),
    "Tabs emits styled title run colors")
  tabRoot.Handle(mouseEv(7, 0))
  failed += Checks.Expect(tabs.SelectedIndex == 1, "styled tab hit testing matches the drawn title")
  tabRoot.Draw(tabScreen)
  failed += Checks.Expect(tabScreen.Probe(4, 0) == "2", "styled tab scrolling uses run widths")
  tabRoot.Handle(mouseEv(0, 0))
  failed += Checks.Expect(tabs.SelectedIndex == 0, "scrolled styled tab hit testing selects visible content")
  tabScreen.ColorMode = TerminalColorMode.NoColor
  tabRoot.Draw(tabScreen)
  let noColor = tabScreen.Flush()
  failed += Checks.Expect(!noColor.Contains("[38;") && !noColor.Contains("[48;")
    && noColor.Contains("1"), "styled titles preserve text in NoColor mode")
  for pass in 0 ... 64 { tabRoot.Draw(tabScreen) }
  let before = GC.GetAllocatedBytesForCurrentThread()
  for pass in 0 ... 64 { tabRoot.Draw(tabScreen) }
  failed += Checks.Expect(GC.GetAllocatedBytesForCurrentThread() == before,
    "styled title repaint allocates zero bytes")
  tabs.TitleRuns = List[List[TextRun]]()
  tabRoot.Draw(tabScreen)
  failed += Checks.Expect(tabScreen.Probe(0, 0) == "p" && tabs.SelectedIndex == 0,
    "clearing styled titles restores plain Titles")
  return failed
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

  public func Count() int32 -> items.Count
  public func ItemAt(index int32) ListItem -> items[index]

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

  public func Count() int32 -> rows.Count
  public func ItemAt(index int32) TableRow -> rows[index]

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

  public func Count() int32 -> root.IsExpanded ? 2 : 1

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

  public func Count() int32 -> 1000000

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

private class WidgetScenarioView : Box {
  private var surface CanvasSurface
  private var status Label

  public prop Surface CanvasSurface -> surface

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
    Children.Add(Column{
      Width: CellLength.Cells(28),
      Height: CellLength.Cells(8),
      Children: { tree, canvas, status },
    })
  }

  public func ActivateCommand() {
    status.Text = "command activated"
  }

  public func CompleteWorker(value string) {
    status.Text = value
  }

  public func FailWorker(error Exception) {
    status.Text = "worker failed"
  }

  public func CancelWorker() {
    status.Text = "worker cancelled"
  }
}

private open class RasterOverlayCheck : CanvasView {
  protected override func Render(screen Screen, bounds CellRect, style Style) {
    base.Render(screen, bounds, style)
    screen.WriteClipped(bounds, 1, 0, "ZIP", style)
  }
}

private func runWidgetScenario() int32 {
  var failed = 0
  let overlay = RasterOverlayCheck()
  overlay.Surface = CanvasSurface(3, 1, CanvasMode.HalfBlock)
  overlay.Surface.HalfBlock(0, 0, Color.Rgb(1, 2, 3), Color.Rgb(4, 5, 6))
  let overlayScreen = Screen(3, 1)
  overlay.Draw(overlayScreen)
  failed = failed + Checks.Expect(overlayScreen.Probe(0, 0) == "▀"
      && overlayScreen.Probe(1, 0) == "Z" && overlayScreen.Probe(2, 0) == "I",
    "canvas subclasses can retain raster content and paint clipped labels above it")
  let raster = CanvasView(2, 1, CanvasMode.HalfBlock)
  let upper = Color.Rgb(12, 34, 56)
  let lower = Color.Rgb(78, 90, 123)
  raster.Surface.Point(0, 1)
  raster.Surface.HalfBlock(0, 0, upper, lower)
  raster.Surface.HalfBlock(-1, 0, upper, lower)
  raster.Surface.HalfBlock(2, 0, upper, lower)
  raster.Surface.HalfBlock(0, -1, upper, lower)
  raster.Surface.HalfBlock(0, 1, upper, lower)
  let rasterScreen = Screen(2, 1)
  raster.Draw(rasterScreen)
  let rasterWire = rasterScreen.Flush()
  failed = failed + Checks.Expect(rasterScreen.Probe(0, 0) == "▀"
      && rasterScreen.Probe(1, 0) == " "
      && rasterWire.Contains("[38;2;12;34;56m")
      && rasterWire.Contains("[48;2;78;90;123m"),
    "raster half blocks replace masks, preserve both RGB samples, and clip coordinates")
  raster.Surface.HalfBlock(0, 0, lower, upper)
  raster.Draw(rasterScreen)
  let changedRasterWire = rasterScreen.Flush()
  failed = failed + Checks.Expect(changedRasterWire.Contains("[38;2;78;90;123m")
      && changedRasterWire.Contains("[48;2;12;34;56m"),
    "raster half blocks repaint independent color changes")
  raster.Surface.Clear()
  raster.Draw(rasterScreen)
  failed = failed + Checks.Expect(rasterScreen.Probe(0, 0) == " ",
    "clearing a raster removes its half blocks")
  var rejectedRasterMode = false
  try {
    CanvasSurface(1, 1, CanvasMode.Braille).HalfBlock(0, 0, upper, lower)
  } catch (error InvalidOperationException) {
    rejectedRasterMode = true
  }
  failed = failed + Checks.Expect(rejectedRasterMode, "raster half blocks reject other packing modes")

  let quadrant = CanvasView(7, 1, CanvasMode.Quadrant)
  let red = Color.Rgb(255, 0, 0)
  let blue = Color.Rgb(0, 0, 255)
  quadrant.Surface.Quadrant(0, 0, red, blue, blue, blue)
  quadrant.Surface.Quadrant(1, 0, blue, red, blue, blue)
  quadrant.Surface.Quadrant(2, 0, red, red, blue, blue)
  quadrant.Surface.Quadrant(3, 0, blue, blue, red, blue)
  quadrant.Surface.Quadrant(4, 0, red, blue, red, blue)
  quadrant.Surface.Quadrant(5, 0, blue, red, red, blue)
  quadrant.Surface.Quadrant(6, 0, red, red, red, blue)
  quadrant.Surface.Quadrant(-1, 0, red, red, red, red)
  quadrant.Surface.Quadrant(7, 0, red, red, red, red)
  quadrant.Surface.Quadrant(0, -1, red, red, red, red)
  quadrant.Surface.Quadrant(0, 1, red, red, red, red)
  let quadrantScreen = Screen(7, 1)
  quadrant.Draw(quadrantScreen)
  failed = failed + Checks.Expect(quadrantScreen.Probe(0, 0) == "▘"
      && quadrantScreen.Probe(1, 0) == "▝" && quadrantScreen.Probe(2, 0) == "▀"
      && quadrantScreen.Probe(3, 0) == "▖" && quadrantScreen.Probe(4, 0) == "▌"
      && quadrantScreen.Probe(5, 0) == "▞" && quadrantScreen.Probe(6, 0) == "▛",
    "quadrant raster cells retain all seven foreground partition patterns and clip coordinates")
  let independent = CanvasView(1, 1, CanvasMode.Quadrant)
  independent.Surface.Point(0, 1)
  independent.Surface.Quadrant(0, 0, Color.Rgb(250, 10, 10), Color.Rgb(240, 20, 20),
    Color.Rgb(10, 10, 250), Color.Rgb(20, 20, 240))
  let independentScreen = Screen(1, 1)
  independent.Draw(independentScreen)
  let independentWire = independentScreen.Flush()
  failed = failed + Checks.Expect(independentScreen.Probe(0, 0) == "▀"
      && independentWire.Contains("[38;2;245;15;15m")
      && independentWire.Contains("[48;2;15;15;245m"),
    "quadrant raster cells choose the least-squared-error RGB partition and group means")
  independent.Surface.Quadrant(0, 0, red, red, red, red)
  independent.Draw(independentScreen)
  let uniformWire = independentScreen.Flush()
  failed = failed + Checks.Expect(independentScreen.Probe(0, 0) == " "
      && uniformWire.Contains("[48;2;255;0;0m"),
    "uniform quadrant raster cells replace prior masks with one background color")
  independent.Surface.Clear()
  independent.Draw(independentScreen)
  failed = failed + Checks.Expect(independentScreen.Probe(0, 0) == " ",
    "clearing a quadrant raster resets its retained cell")
  var rejectedQuadrantMode = false
  try {
    CanvasSurface(1, 1, CanvasMode.HalfBlock).Quadrant(0, 0, red, red, blue, blue)
  } catch (error InvalidOperationException) {
    rejectedQuadrantMode = true
  }
  failed = failed + Checks.Expect(rejectedQuadrantMode, "quadrant raster cells reject other packing modes")

  let brailleRaster = CanvasView(2, 1, CanvasMode.Braille)
  brailleRaster.Surface.Point(0, 0)
  brailleRaster.Surface.BrailleCell(0, 0, 130, red, blue)
  brailleRaster.Surface.BrailleCell(-1, 0, 255, red, blue)
  brailleRaster.Surface.BrailleCell(2, 0, 255, red, blue)
  let brailleScreen = Screen(2, 1)
  brailleRaster.Draw(brailleScreen)
  let brailleWire = brailleScreen.Flush()
  failed = failed + Checks.Expect(brailleScreen.Probe(0, 0) == "⢂"
      && brailleScreen.Probe(1, 0) == " "
      && brailleWire.Contains("[38;2;255;0;0m")
      && brailleWire.Contains("[48;2;0;0;255m"),
    "packed braille cells replace masks, preserve both colors, and clip coordinates")
  brailleRaster.Surface.Clear()
  brailleRaster.Draw(brailleScreen)
  failed = failed + Checks.Expect(brailleScreen.Probe(0, 0) == " ",
    "clearing a packed braille raster resets its retained cell")
  var rejectedBrailleMode = false
  try {
    CanvasSurface(1, 1, CanvasMode.Quadrant).BrailleCell(0, 0, 1, red, blue)
  } catch (error InvalidOperationException) {
    rejectedBrailleMode = true
  }
  var rejectedBrailleMask = false
  try {
    CanvasSurface(1, 1, CanvasMode.Braille).BrailleCell(0, 0, 256, red, blue)
  } catch (error ArgumentOutOfRangeException) {
    rejectedBrailleMask = true
  }
  failed = failed + Checks.Expect(rejectedBrailleMode && rejectedBrailleMask,
    "packed braille cells reject other modes and invalid dot masks")

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
  failed = failed + Checks.Expect(sourcedList.SelectedIndex == 0
      && sourcedList.SelectedId == "selected",
    "list source mutation restores selection through source-owned key lookup without Refresh")

  let tableSource = CheckTableSource()
  let sourcedTable = TableView{ Source: tableSource }
  sourcedTable.SelectedRowIndex = 1
  tableSource.MoveSelectedFirst()
  failed = failed + Checks.Expect(sourcedTable.SelectedRowIndex == 0
      && sourcedTable.SelectedRowId == "selected",
    "table source mutation restores selection through source-owned key lookup without Refresh")

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
  let driver = TestDriver(view, 30, 8)
  driver.App.Keys.Add("scenario.command", "scenario command", KeyGesture.Ctrl("k"),
    BindingPhase.BeforeWidgets, view.ActivateCommand)

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
  let commandFrame = driver.Draw()
  failed = failed + Checks.Expect(commandFrame.Contains("command activated"),
    "normal App key routing invokes a named binding")

  let ready = AutoResetEvent(false)
  let worker = driver.App.StartWorker[string]((token CancellationToken) -> {
    ready.Set()
    return "worker complete"
  }, view.CompleteWorker, view.FailWorker, view.CancelWorker)
  ready.WaitOne(1000)
  var turns = 0
  while turns < 1000 && worker.IsRunning {
    driver.Pump()
    Thread.Yield()
    turns = turns + 1
  }
  driver.Resize(31, 8)
  let finalFrame = driver.Draw()
  failed = failed + Checks.Expect(finalFrame.Contains("virtual child"),
    "worker completion preserves virtual source data")
  failed = failed + Checks.Expect(finalFrame.Contains("worker complete"),
    "worker completion becomes visible after App pumping")
  failed = failed + Checks.Expect(!worker.IsRunning,
    "worker reaches terminal state on the UI thread")

  var workerError Exception?
  let failedWorker = driver.App.StartWorker[string]((token CancellationToken) -> {
    throw InvalidOperationException("worker failure")
  }, (value string) -> {}, (error Exception) -> workerError = error, () -> {})
  turns = 0
  while turns < 1000 && failedWorker.IsRunning {
    driver.Pump()
    Thread.Yield()
    turns = turns + 1
  }
  failed = failed + Checks.Expect(!failedWorker.IsRunning
      && workerError != nil && workerError.Message == "worker failure",
    "worker failures invoke once on the application loop")

  let cancellationStarted = AutoResetEvent(false)
  let cancellationRelease = AutoResetEvent(false)
  var workerCancelled = false
  var ignoredResult = false
  let cancelledWorker = driver.App.StartWorker[string]((token CancellationToken) -> {
    cancellationStarted.Set()
    cancellationRelease.WaitOne()
    return "ignored cancellation"
  }, (value string) -> ignoredResult = true,
    (error Exception) -> {}, () -> workerCancelled = true)
  cancellationStarted.WaitOne(1000)
  cancelledWorker.Cancel()
  let stayedRunning = cancelledWorker.IsRunning
  cancellationRelease.Set()
  turns = 0
  while turns < 1000 && cancelledWorker.IsRunning {
    driver.Pump()
    Thread.Yield()
    turns = turns + 1
  }
  failed = failed + Checks.Expect(stayedRunning
      && !cancelledWorker.IsRunning && workerCancelled && !ignoredResult,
    "worker cancellation invokes only the cancellation callback")
  driver.Send(UiEvent{ Kind: UiEventKind.Key, Key: Key.Tab, Phase: KeyPhase.Press })
  failed = failed + Checks.Expect(driver.FocusedElement != nil,
    "TestDriver exposes focus after normal input routing")
  return failed
}

private func checkTableCellContent() int32 {
  var failed = 0
  let table = TableView{ ShowBorder: true }
  for column in 0 ... 4 { table.Columns.Add(TableColumn{ Header: "value" }) }
  for index in 0 ... 64 {
    table.Rows.Add(TableRow{ Id: index.ToString(), Cells: {
      TableCell{ Text: "hidden", Content: ProgressBar{ Value: 1.0, FilledGlyph: "#" } },
      TableCell{ Content: Sparkline{ Values: { 0.0, 1.0 } } },
      TableCell{ Content: Toggle{ Text: "enable" } },
      TableCell{ Content: Label{ Text: "label", Width: CellLength.Cells(100) } },
    } })
  }
  let root = Box{ Children: { table } }
  let widths = List[int32]{ 40, 60, 80, 120, 160 }
  let heights = List[int32]{ 12, 18, 24, 36, 48 }
  let offsets = List[int32]{ 0, 5, 40 }
  for width in widths {
    for height in heights {
      let screen = Screen(width, height)
      for offset in offsets {
        table.FirstVisibleRowIndex = offset
        root.Draw(screen)
        let view = table.ContentBounds
        let first = table.FirstVisibleRowIndex
        guard let bar = table.Rows[first].Cells[0].Content else { return failed + Checks.Expect(false, "missing bar cell") }
        guard let spark = table.Rows[first].Cells[1].Content else { return failed + Checks.Expect(false, "missing sparkline cell") }
        guard let toggle = table.Rows[first].Cells[2].Content else { return failed + Checks.Expect(false, "missing toggle cell") }
        guard let label = table.Rows[first].Cells[3].Content else { return failed + Checks.Expect(false, "missing label cell") }
        let cellWidth = (view.WidthCells - 3) / 4
        failed += Checks.Expect(bar.Bounds.Column == view.Column && bar.Bounds.Row == view.Row + 1
            && bar.Bounds.HeightRows == 1 && spark.Bounds.Column == bar.Bounds.Column + bar.Bounds.WidthCells + 1
            && toggle.Bounds.Column == spark.Bounds.Column + spark.Bounds.WidthCells + 1
            && label.Bounds.Column == toggle.Bounds.Column + toggle.Bounds.WidthCells + 1
            && label.Bounds.WidthCells >= cellWidth && label.Bounds.Column + label.Bounds.WidthCells == view.Column + view.WidthCells
            && screen.Probe(bar.Bounds.Column, bar.Bounds.Row) == "#"
            && screen.Probe(spark.Bounds.Column + spark.Bounds.WidthCells - 1, spark.Bounds.Row) == "█"
            && screen.Probe(toggle.Bounds.Column, toggle.Bounds.Row) == "["
            && screen.Probe(label.Bounds.Column, label.Bounds.Row) == "l",
          "TableView places and clips retained cells at each viewport size and scroll offset")
      }
    }
  }
  let screen = Screen(40, 12)
  table.FirstVisibleRowIndex = 0
  root.Draw(screen)
  guard let firstToggle = table.Rows[0].Cells[2].Content else { return failed + Checks.Expect(false, "missing first toggle cell") }
  root.Focus(table)
  root.Handle(keyEv(Key.Tab))
  failed += Checks.Expect(firstToggle.IsFocused, "TableView Tab enters the first visible focusable cell")
  guard let secondToggle = table.Rows[1].Cells[2].Content else { return failed + Checks.Expect(false, "missing second toggle cell") }
  root.Handle(mouseEv(secondToggle.Bounds.Column, secondToggle.Bounds.Row))
  if secondToggle is Toggle {
    failed += Checks.Expect(secondToggle.IsChecked && secondToggle.IsFocused && table.SelectedRowIndex == 0,
      "TableView sends left clicks to Toggle cells without changing row selection")
  }
  guard let secondBar = table.Rows[1].Cells[0].Content else { return failed + Checks.Expect(false, "missing second bar cell") }
  root.Handle(mouseEv(secondBar.Bounds.Column, secondBar.Bounds.Row))
  failed += Checks.Expect(table.SelectedRowIndex == 1 && table.IsFocused,
    "TableView inert cells leave row selection to the table")
  let chart = ChartView{ Series: {
    ChartSeries{ Points: { ChartPoint{ X: 0.0, Y: 0.0 }, ChartPoint{ X: 1.0, Y: 1.0 } } },
  } }
  var clicks = 0
  let button = Button{ Text: "apply", OnClick: () -> clicks = clicks + 1 }
  table.Rows[0].Cells[3] = TableCell{ Content: chart }
  table.Rows[1].Cells[3] = TableCell{ Content: button }
  root.Draw(screen)
  root.Handle(mouseEv(chart.Bounds.Column, chart.Bounds.Row))
  failed += Checks.Expect(chart.Bounds.HeightRows == 1 && table.SelectedRowIndex == 0 && table.IsFocused,
    "TableView one-row chart cells leave row selection to the table")
  root.Focus(secondToggle)
  root.Handle(keyEv(Key.Tab))
  root.Handle(keyEv(Key.Enter))
  root.Handle(mouseEv(button.Bounds.Column, button.Bounds.Row))
  failed += Checks.Expect(button.IsFocused && clicks == 2 && table.SelectedRowIndex == 0,
    "TableView Button cells receive Tab, Enter, and left click")
  table.FirstVisibleRowIndex = 20
  root.Draw(screen)
  root.Focus(firstToggle)
  failed += Checks.Expect(!firstToggle.IsFocused && !firstToggle.IsAttached,
    "TableView hidden rows cannot retain focus or attachment")
  failed += Checks.Expect(root.Handle(mouseEv(0, screen.Size.HeightRows)) == EventResult.Continue
      && !firstToggle.IsFocused,
    "TableView does not hit content outside its visible rows")
  root.Focus(table)
  root.Handle(keyEv(Key.Tab))
  failed += Checks.Expect(Object.ReferenceEquals(root.FocusedElement, table.Rows[20].Cells[2].Content),
    "TableView Tab skips hidden rows after scrolling")
  let probe = MouseCaptureProbe{ CaptureOnClick: true, ConsumeMouse: true }
  probe.MakeFocusable()
  table.Rows[23].Cells[2] = TableCell{ Content: probe }
  root.Draw(screen)
  root.Handle(mouseEv(probe.Bounds.Column, probe.Bounds.Row))
  root.Draw(screen)
  failed += Checks.Expect(probe.Captured && probe.IsFocused,
    "TableView preserves visible cell focus and mouse capture across paint")
  table.Source = CheckTableSource()
  failed += Checks.Expect(!probe.Captured && !probe.IsFocused && !probe.IsAttached && probe.LostCount == 1,
    "TableView source replacement detaches old cells and releases focus and capture")
  failed += Checks.Expect(root.Handle(mouseEv(probe.Bounds.Column, probe.Bounds.Row)) == EventResult.Continue
      && probe.PressCount == 1,
    "TableView does not hit the old area of content removed by source replacement")
  table.Source = nil
  table.FirstVisibleRowIndex = 20
  root.Draw(screen)
  root.Handle(mouseEv(probe.Bounds.Column, probe.Bounds.Row))
  table.Rows.RemoveAt(23)
  table.Refresh()
  failed += Checks.Expect(!probe.Captured && !probe.IsFocused && !probe.IsAttached && probe.LostCount == 2,
    "TableView row removal detaches old cell content")
  table.FollowTail = true
  root.Draw(screen)
  guard let lastToggle = table.Rows[table.Rows.Count - 1].Cells[2].Content else { return failed + Checks.Expect(false, "missing last toggle cell") }
  failed += Checks.Expect(table.SelectedRowIndex == table.Rows.Count - 1
      && lastToggle.Bounds.Row == table.ContentBounds.Row + table.ContentBounds.HeightRows - 1,
    "TableView FollowTail lays out retained cells on the last visible row")
  table.FollowTail = false
  let wheel = UiEvent{
    Kind: UiEventKind.Mouse, Mouse: MouseKind.ScrollUp,
    Position: CellPoint{ Column: 1, Row: 2 },
  }
  let output = TerminalBuffer(4096)
  for frame in 0 ... 64 {
    table.FirstVisibleRowIndex = frame % 2
    screen.Clear()
    root.Draw(screen)
    root.Handle(wheel)
    screen.Emit(output)
  }
  let before = GC.GetAllocatedBytesForCurrentThread()
  for frame in 0 ... 64 {
    table.FirstVisibleRowIndex = frame % 2
    screen.Clear()
    root.Draw(screen)
    root.Handle(wheel)
    screen.Emit(output)
  }
  let allocated = GC.GetAllocatedBytesForCurrentThread() - before
  failed += Checks.Expect(allocated == 0,
    "TableView warmed retained-cell paint, wheel input, and output allocate zero bytes: " + allocated.ToString())
  return failed
}
