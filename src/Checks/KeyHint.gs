package SharpTui

import System
import System.Collections.Generic

internal class KeyHintBarCheck : KeyHintBar {
  internal func AcceptInput(ev UiEvent) EventResult -> Accept(ev)
}

func checkKeyHints() int32 {
  var failed = 0
  let itemStyle = Style{ Foreground: Color.Rgb("FF9900"), Attributes: TextAttributes.Italic }
  let modes = List[TerminalColorMode]{ TerminalColorMode.TrueColor, TerminalColorMode.NoColor }
  for mode in modes {
    let baseStyle = Style{ Foreground: Color.Rgb("FFFFFF") }
    let keyStyle = Style{ Foreground: Color.Rgb("00FF00"), Attributes: TextAttributes.Bold }
    let disabledStyle = Style{ Foreground: Color.Rgb("888888"), Attributes: TextAttributes.Dim }
    let bar = KeyHintBar{
      Style: baseStyle, KeyStyle: keyStyle, DisabledStyle: disabledStyle,
      Items: {
        KeyHint{ KeyText: "A", Text: "打开", Style: itemStyle },
        KeyHint{ KeyText: "B", Text: "保存" },
        KeyHint{ KeyText: "C", Text: "退出", Style: itemStyle, IsEnabled: false },
      },
    }
    let screen = Screen(40, 12)
    screen.ColorMode = mode
    bar.Draw(screen)
    let expected = Screen(40, 12)
    expected.ColorMode = mode
    expected.Fill(CellRect{ WidthCells: 40, HeightRows: 12 }, baseStyle)
    expected.Write(0, 0, "A", itemStyle.MergedOver(keyStyle.MergedOver(baseStyle)))
    expected.Write(2, 0, "打开", itemStyle.MergedOver(baseStyle))
    expected.Write(8, 0, "B", keyStyle.MergedOver(baseStyle))
    expected.Write(10, 0, "保存", baseStyle)
    expected.Write(16, 0, "C", disabledStyle.MergedOver(itemStyle.MergedOver(keyStyle.MergedOver(baseStyle))))
    expected.Write(18, 0, "退出", disabledStyle.MergedOver(itemStyle.MergedOver(baseStyle)))
    failed = failed + Checks.Expect(screen.Flush() == expected.Flush(),
      "KeyHintBar merges item styles over bar styles, with disabled style last, in color and NoColor")
  }
  let languages = List[bool]{ false, true }
  let widths = List[int32]{ 20, 40, 80, 160 }
  let buttons = List[MouseButton]{ MouseButton.None, MouseButton.Middle, MouseButton.Right }
  let motions = List[MouseKind]{ MouseKind.Move, MouseKind.Release, MouseKind.ScrollUp, MouseKind.ScrollDown }
  for chinese in languages {
    for width in widths {
      var clicked = -1
      let bar = KeyHintBarCheck{ Width: CellLength.Cells(width), Height: CellLength.Cells(2) }
      let root = Box{ Children: { bar } }
      bar.Items.Add(KeyHint{ KeyText: "A", Text: chinese ? "打开" : "Open", Priority: 0, OnClick: () -> { clicked = 0 } })
      bar.Items.Add(KeyHint{ KeyText: "B", Text: chinese ? "保存" : "Save", Style: itemStyle, Priority: 5, OnClick: () -> { clicked = 1 } })
      bar.Items.Add(KeyHint{ KeyText: "C", Text: chinese ? "查阅" : "View", Priority: 10, OnClick: () -> { clicked = 2 } })
      bar.Items.Add(KeyHint{ KeyText: "D", Text: chinese ? "退出" : "Quit", Style: itemStyle, Priority: 5, IsEnabled: false, OnClick: () -> { clicked = 3 } })
      bar.Items.Add(KeyHint{ KeyText: "E", Text: chinese ? "帮助" : "Help", Priority: -1 })
      bar.Items.Add(KeyHint{ KeyText: "F", Text: String('x', 200), Priority: 100, OnClick: () -> { clicked = 5 } })
      let screen = Screen(width, 2)
      screen.ColorMode = TerminalColorMode.NoColor
      let expected = Screen(width, 2)
      let hits = [width]int32
      for x in 0 ... width { hits[x] = -1 }
      let visible = width == 20 ? List[int32]{ 1, 2 } : List[int32]{ 0, 1, 2, 3, 4 }
      var start = 0
      for index in visible {
        let item = bar.Items[index]
        expected.Write(start, 0, item.KeyText)
        expected.Write(start + 2, 0, item.Text)
        for x in start ... start + 6 { hits[x] = index }
        start = start + 8
      }
      root.Draw(screen)
      for y in 0 ... 2 {
        for x in 0 ... width {
          failed = failed + Checks.Expect(screen.Probe(x, y) == expected.Probe(x, y),
            "KeyHintBar keeps whole priority-selected EN and ZH hints in their original order")
          clicked = -1
          let result = root.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press,
            Button: MouseButton.Left, Position: CellPoint{ Column: x, Row: y } })
          let hit = y == 0 ? hits[x] : -1
          let active = hit >= 0 && hit < 3
          failed = failed + Checks.Expect(clicked == (active ? hit : -1)
            && result == (active ? EventResult.Handled : EventResult.Continue),
            "KeyHintBar click regions match drawn items, excluding gaps, disabled hints and extra rows")
        }
      }
      for button in buttons {
        clicked = -1
        failed = failed + Checks.Expect(root.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press,
          Button: button, Position: CellPoint{ Column: 0, Row: 0 } }) == EventResult.Continue && clicked == -1,
          "KeyHintBar ignores non-left presses")
      }
      for kind in motions {
        clicked = -1
        failed = failed + Checks.Expect(root.Handle(UiEvent{ Kind: UiEventKind.Mouse, Mouse: kind,
          Button: MouseButton.Left, Position: CellPoint{ Column: 0, Row: 0 } }) == EventResult.Continue && clicked == -1,
          "KeyHintBar ignores motion, release and wheel events")
      }
      let wire = screen.Flush()
      let escape = char(27).ToString()
      failed = failed + Checks.Expect(wire.Contains(escape + "[1m") && !wire.Contains("38;") && !wire.Contains("48;"),
        "KeyHintBar keeps bold key text without color")
      if width >= 40 {
        failed = failed + Checks.Expect(wire.Contains(escape + "[2m"), "KeyHintBar dims disabled hints without color")
      }
      let press = UiEvent{ Kind: UiEventKind.Mouse, Mouse: MouseKind.Press,
        Button: MouseButton.Left, Position: CellPoint{ Column: 0, Row: 0 } }
      root.Handle(press)
      var paintBytes = int64(0)
      var inputBytes = int64(0)
      var frame = 0
      while frame < 128 {
        let before = GC.GetAllocatedBytesForCurrentThread()
        screen.Clear()
        root.Draw(screen)
        let painted = GC.GetAllocatedBytesForCurrentThread()
        bar.AcceptInput(press)
        let handled = GC.GetAllocatedBytesForCurrentThread()
        paintBytes = paintBytes + painted - before
        inputBytes = inputBytes + handled - painted
        frame = frame + 1
      }
      failed = failed + Checks.Expect(paintBytes == 0 && inputBytes == 0,
        "KeyHintBar allocation bytes, paint: " + paintBytes.ToString() + ", input: " + inputBytes.ToString())
      bar.Items[0].Text = chinese ? "完整描述" : "Long description"
      bar.Items[0].Priority = 200
      screen.Clear()
      root.Draw(screen)
      failed = failed + Checks.Expect(screen.Probe(0, 0) == "A", "KeyHintBar applies direct text and priority changes on the next layout")
      bar.Items.Clear()
      root.Draw(screen)
      failed = failed + Checks.Expect(root.Handle(press) == EventResult.Continue, "KeyHintBar clears old click regions when items are removed")
    }
  }
  return failed
}
