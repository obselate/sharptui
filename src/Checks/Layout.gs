package SharpTui

import SharpTui

import System
import System.Collections.Generic

internal open class IntrinsicProbe : Box {
  public var Desired CellSize
  public var SeenWidth int32?
  public var SeenHeight int32?

  public init() {
    Desired = CellSize{}
    SeenWidth = nil
    SeenHeight = nil
  }

  protected override prop MeasuresIntrinsic bool { get { return true } }

  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    SeenWidth = availableWidth
    SeenHeight = availableHeight
    return Desired
  }
}

internal open class TextIntrinsicProbe : Box {
  public var Content string
  public var SeenWidth int32?
  public var MeasuredRows int32

  public init() {
    Content = ""
    SeenWidth = nil
    MeasuredRows = 0
  }

  protected override prop MeasuresIntrinsic bool { get { return true } }

  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize {
    SeenWidth = availableWidth
    let natural = CellText.MeasureWidth(Content)
    let width = availableWidth == nil ? natural : availableWidth!!
    let lines = width > 0 && natural > width ? CellText.Wrap(Content, width) : List[string]{ Content }
    MeasuredRows = lines.Count
    var measuredWidth = natural
    if measuredWidth > width { measuredWidth = width }
    return CellSize{ WidthCells: measuredWidth, HeightRows: MeasuredRows }
  }
}

internal class LayoutCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      let fixed = CellLength.Cells(7)
      failed = failed + Checks.Expect(CellLength.Auto.IsAuto && !fixed.IsAuto && fixed.CellCount == 7,
        "CellLength distinguishes automatic and fixed cell lengths")
      failed = failed + Checks.Expect(rejectsCellLength(-1), "CellLength rejects negative cell counts")

      let inset = CellInsets.All(2)
      let rect = CellRect{ Column: 3, Row: 4, WidthCells: 10, HeightRows: 8 }
      let inner = rect.Inset(inset)
      failed = failed + Checks.Expect(rect.Contains(CellPoint{ Column: 3, Row: 4 })
        && !rect.Contains(CellPoint{ Column: 13, Row: 12 }),
        "CellRect contains terminal cell coordinates")
      failed = failed + Checks.Expect(inner.Column == 5 && inner.Row == 6
        && inner.WidthCells == 6 && inner.HeightRows == 4,
        "CellRect insets each cell-domain edge")

      let positioned = Box{
        Width: CellLength.Cells(4),
        Height: CellLength.Cells(2),
        Placement: Placement.At(CellPoint{ Column: 3, Row: 4 }),
      }
      let centered = Box{
        Width: CellLength.Cells(4),
        Height: CellLength.Cells(2),
        Placement: Placement.Centered,
      }
      let positionedRoot = Box{ Children: { positioned, centered } }
      positionedRoot.Compute(20, 10)
      failed = failed + Checks.Expect(positioned.Bounds.Column == 3 && positioned.Bounds.Row == 4,
        "Placement.At uses a CellPoint without sentinels")
      failed = failed + Checks.Expect(centered.Bounds.Column == 8 && centered.Bounds.Row == 4,
        "Placement.Centered centers a fixed cell rectangle")

      let auto = IntrinsicProbe{ Desired: CellSize{ WidthCells: 6, HeightRows: 2 } }
      let autoRoot = Row{ Children: { auto } }
      autoRoot.Compute(20, 10)
      failed = failed + Checks.Expect(auto.Bounds.WidthCells == 6 && auto.SeenWidth != nil,
        "CellLength.Auto uses the Yoga intrinsic measure callback")

      let fixedProbe = IntrinsicProbe{
        Desired: CellSize{ WidthCells: 3, HeightRows: 1 },
        Width: CellLength.Cells(9),
        Height: CellLength.Cells(4),
      }
      let fixedRoot = Row{ Children: { fixedProbe } }
      fixedRoot.Compute(20, 10)
      failed = failed + Checks.Expect(fixedProbe.Bounds.WidthCells == 9 && fixedProbe.Bounds.HeightRows == 4,
        "fixed CellLength values override intrinsic measurement")

      let changedRoot = Row{}
      let firstChild = Label{ Text: "one", Width: CellLength.Cells(3) }
      let secondChild = Label{ Text: "two", Width: CellLength.Cells(4) }
      changedRoot.Children.Add(firstChild)
      changedRoot.Compute(20, 2)
      changedRoot.Children.Add(secondChild)
      changedRoot.Compute(20, 2)
      failed = failed + Checks.Expect(secondChild.Bounds.Column == 3 && secondChild.Bounds.WidthCells == 4,
        "adding a child after layout updates the Yoga tree")
      changedRoot.Children.RemoveAt(0)
      changedRoot.Compute(20, 2)
      failed = failed + Checks.Expect(secondChild.Bounds.Column == 0,
        "removing a child after layout updates the Yoga tree")

      let wrapped = TextIntrinsicProbe{ Content: "hello world foo" }
      let constrained = Row{
        Children: {
          Box{ Width: CellLength.Cells(10), Children: { wrapped } },
        },
      }
      constrained.Compute(20, 5)
      failed = failed + Checks.Expect(wrapped.SeenWidth == 10 && wrapped.MeasuredRows == 2,
        "Yoga passes the available width into wrapped intrinsic measurement")

      let textBlock = TextBlock{
        Text: "hello world foo",
        Wrapping: TextWrapping.Word,
        Width: CellLength.Cells(10),
        GrowWeight: 0,
      }
      Column{ Children: { textBlock } }.Compute(20, 5)
      failed = failed + Checks.Expect(textBlock.Bounds.WidthCells == 10 && textBlock.Bounds.HeightRows == 2,
        "TextBlock measures wrapped content at its constrained cell width")

      let flag = char.ConvertFromUtf32(0x1F1EF) + char.ConvertFromUtf32(0x1F1F5)
      let ascii = TextIntrinsicProbe{ Content: "abc" }
      let cjk = TextIntrinsicProbe{ Content: "日本" }
      let emoji = TextIntrinsicProbe{ Content: "🦀" }
      let combining = TextIntrinsicProbe{ Content: "é" }
      let flags = TextIntrinsicProbe{ Content: flag }
      let glyphRoot = Row{ Children: { ascii, cjk, emoji, combining, flags } }
      glyphRoot.Compute(30, 1)
      failed = failed + Checks.Expect(ascii.Bounds.WidthCells == 3 && cjk.Bounds.WidthCells == 4
        && emoji.Bounds.WidthCells == 2 && combining.Bounds.WidthCells == 1 && flags.Bounds.WidthCells == 2,
        "intrinsic text uses terminal widths for ASCII, CJK, emoji, combining marks, and flags")

      let label = Label{ Text: "日本" }
      let entry = TextInput{ Text: "é" }
      let toggle = Toggle{ Text: flag }
      let radio = RadioButton{ Text: "🦀" }
      let tabs = Tabs{ Titles: { "a", "日本" } }
      let status = StatusBar{ LeftText: "L", CenterText: "MM", RightText: "R" }
      let gauge = ProgressBar{ OverlayText: "日本" }
      let sparkline = Sparkline{ Values: { 1.0, 2.0, 3.0 } }
      let spinner = Spinner{ Text: "go" }
      let badge = Badge{ Text: "日本" }
      let rule = Separator{ Glyph: "日" }
      let button = Button{ Text: "日本" }
      let menu = Select{ Options: { "a", "日本" } }
      let inline = Row{
        Children: { label, entry, toggle, radio, tabs, status, gauge, sparkline, spinner, badge, rule, button, menu },
      }
      inline.Compute(100, 1)
      failed = failed + Checks.Expect(label.Bounds.WidthCells == 4 && entry.Bounds.WidthCells == 1
        && toggle.Bounds.WidthCells == 6 && radio.Bounds.WidthCells == 6
        && tabs.Bounds.WidthCells == 7 && status.Bounds.WidthCells == 4
        && gauge.Bounds.WidthCells == 4 && sparkline.Bounds.WidthCells == 3
        && spinner.Bounds.WidthCells == 4 && badge.Bounds.WidthCells == 6
        && rule.Bounds.WidthCells == 2 && button.Bounds.WidthCells == 6
        && menu.Bounds.WidthCells == 6,
        "one-row widgets measure terminal-cell content widths")

      let longInput = TextInput{ Text: "this text must shrink inside a narrow row", GrowWeight: 1 }
      let trailingButton = Button{ Text: "Send", Width: CellLength.Cells(6) }
      let shrinkRow = Row{ Children: { longInput, trailingButton } }
      shrinkRow.Compute(18, 1)
      let rowRight = shrinkRow.ContentBounds.Column + shrinkRow.ContentBounds.WidthCells
      let inputRight = longInput.ContentBounds.Column + longInput.ContentBounds.WidthCells
      let buttonRight = trailingButton.ContentBounds.Column + trailingButton.ContentBounds.WidthCells
      failed = failed + Checks.Expect(longInput.ContentBounds.Column == shrinkRow.ContentBounds.Column
        && inputRight == trailingButton.ContentBounds.Column && buttonRight == rowRight,
        "TextInput flex shrink keeps long text inside a fixed row and before its trailing button")

      let labelRow = Label{ Text: "a" }
      let entryRow = TextInput{}
      let toggleRow = Toggle{}
      let radioRow = RadioButton{}
      let tabsRow = Tabs{}
      let statusRow = StatusBar{}
      let gaugeRow = ProgressBar{}
      let sparklineRow = Sparkline{}
      let spinnerRow = Spinner{}
      let badgeRow = Badge{}
      let ruleRow = Separator{}
      let buttonRow = Button{}
      let menuRow = Select{}
      let stacked = Column{
        Children: { labelRow, entryRow, toggleRow, radioRow, tabsRow, statusRow, gaugeRow, sparklineRow, spinnerRow,
          badgeRow, ruleRow, buttonRow, menuRow },
      }
      stacked.Compute(100, 20)
      failed = failed + Checks.Expect(labelRow.Bounds.HeightRows == 1 && entryRow.Bounds.HeightRows == 1
        && toggleRow.Bounds.HeightRows == 1 && radioRow.Bounds.HeightRows == 1
        && tabsRow.Bounds.HeightRows == 1 && statusRow.Bounds.HeightRows == 1
        && gaugeRow.Bounds.HeightRows == 1 && sparklineRow.Bounds.HeightRows == 1
        && spinnerRow.Bounds.HeightRows == 1 && badgeRow.Bounds.HeightRows == 1
        && ruleRow.Bounds.HeightRows == 1 && buttonRow.Bounds.HeightRows == 1
        && menuRow.Bounds.HeightRows == 1,
        "one-row widgets measure one terminal row")

      return failed
    }
  }
}

private func rejectsCellLength(value int32) bool {
  try {
    CellLength.Cells(value)
    return false
  } catch (error ArgumentOutOfRangeException) {
    return true
  }
}
