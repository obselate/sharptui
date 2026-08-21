package SharpTui

import SharpTui

import System
import System.Collections.Generic

public class MoreCheck {
  shared {
    public func Run() int32 {
      var failed = 0

      let root = TreeNode{ Text: "root", Value: "tag-root" }
      let c1 = TreeNode{ Text: "c1", Value: "tag-c1" }
      let c2 = TreeNode{ Text: "c2", Value: "tag-c2" }
      root.Children.Add(c1)
      root.Children.Add(c2)

      let tree = TreeView{}
      tree.Roots.Add(root)
      let troot = Box{ Children: { tree } }
      let treeScreen = Screen(40, 10)
      troot.Draw(treeScreen)
      troot.Handle(keyEv(Key.Tab))
      failed = failed + Checks.Expect(treeScreen.Probe(0, 1) == " ", "collapsed tree shows only the root")
      failed = failed + Checks.Expect(tree.SelectedIndex == 0, "selection starts on the root")
      failed = failed + Checks.Expect(!root.IsLeaf && c1.IsLeaf, "TreeNode.IsLeaf derives from Children")

      troot.Handle(keyEv(Key.Right))
      failed = failed + Checks.Expect(root.IsExpanded, "Right expands the root")
      troot.Draw(treeScreen)
      failed = failed + Checks.Expect(treeScreen.Probe(4, 1) == "c" && treeScreen.Probe(4, 2) == "c",
        "opening reveals both children")

      troot.Handle(keyEv(Key.Down))
      failed = failed + Checks.Expect(tree.SelectedNode?.Text == "c1", "down selects the first child in flattened order")
      failed = failed + Checks.Expect(tree.SelectedNode?.Value == "tag-c1", "Value travels with the selected node")
      if let moved = tree.ConsumeSelectionChange() {
        failed = failed + Checks.Expect(moved.PreviousIndex == 0 && moved.SelectedIndex == 1,
          "TreeView exposes and consumes user selection changes")
      } else {
        failed = failed + Checks.Expect(false, "TreeView exposes user selection changes")
      }
      tree.SelectedIndex = 1
      failed = failed + Checks.Expect(tree.ConsumeSelectionChange() == nil,
        "programmatic TreeView selection clears pending output")

      troot.Handle(keyEv(Key.Down))
      failed = failed + Checks.Expect(tree.SelectedNode?.Text == "c2", "a second down selects the second child")
      failed = failed + Checks.Expect(troot.Handle(keyEv(Key.Down)) == EventResult.Continue, "down at the last visible row does not move")

      troot.Handle(keyEv(Key.Up))
      failed = failed + Checks.Expect(tree.SelectedIndex == 1, "up moves back to the first child")

      troot.Handle(keyEv(Key.Left))
      failed = failed + Checks.Expect(tree.SelectedIndex == 0, "left on a closed leaf child moves to its parent")

      troot.Handle(keyEv(Key.Left))
      failed = failed + Checks.Expect(!root.IsExpanded, "left on the expanded root collapses it instead of moving")
      troot.Draw(treeScreen)
      failed = failed + Checks.Expect(treeScreen.Probe(0, 1) == " ", "closing the root collapses back to one row")

      troot.Handle(keyEv(Key.Right))
      troot.Draw(treeScreen)
      failed = failed + Checks.Expect(treeScreen.Probe(4, 2) == "c", "right reopens the root")

      troot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(!root.IsExpanded, "Enter toggles the non-leaf root closed")
      troot.Draw(treeScreen)
      failed = failed + Checks.Expect(treeScreen.Probe(0, 1) == " ", "the toggle collapses the rows again")

      let lateRoot = TreeNode{ Text: "root", IsExpanded: true }
      let lateTree = TreeView{ Roots: { lateRoot } }
      let lateBox = Box{ Children: { lateTree } }
      let lateScreen = Screen(20, 4)
      lateBox.Draw(lateScreen)
      lateRoot.Children.Add(TreeNode{ Text: "late" })
      lateTree.Refresh()
      lateBox.Draw(lateScreen)
      failed = failed + Checks.Expect(lateScreen.Probe(4, 1) == "l",
        "TreeView.Refresh exposes direct child-list changes")

      let replacementTree = TreeView{ Roots: { TreeNode{ Text: "first" }, TreeNode{ Text: "second" } } }
      let replacementTreeRoot = Box{ Children: { replacementTree } }
      replacementTreeRoot.Draw(Screen(20, 4))
      replacementTreeRoot.Focus(replacementTree)
      replacementTreeRoot.Handle(keyEv(Key.Down))
      replacementTree.Roots = List[TreeNode]{ TreeNode{ Text: "replacement" } }
      failed = failed + Checks.Expect(replacementTree.SelectedIndex == 0
          && replacementTree.ConsumeSelectionChange() == nil,
        "TreeView Roots replacement normalizes selection and clears pending output")
      replacementTree.Roots = List[TreeNode]{ TreeNode{ Text: "first" }, TreeNode{ Text: "second" } }
      replacementTreeRoot.Handle(keyEv(Key.Down))
      replacementTree.Roots.Add(TreeNode{ Text: "third" })
      replacementTree.Refresh()
      failed = failed + Checks.Expect(replacementTree.ConsumeSelectionChange() == nil,
        "TreeView.Refresh clears pending output after direct Roots mutation")

      let picker = Select{ Options: { "aa", "bb", "cc" } }
      let mroot = Box{ Children: { picker } }
      let mscr = Screen(20, 10)
      mroot.Draw(mscr)
      failed = failed + Checks.Expect(mscr.Probe(0, 0) == "a", "closed, the Select renders the current option")

      mroot.Handle(keyEv(Key.Tab))
      mroot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(picker.IsOpen, "Enter opens the Select")

      mroot.Handle(keyEv(Key.Down))
      failed = failed + Checks.Expect(picker.SelectedIndex == 0, "selection does not change until committed")

      mroot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(picker.SelectedIndex == 1, "Enter commits the internal highlight")
      failed = failed + Checks.Expect(!picker.IsOpen, "committing closes the Select")
      if let moved = picker.ConsumeSelectionChange() {
        failed = failed + Checks.Expect(moved.PreviousIndex == 0 && moved.SelectedIndex == 1,
          "Select exposes and consumes committed selection changes")
      } else {
        failed = failed + Checks.Expect(false, "Select exposes committed selection changes")
      }
      picker.SelectedIndex = 1
      failed = failed + Checks.Expect(picker.ConsumeSelectionChange() == nil,
        "programmatic Select selection clears pending output")

      mroot.Handle(keyEv(Key.Enter))
      mroot.Handle(keyEv(Key.Down))
      mroot.Handle(keyEv(Key.Escape))
      failed = failed + Checks.Expect(!picker.IsOpen, "Escape closes the Select")
      failed = failed + Checks.Expect(picker.SelectedIndex == 1, "Escape does not commit the internal highlight")

      mroot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(picker.IsOpen, "Select reopens for the outside-press check")
      mroot.Handle(mouseEv(0, 9))
      failed = failed + Checks.Expect(!picker.IsOpen, "a press outside the open list closes it")

      let replacementPicker = Select{ Options: { "first", "second" } }
      let replacementPickerRoot = Box{ Children: { replacementPicker } }
      replacementPickerRoot.Draw(Screen(20, 4))
      replacementPickerRoot.Focus(replacementPicker)
      replacementPickerRoot.Handle(keyEv(Key.Enter))
      replacementPickerRoot.Handle(keyEv(Key.Down))
      replacementPickerRoot.Handle(keyEv(Key.Enter))
      replacementPicker.Options = List[string]{ "replacement" }
      failed = failed + Checks.Expect(replacementPicker.SelectedIndex == 0
          && replacementPicker.ConsumeSelectionChange() == nil,
        "Select Options replacement normalizes selection and clears pending output")
      replacementPicker.Options.Add("second")
      replacementPickerRoot.Handle(keyEv(Key.Enter))
      replacementPickerRoot.Handle(keyEv(Key.Down))
      replacementPickerRoot.Handle(keyEv(Key.Enter))
      replacementPicker.Options.Clear()
      replacementPicker.Refresh()
      failed = failed + Checks.Expect(replacementPicker.SelectedIndex == 0
          && replacementPicker.ConsumeSelectionChange() == nil,
        "Select.Refresh clears pending output after direct Options mutation")

      let longSelect = Select{}
      var oi = 0
      while oi < 20 {
        longSelect.Options.Add(char(97 + oi).ToString())
        oi = oi + 1
      }
      let sroot = Box{ Children: { longSelect } }
      let sscr = Screen(20, 10)
      sroot.Draw(sscr)
      sroot.Handle(keyEv(Key.Tab))
      sroot.Handle(keyEv(Key.Enter))
      var di = 0
      while di < 12 {
        sroot.Handle(keyEv(Key.Down))
        di = di + 1
      }
      failed = failed + Checks.Expect(longSelect.SelectedIndex == 0, "moving the internal highlight does not select")

      sroot.Draw(sscr)
      failed = failed + Checks.Expect(sscr.Probe(1, 7) == "m", "the scrolled window keeps option 12 on screen")

      sroot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(longSelect.SelectedIndex == 12, "Enter commits the scrolled internal highlight")

      sroot.Handle(keyEv(Key.Enter))
      sroot.Draw(sscr)
      sroot.Handle(mouseEv(1, 7))
      failed = failed + Checks.Expect(longSelect.SelectedIndex == 12,
        "a press on the last drawn row selects the scrolled option, not row index 5")

      let ok = DialogAction{ Text: "OK" }
      let cancel = DialogAction{ Text: "Cancel", IsCancel: true }
      let dialog = Dialog{ Message: "Are you sure?" }
      var result DialogAction?
      dialog.OnResult = (action DialogAction) -> result = action
      dialog.Actions.Add(ok)
      dialog.Actions.Add(cancel)
      failed = failed + Checks.Expect(dialog.Placement.IsCentered && dialog.DimBackground,
        "Dialog defaults to centered placement with background dimming")
      failed = failed + Checks.Expect(dialog.Children.Count > 0,
        "Dialog composes Message and Actions without Compose")

      let filler = Box{}
      let mdroot = Box{ Children: { filler, dialog } }
      mdroot.Draw(Screen(60, 20))
      let actionRow = dialog.Children[dialog.Children.Count - 1]
      let okButton = actionRow.Children[0]
      let cancelButton = actionRow.Children[1]
      failed = failed + Checks.Expect(okButton.Bounds.WidthCells == CellText.MeasureWidth(ok.Text) + 2
        && cancelButton.Bounds.WidthCells == CellText.MeasureWidth(cancel.Text) + 2,
        "Dialog lays added actions out on the next draw")

      mdroot.Focus(okButton)
      failed = failed + Checks.Expect(Object.ReferenceEquals(mdroot.FocusedElement, okButton),
        "Dialog action participates in focus routing")
      mdroot.Handle(keyEv(Key.Enter))
      failed = failed + Checks.Expect(Object.ReferenceEquals(result, ok),
        "Enter on the focused action invokes the typed result callback")

      result = nil
      mdroot.Handle(mouseEv(cancelButton.Bounds.Column + 1, cancelButton.Bounds.Row))
      failed = failed + Checks.Expect(Object.ReferenceEquals(result, cancel),
        "a mouse press invokes the action under the pointer")

      result = nil
      mdroot.Handle(keyEv(Key.Escape))
      failed = failed + Checks.Expect(Object.ReferenceEquals(result, cancel),
        "Escape invokes the cancel action")

      let spin = Spinner{}
      let spscr = Screen(20, 3)
      let sproot = Box{ Children: { spin } }
      sproot.Draw(spscr)
      failed = failed + Checks.Expect(spscr.Probe(0, 0) == spin.Frames[0] && spin.FrameIndex == 0,
        "FrameIndex zero renders the first glyph")

      spin.Advance()
      sproot.Draw(spscr)
      failed = failed + Checks.Expect(spin.FrameIndex == 1, "Advance increments the read-only FrameIndex")
      failed = failed + Checks.Expect(spscr.Probe(0, 0) == spin.Frames[1], "the render follows FrameIndex")

      var ticks = 0
      while ticks < 9 {
        spin.Advance()
        ticks = ticks + 1
      }
      sproot.Draw(spscr)
      failed = failed + Checks.Expect(spin.FrameIndex == 0, "FrameIndex wraps after Frames.Count advances")
      failed = failed + Checks.Expect(spscr.Probe(0, 0) == spin.Frames[0], "the cycle wraps back to the first glyph")
      let emptySpin = Spinner{ Frames: List[string](), Text: "wait", Width: CellLength.Cells(4) }
      let emptySpinRoot = Box{ Children: { emptySpin } }
      let emptySpinScreen = Screen(8, 3)
      emptySpinRoot.Draw(emptySpinScreen)
      emptySpin.Advance()
      failed = failed + Checks.Expect(emptySpin.FrameIndex == 0 && emptySpinScreen.Probe(0, 0) == "w",
        "an empty Frames collection renders Text without dividing by zero")

      let badge = Badge{ Text: "new" }
      let badgeRoot = Box{ Children: { badge } }
      let badgeScreen = Screen(8, 3)
      badgeRoot.Draw(badgeScreen)
      failed = failed + Checks.Expect(badgeScreen.Probe(0, 0) == " " && badgeScreen.Probe(1, 0) == "n"
        && badgeScreen.Probe(3, 0) == "w", "Badge.Text renders a padded pill")

      let separator = Separator{ Glyph: "|", Orientation: SeparatorOrientation.Vertical, Width: CellLength.Cells(1), Height: CellLength.Cells(3) }
      let separatorRoot = Box{ Children: { separator } }
      let separatorScreen = Screen(4, 5)
      separatorRoot.Draw(separatorScreen)
      failed = failed + Checks.Expect(separatorScreen.Probe(0, 0) == "|" && separatorScreen.Probe(0, 2) == "|",
        "Separator.Orientation renders a vertical rule")

      return failed
    }
  }
}
