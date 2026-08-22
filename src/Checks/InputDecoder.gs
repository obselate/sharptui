package SharpTui

import System
import System.Collections.Generic
import System.Text
import System.Threading

internal class InputDecoderCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      let split = InputDecoder()
      split.Feed(csi("97:65:99;6:2;65"))
      failed = failed + Checks.Expect(inputEvents(split).Count == 0, "Kitty CSI-u retains split frames")
      split.Feed([]uint8{ 117 })
      let key = inputEvents(split)
      failed = failed + Checks.Expect(key.Count == 1 && key[0].Kind == UiEventKind.Key
          && key[0].Key == Key.Character && key[0].KeyCode == 97 && key[0].Text == "A"
          && key[0].ShiftedKeyCode == 65 && key[0].BaseLayoutKeyCode == 99
          && key[0].Phase == KeyPhase.Repeat
          && (int32(key[0].Modifiers) & int32(KeyModifiers.Ctrl)) != 0,
        "Kitty CSI-u preserves code, modifiers, alternates, text, and repeat")

      let text = InputDecoder()
      text.Feed(csi("0;1:3;229:770u"))
      let textEvents = inputEvents(text)
      failed = failed + Checks.Expect(textEvents.Count == 1 && textEvents[0].Key == Key.Character
          && textEvents[0].KeyCode == 0 && textEvents[0].Text == "å" + char.ConvertFromUtf32(770)
          && textEvents[0].Phase == KeyPhase.Release,
        "Kitty CSI-u supports associated multi-codepoint text")

      let emptyModifiers = InputDecoder()
      emptyModifiers.Feed(csi("0;;229u"))
      let emptyModifierEvents = inputEvents(emptyModifiers)
      failed = failed + Checks.Expect(emptyModifierEvents.Count == 1 && emptyModifierEvents[0].Text == "å"
          && emptyModifierEvents[0].Modifiers == KeyModifiers.None,
        "Kitty CSI-u accepts empty modifiers before associated text")

      let native = InputDecoder()
      for code in []int32{ 57350, 57351, 57352, 57353, 57354, 57355, 57356, 57357,
          57364, 57365, 57366, 57367, 57368, 57369, 57370, 57371, 57372, 57373, 57374, 57375 } {
        native.Feed(csi(code.ToString() + ";1u"))
      }
      let nativeEvents = inputEvents(native)
      var nativeKeys = nativeEvents.Count == 20
      for i in 0 ... nativeEvents.Count {
        if i < 8 && nativeEvents[i].Key == Key.Unknown { nativeKeys = false }
        if i >= 8 && nativeEvents[i].Key != Key(int32(Key.F1) + i - 8) { nativeKeys = false }
      }
      failed = failed + Checks.Expect(nativeKeys, "Kitty PUA navigation and F1-F12 map to public keys")

      let backTab = InputDecoder()
      backTab.Feed(csi("57346;2u"))
      let backTabEvents = inputEvents(backTab)
      failed = failed + Checks.Expect(backTabEvents.Count == 1 && backTabEvents[0].Key == Key.BackTab
          && backTabEvents[0].KeyCode == 57346
          && (int32(backTabEvents[0].Modifiers) & int32(KeyModifiers.Shift)) != 0,
        "Kitty shifted Tab maps to BackTab with its shared PUA code")

      let canonical = InputDecoder()
      canonical.Feed(csi("1;5A"))
      canonical.Feed(csi("13;1~"))
      canonical.Feed(csi("24;1~"))
      let canonicalEvents = inputEvents(canonical)
      failed = failed + Checks.Expect(canonicalEvents.Count == 3 && canonicalEvents[0].Key == Key.Up
          && canonicalEvents[1].Key == Key.F3 && canonicalEvents[2].Key == Key.F12
          && (int32(canonicalEvents[0].Modifiers) & int32(KeyModifiers.Ctrl)) != 0,
        "Kitty canonical navigation and F-key forms map")

      let ss3 = InputDecoder()
      ss3.Feed([]uint8{ 27, 79 })
      ss3.Feed([]uint8{ 65, 27, 79, 66, 27, 79, 67, 27, 79, 68 })
      let ss3Events = inputEvents(ss3)
      failed = failed + Checks.Expect(ss3Events.Count == 4 && ss3Events[0].Key == Key.Up
          && ss3Events[1].Key == Key.Down && ss3Events[2].Key == Key.Right
          && ss3Events[3].Key == Key.Left,
        "SS3 arrows map without platform terminfo")

      let paste = InputDecoder()
      paste.Feed(csi("200~a" + char(27).ToString() + "[201xb"))
      failed = failed + Checks.Expect(inputEvents(paste).Count == 0, "bracketed paste stays atomic")
      paste.Feed(csi("201~"))
      let pasted = inputEvents(paste)
      let embedded = "a" + char(27).ToString() + "[201xb"
      failed = failed + Checks.Expect(pasted.Count == 1 && pasted[0].Kind == UiEventKind.Paste
          && pasted[0].Text == embedded, "bracketed paste preserves embedded escape bytes")

      let terminfoPaste = InputDecoder()
      terminfoPaste.ConfigureTerminfo(rhelVteFixture())
      terminfoPaste.Feed(csi("200~x" + char(27).ToString() + "[Ay" + char(27).ToString() + "[201~"))
      let terminfoPasted = inputEvents(terminfoPaste)
      failed = failed + Checks.Expect(terminfoPasted.Count == 1 && terminfoPasted[0].Kind == UiEventKind.Paste
          && terminfoPasted[0].Text == "x" + char(27).ToString() + "[Ay",
        "terminfo cannot consume capability bytes inside bracketed paste")

      let mouse = InputDecoder()
      mouse.Feed(csi("<64;12;3"))
      failed = failed + Checks.Expect(inputEvents(mouse).Count == 0, "SGR mouse retains split frame")
      mouse.Feed([]uint8{ 77 })
      let wheel = inputEvents(mouse)
      failed = failed + Checks.Expect(wheel.Count == 1 && wheel[0].Kind == UiEventKind.Mouse
          && wheel[0].Mouse == MouseKind.ScrollUp && wheel[0].Position.Column == 11
          && wheel[0].Position.Row == 2 && wheel[0].Button == MouseButton.None,
        "SGR mouse decodes scroll without a button identity")

      let buttons = InputDecoder()
      buttons.Feed(csi("<0;1;1M"))
      buttons.Feed(csi("<1;2;1M"))
      buttons.Feed(csi("<2;3;1M"))
      buttons.Feed(csi("<3;4;1M"))
      buttons.Feed(csi("<33;5;1M"))
      buttons.Feed(csi("<2;6;1m"))
      buttons.Feed(csi("<3;7;1m"))
      let buttonEvents = inputEvents(buttons)
      failed = failed + Checks.Expect(buttonEvents.Count == 7
          && buttonEvents[0].Mouse == MouseKind.Press && buttonEvents[0].Button == MouseButton.Left
          && buttonEvents[1].Mouse == MouseKind.Press && buttonEvents[1].Button == MouseButton.Middle
          && buttonEvents[2].Mouse == MouseKind.Press && buttonEvents[2].Button == MouseButton.Right
          && buttonEvents[3].Mouse == MouseKind.Press && buttonEvents[3].Button == MouseButton.None
          && buttonEvents[4].Mouse == MouseKind.Move && buttonEvents[4].Button == MouseButton.Middle
          && buttonEvents[5].Mouse == MouseKind.Release && buttonEvents[5].Button == MouseButton.Right
          && buttonEvents[6].Mouse == MouseKind.Release && buttonEvents[6].Button == MouseButton.None,
        "SGR mouse preserves left, middle, right, none, move, and release button identities")

      let malformed = InputDecoder()
      malformed.Feed(csi("?31u"))
      malformed.Feed([]uint8{ 120 })
      let recovered = inputEvents(malformed)
      failed = failed + Checks.Expect(recovered.Count == 1 && recovered[0].Text == "x",
        "unknown Kitty frames drop and stream recovery continues")

      let control = InputDecoder()
      control.Feed([]uint8{ 3 })
      let controlEvents = inputEvents(control)
      failed = failed + Checks.Expect(controlEvents.Count == 1 && controlEvents[0].Key == Key.Character
          && controlEvents[0].Text == "c"
          && (int32(controlEvents[0].Modifiers) & int32(KeyModifiers.Ctrl)) != 0,
        "raw Ctrl+C remains a typed compatibility gesture")

      let controls = InputDecoder()
      controls.Feed([]uint8{ 0, 28, 29, 30, 31 })
      let controlRange = inputEvents(controls)
      failed = failed + Checks.Expect(controlRange.Count == 5 && controlRange[0].Text == " "
          && controlRange[1].Text == "\\" && controlRange[2].Text == "]"
          && controlRange[3].Text == "^" && controlRange[4].Text == "_"
          && controlRange[0].Modifiers == KeyModifiers.Ctrl,
        "raw C0 controls retain their Ctrl character identities")

      let alt = InputDecoder()
      alt.Feed([]uint8{ 27, 120 })
      alt.Feed([]uint8{ 27, 0xc3 })
      alt.Feed([]uint8{ 0xa5 })
      let altEvents = inputEvents(alt)
      failed = failed + Checks.Expect(altEvents.Count == 2 && altEvents[0].Text == "x"
          && altEvents[1].Text == "å" && altEvents[0].Kind == UiEventKind.Key
          && altEvents[1].Kind == UiEventKind.Key
          && altEvents[0].Modifiers == KeyModifiers.Alt && altEvents[1].Modifiers == KeyModifiers.Alt,
        "VTE Alt prefixes preserve ASCII and split UTF-8 characters")

      let terminfo = InputDecoder()
      terminfo.ConfigureTerminfo(rhelVteFixture())
      terminfo.Feed([]uint8{ 27, 91 })
      failed = failed + Checks.Expect(inputEvents(terminfo).Count == 0, "terminfo retains split capability prefix")
      terminfo.Feed([]uint8{ 65 })
      let terminfoEvents = inputEvents(terminfo)
      failed = failed + Checks.Expect(terminfoEvents.Count == 1 && terminfoEvents[0].Key == Key.Up,
        "terminfo capability fixture supplies RHEL VTE navigation")
      terminfo.Feed(csi("1;5D"))
      terminfo.Feed(csi("6;3~"))
      let modified = inputEvents(terminfo)
      failed = failed + Checks.Expect(modified.Count == 2 && modified[0].Key == Key.Left
          && modified[0].KeyCode == 57350
          && (int32(modified[0].Modifiers) & int32(KeyModifiers.Ctrl)) != 0
          && modified[1].Key == Key.PageDown
          && (int32(modified[1].Modifiers) & int32(KeyModifiers.Alt)) != 0,
        "terminfo fixture preserves Ctrl and Alt modifier capabilities")
      terminfo.Feed([]uint8{ 27 })
      terminfo.FlushPending()
      let escaped = inputEvents(terminfo)
      failed = failed + Checks.Expect(escaped.Count == 1 && escaped[0].Key == Key.Escape,
        "terminfo fallback flushes a lone Escape")

      if !OperatingSystem.IsWindows() {
        var systemCapabilities []TerminfoKeySequence
        if TerminfoCapabilities.TryLoad("vte-256color", out systemCapabilities) {
          var systemBackTab = false
          var systemCtrlLeft = false
          for item in systemCapabilities {
            if item.Key == Key.BackTab && item.Modifiers == KeyModifiers.Shift { systemBackTab = true }
            if item.Key == Key.Left && item.Modifiers == KeyModifiers.Ctrl { systemCtrlLeft = true }
          }
          failed = failed + Checks.Expect(systemBackTab && systemCtrlLeft,
            "system terminfo maps VTE reverse tab and Ctrl navigation")
        }
      }

      let longest = TerminfoKeyDecoder()
      longest.Configure([]TerminfoKeySequence{
        TerminfoKeySequence{ Bytes: []uint8{ 27, 91, 88 }, Key: Key.F1 },
        TerminfoKeySequence{ Bytes: []uint8{ 27, 91, 88, 89 }, Key: Key.F2 },
      })
      longest.Feed(27)
      longest.Feed(91)
      longest.Feed(88)
      var output = TerminfoOutput{}
      failed = failed + Checks.Expect(!longest.TryDequeue(out output), "terminfo waits for longest match")
      longest.Feed(89)
      failed = failed + Checks.Expect(longest.TryDequeue(out output) && output.Event.Key == Key.F2,
        "terminfo emits the longest capability match")

      let idle = InputDecoder()
      var empty = UiEvent{}
      let idleBefore = GC.GetAllocatedBytesForCurrentThread()
      for i in 0 ... 10000 { idle.TryDequeue(out empty) }
      let idleAfter = GC.GetAllocatedBytesForCurrentThread()
      failed = failed + Checks.Expect(idleAfter == idleBefore, "empty input steady state is 0 B")

      let warm = InputDecoder()
      let warmKey = csi("97;1u")
      warm.Feed(warmKey)
      warm.TryDequeue(out empty)
      let warmBefore = GC.GetAllocatedBytesForCurrentThread()
      for i in 0 ... 10000 {
        warm.Feed(warmKey)
        warm.TryDequeue(out empty)
      }
      let warmAfter = GC.GetAllocatedBytesForCurrentThread()
      failed = failed + Checks.Expect(warmAfter == warmBefore, "warmed Kitty key decoding is 0 B")

      let gesture = KeyGesture.Ctrl("c")
      let gestureEvent = UiEvent{
        Kind: UiEventKind.Key,
        Key: Key.Character,
        Text: "C",
        Modifiers: KeyModifiers(int32(KeyModifiers.Ctrl) | int32(KeyModifiers.CapsLock)
          | int32(KeyModifiers.NumLock)),
        Phase: KeyPhase.Press,
      }
      let configuredWithLocks = KeyGesture{
        Key: Key.Character,
        Text: "c",
        Modifiers: KeyModifiers(int32(KeyModifiers.Ctrl) | int32(KeyModifiers.CapsLock)),
      }
      failed = failed + Checks.Expect(gesture.Matches(gestureEvent)
          && configuredWithLocks.Matches(UiEvent{
            Kind: UiEventKind.Key,
            Key: Key.Character,
            Text: "c",
            Modifiers: KeyModifiers.Ctrl,
            Phase: KeyPhase.Press,
          })
          && (int32(gestureEvent.Modifiers) & int32(KeyModifiers.CapsLock)) != 0
          && (int32(gestureEvent.Modifiers) & int32(KeyModifiers.NumLock)) != 0,
        "Ctrl gestures ignore lock modifiers while UiEvent preserves them")
      let gestureBefore = GC.GetAllocatedBytesForCurrentThread()
      for i in 0 ... 10000 { gesture.Matches(gestureEvent) }
      let gestureAfter = GC.GetAllocatedBytesForCurrentThread()
      failed = failed + Checks.Expect(gestureAfter == gestureBefore,
        "warmed lock-normalized key gesture matching is 0 B")

      let concurrent = Input(AutoResetEvent(false))
      let producer = InputProducerCheck(concurrent)
      let worker = Thread(producer.Run)
      worker.Start()
      var concurrentCount = 0
      for i in 0 ... 128 {
        producer.Ready.WaitOne()
        if concurrent.TryDequeue(out empty) && empty.Text == "a" { concurrentCount = concurrentCount + 1 }
        producer.Acknowledged.Set()
      }
      worker.Join()
      failed = failed + Checks.Expect(concurrentCount == 128,
        "Input safely transfers events between producer and consumer threads")

      let entry = TextInput()
      let root = Box{ Children: { entry } }
      root.Draw(Screen(30, 3))
      root.Focus(entry)
      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Character, Text: "a", Phase: KeyPhase.Press })
      root.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Character, Text: "a", Phase: KeyPhase.Release })
      failed = failed + Checks.Expect(entry.Text == "a", "TextInput ignores key release")

      let releaseAware = ReleaseAwareBox()
      let releaseRoot = Box{ Children: { releaseAware } }
      releaseRoot.Draw(Screen(10, 2))
      releaseRoot.Focus(releaseAware)
      releaseRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter, Phase: KeyPhase.Release })
      failed = failed + Checks.Expect(releaseAware.SawRelease,
        "custom boxes can observe key release events")

      let list = ListView()
      list.Add("one")
      list.Add("two")
      let listRoot = Box{ Children: { list } }
      listRoot.Draw(Screen(20, 4))
      listRoot.Focus(list)
      listRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Down, Phase: KeyPhase.Press })
      listRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Down, Phase: KeyPhase.Release })
      failed = failed + Checks.Expect(list.SelectedIndex == 1, "navigation widgets ignore key release")

      return failed
    }
  }
}

private func csi(body string) []uint8 {
  return Encoding.UTF8.GetBytes(char(27).ToString() + "[" + body)
}

private func rhelVteFixture() []TerminfoKeySequence {
  return []TerminfoKeySequence{
    TerminfoKeySequence{ Bytes: csi("A"), Key: Key.Up },
    TerminfoKeySequence{ Bytes: csi("B"), Key: Key.Down },
    TerminfoKeySequence{ Bytes: csi("C"), Key: Key.Right },
    TerminfoKeySequence{ Bytes: csi("D"), Key: Key.Left },
    TerminfoKeySequence{ Bytes: csi("H"), Key: Key.Home },
    TerminfoKeySequence{ Bytes: csi("F"), Key: Key.End },
    TerminfoKeySequence{ Bytes: csi("2~"), Key: Key.Insert },
    TerminfoKeySequence{ Bytes: csi("3~"), Key: Key.Delete },
    TerminfoKeySequence{ Bytes: csi("5~"), Key: Key.PageUp },
    TerminfoKeySequence{ Bytes: csi("6~"), Key: Key.PageDown },
    TerminfoKeySequence{ Bytes: csi("1;5D"), Key: Key.Left, Modifiers: KeyModifiers.Ctrl },
    TerminfoKeySequence{ Bytes: csi("6;3~"), Key: Key.PageDown, Modifiers: KeyModifiers.Alt },
  }
}

private func inputEvents(decoder InputDecoder) List[UiEvent] {
  let events = List[UiEvent]()
  var ev = UiEvent{}
  while decoder.TryDequeue(out ev) { events.Add(ev) }
  return events
}

private class InputProducerCheck {
  private var input Input
  internal var Ready AutoResetEvent
  internal var Acknowledged AutoResetEvent

  internal init(value Input) {
    input = value
    Ready = AutoResetEvent(false)
    Acknowledged = AutoResetEvent(false)
  }

  internal func Run() {
    for i in 0 ... 128 {
      input.Feed([]uint8{ 97 })
      Ready.Set()
      Acknowledged.WaitOne()
    }
  }
}

private open class ReleaseAwareBox : Box {
  internal var SawRelease bool

  internal init() {
    SawRelease = false
    CanFocus = true
  }

  protected override func Accept(ev UiEvent) EventResult {
    if inputIsRelease(ev) {
      SawRelease = true
      return EventResult.Handled
    }
    return EventResult.Continue
  }
}
