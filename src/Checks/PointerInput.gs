package SharpTui

import System
import System.Collections.Generic

private func checkPointerCorrectness() int32 {
  var failed = 0
  var activations = 0
  let button = Button{ Text: "open", OnClick: () -> { activations = activations + 1 } }
  let toggle = Toggle{ Text: "enabled" }
  let tabs = Tabs{ Titles: List[string]{ "one", "two" } }
  let selector = Select{ Options: List[string]{ "one", "two", "three", "four" } }
  let table = makeTable()
  let list = ListView{ Items: { ListItem{ Id: "one", Text: "one" }, ListItem{ Id: "two", Text: "two" } } }
  let variable = VirtualListView{ Source: VariableSourceCheck() }
  let controls = List[Box]{ button, toggle, tabs, table, list, variable }
  for control in controls {
    control.Width = CellLength.Cells(12)
    control.Height = CellLength.Cells(6)
    let root = Box{ Children: { control } }
    root.Draw(Screen(12, 12))
    let identities = List[MouseButton]{ MouseButton.Middle, MouseButton.Right, MouseButton.None }
    for identity in identities {
      root.Handle(splitterMouse(MouseKind.Press, identity, 6, 2))
      root.Handle(splitterMouse(MouseKind.Press, identity, 6, 1))
      root.Handle(splitterMouse(MouseKind.Press, identity, 6, 0))
    }
  }
  failed = failed + Checks.Expect(activations == 0 && !toggle.IsChecked && tabs.SelectedIndex == 0
      && !selector.IsOpen && table.SelectedRowIndex == 0 && list.SelectedIndex == 0 && variable.SelectedIndex == 0,
    "middle, right, and buttonless presses do not activate or select widgets")
  let selectRoot = Box{ Children: { selector } }
  selector.Width = CellLength.Cells(12)
  selector.Height = CellLength.Cells(6)
  selectRoot.Draw(Screen(12, 12))
  selectRoot.Handle(splitterMouse(MouseKind.Press, MouseButton.Right, 1, 0))
  selectRoot.Handle(splitterMouse(MouseKind.Press, MouseButton.Middle, 1, 0))
  failed = failed + Checks.Expect(!selector.IsOpen, "right and middle presses do not open a Select")
  selectRoot.Handle(mouseEv(1, 0))
  selectRoot.Handle(splitterMouse(MouseKind.Press, MouseButton.Right, 1, 8))
  selectRoot.Handle(splitterMouse(MouseKind.Press, MouseButton.Middle, 1, 8))
  failed = failed + Checks.Expect(selector.IsOpen && selector.SelectedIndex == 0,
    "right and middle presses leave an open Select unchanged")
  selectRoot.Handle(mouseEv(1, 8))
  failed = failed + Checks.Expect(!selector.IsOpen && selector.SelectedIndex == 1,
    "a left press selects an open Select option")

  let entry = TextInput{ Text: "日a本éz", Width: CellLength.Cells(12) }
  let entryRoot = Box{ Children: { entry } }
  let entryScreen = Screen(12, 2)
  entryRoot.Draw(entryScreen)
  entryRoot.Handle(mouseEv(1, 0))
  failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 0,
    "TextInput clicks on the trailing cell of a wide grapheme select that grapheme")
  entryRoot.Handle(mouseEv(3, 0))
  failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 2,
    "TextInput clicks use terminal cells rather than UTF-16 offsets")
  entryRoot.Handle(mouseEv(5, 0))
  failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 3,
    "TextInput clicks preserve combining graphemes")
  entry.Width = CellLength.Cells(4)
  entry.MoveCaretToEnd()
  entryRoot.Draw(entryScreen)
  entryRoot.Handle(mouseEv(0, 0))
  failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 3,
    "TextInput click uses the same panned grapheme start as Render")
  entry.IsPassword = true
  entry.MoveCaretToEnd()
  entryRoot.Draw(entryScreen)
  entryRoot.Handle(mouseEv(1, 0))
  failed = failed + Checks.Expect(entry.CaretGraphemeIndex == 3,
    "password click placement uses bullet widths")

  let area = TextArea{ Text: "日本語abc\nsecond", ShowLineNumbers: false,
    Width: CellLength.Cells(12), Height: CellLength.Cells(2) }
  let areaRoot = Box{ Children: { area } }
  let areaScreen = Screen(12, 4)
  areaRoot.Draw(areaScreen)
  areaRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.None, 4, 0))
  failed = failed + Checks.Expect(area.Caret.GraphemeIndex == 0 && !area.HasSelection,
    "TextArea ignores uncaptured AllMotion hover")
  areaRoot.Handle(splitterMouse(MouseKind.Press, MouseButton.Right, 4, 0))
  areaRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.Right, 8, 0))
  failed = failed + Checks.Expect(area.Caret.GraphemeIndex == 0 && !area.HasSelection,
    "TextArea starts selection only on a left press")
  areaRoot.Handle(mouseEv(0, 0))
  areaRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, 4, 0))
  failed = failed + Checks.Expect(area.HasSelection && area.Caret.GraphemeIndex == 2,
    "TextArea captured drag selects wide graphemes")
  areaRoot.Handle(splitterMouse(MouseKind.Release, MouseButton.Left, 20, 3))
  areaRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.None, 8, 0))
  failed = failed + Checks.Expect(area.Caret.GraphemeIndex == 2,
    "TextArea release outside its bounds ends selection dragging")
  areaRoot.Handle(mouseEv(0, 0))
  area.IsVisible = false
  area.IsVisible = true
  areaRoot.Draw(areaScreen)
  areaRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, 8, 0))
  failed = failed + Checks.Expect(area.Caret.GraphemeIndex == 0 && !area.HasSelection,
    "TextArea capture loss stops selection dragging")
  areaRoot.Handle(charEv("a"))
  areaRoot.Handle(mouseEv(1, 0))
  failed = failed + Checks.Expect(area.Caret.GraphemeIndex == 1,
    "TextArea refreshes its grapheme cache after an edit before the next click")
  areaRoot.Handle(splitterMouse(MouseKind.Release, MouseButton.Left, 1, 0))
  entry.IsPassword = false
  entryRoot.Handle(mouseEv(1, 0))
  areaRoot.Handle(mouseEv(0, 0))
  for i in 0 ... 16 {
    entryRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.None, 1, 0))
    entryRoot.Draw(entryScreen)
    areaRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, i % 2 == 0 ? 4 : 0, 0))
    areaRoot.Draw(areaScreen)
  }
  let before = GC.GetAllocatedBytesForCurrentThread()
  for i in 0 ... 64 {
    entryRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.None, 1, 0))
    entryRoot.Draw(entryScreen)
    areaRoot.Handle(splitterMouse(MouseKind.Move, MouseButton.Left, i % 2 == 0 ? 4 : 0, 0))
    areaRoot.Draw(areaScreen)
  }
  let allocated = GC.GetAllocatedBytesForCurrentThread() - before
  failed = failed + Checks.Expect(allocated == 0,
    "warmed pointer motion and wide-text repaint allocate zero bytes")
  let label = Label{ Text: "x" }
  let following = Label{ Text: "end" }
  let row = Row{ Children: { label, following } }
  let layoutScreen = Screen(20, 2)
  row.Draw(layoutScreen)
  let previousColumn = following.Bounds.Column
  label.Text = "日本"
  row.Draw(layoutScreen)
  failed = failed + Checks.Expect(following.Bounds.Column == previousColumn + 3,
    "changing Label.Text invalidates intrinsic layout and moves its following sibling")
  let measuredTabs = Tabs{ Titles: List[string]{ "a" } }
  failed += checkContentRelayout(measuredTabs, () -> { measuredTabs.Titles = List[string]{ "日本" } })
  let status = StatusBar{ LeftText: "a" }
  failed += checkContentRelayout(status, () -> { status.LeftText = "日本" })
  let measuredToggle = Toggle{ Text: "a" }
  failed += checkContentRelayout(measuredToggle, () -> { measuredToggle.Text = "日本" })
  let measuredButton = Button{ Text: "a" }
  failed += checkContentRelayout(measuredButton, () -> { measuredButton.Text = "日本" })
  let measuredSelect = Select{ Options: List[string]{ "a" } }
  failed += checkContentRelayout(measuredSelect, () -> { measuredSelect.Options = List[string]{ "日本" } })
  let spinner = Spinner{ Text: "a" }
  failed += checkContentRelayout(spinner, () -> { spinner.Text = "日本" })
  return failed
}

private func checkContentRelayout(widget Box, change Action) int32 {
  let following = Label{ Text: "end" }
  let root = Row{ Children: { widget, following } }
  let screen = Screen(40, 2)
  root.Draw(screen)
  let before = following.Bounds.Column
  change()
  root.Draw(screen)
  return Checks.Expect(following.Bounds.Column > before,
    "changing intrinsic widget content moves its following sibling")
}
