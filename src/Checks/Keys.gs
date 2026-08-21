package SharpTui

import SharpTui

import System

internal open class RouteProbe : Box {
  internal prop Received string { get; set; }
  internal prop Response EventResult { get; set; }

  public init() {
    Received = ""
    Response = EventResult.Continue
    CanFocus = true
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.TextInput { Received = Received + ev.Text }
    return Response
  }
}

internal open class RouteAncestor : Box {
  internal prop EscapeCount int32 { get; set; }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Key && ev.Key == Key.Escape {
      EscapeCount = EscapeCount + 1
      return EventResult.Handled
    }
    return EventResult.Continue
  }
}

internal open class RouteBox : Box {
  internal prop Events int32 { get; set; }
  internal prop Response EventResult { get; set; }

  protected override func Accept(ev UiEvent) EventResult {
    Events = Events + 1
    return Response
  }
}

internal class KeysCheck {
  shared {
    internal func Run() int32 {
      var failed = 0

      let typed = UiEvent{
        Kind: UiEventKind.TextInput,
        Key: Key.Character,
        Text: "s",
        Modifiers: KeyModifiers.Ctrl,
      }
      failed = failed + Checks.Expect(KeyGesture.Ctrl("s").Matches(typed),
        "typed ctrl character gesture matches")
      failed = failed + Checks.Expect(!KeyGesture.Character("s").Matches(typed),
        "typed gestures require exact modifiers")
      failed = failed + Checks.Expect(KeyGesture.Character("S").Matches(UiEvent{
          Kind: UiEventKind.TextInput, Key: Key.Character, Text: "s" }),
        "typed character gestures are case-insensitive")
      failed = failed + Checks.Expect(KeyGesture{ Key: Key.F1 }.Matches(UiEvent{
          Kind: UiEventKind.Key, Key: Key.F1 }),
        "typed named key gesture matches")

      let typedBinds = Keymap()
      var saveHits = 0
      var quitHits = 0
      let save = typedBinds.Add(KeyGesture.Ctrl("s"), BindingPhase.BeforeWidgets,
        () -> saveHits = saveHits + 1)
      typedBinds.Add(KeyGesture.Character("q"), BindingPhase.AfterWidgets,
        () -> quitHits = quitHits + 1)
      failed = failed + Checks.Expect(typedBinds.Offer(typed, BindingPhase.BeforeWidgets),
        "before-widgets typed binding takes its event")
      failed = failed + Checks.Expect(saveHits == 1,
        "binding invokes its handler once")
      save.IsEnabled = false
      failed = failed + Checks.Expect(!typedBinds.Offer(typed, BindingPhase.BeforeWidgets)
          && saveHits == 1,
        "disabled binding declines activation")
      save.IsEnabled = true
      failed = failed + Checks.Expect(!typedBinds.Offer(UiEvent{
          Kind: UiEventKind.TextInput, Key: Key.Character, Text: "q" }, BindingPhase.BeforeWidgets),
        "after-widgets binding is absent before widgets")
      failed = failed + Checks.Expect(typedBinds.Offer(UiEvent{
          Kind: UiEventKind.TextInput, Key: Key.Character, Text: "q" }, BindingPhase.AfterWidgets),
        "after-widgets binding takes its event")
      failed = failed + Checks.Expect(quitHits == 1, "after-widgets binding invokes its handler")

      let commandMap = Keymap()
      var commandHits = 0
      let command = commandMap.Add("save", "Save", KeyGesture.Ctrl("s"),
        BindingPhase.BeforeWidgets, () -> commandHits = commandHits + 1)
      failed = failed + Checks.Expect(commandMap.Offer(typed, BindingPhase.BeforeWidgets)
          && commandHits == 1
          && command.Id == "save"
          && command.Label == "Save"
          && Object.ReferenceEquals(commandMap.Bindings[0], command),
        "named binding carries command metadata and invokes directly")

      let first = RouteProbe()
      let second = RouteProbe()
      let routedRoot = Row{ Children: { first, second } }
      routedRoot.Focus(first)
      let declined = routedRoot.Handle(UiEvent{
        Kind: UiEventKind.TextInput, Key: Key.Character, Text: "x" })
      failed = failed + Checks.Expect(declined == EventResult.Continue
          && first.Received == "x" && second.Received == "",
        "declined text stays inside the focused path")

      let child = RouteProbe()
      let ancestor = RouteAncestor{ Children: { child } }
      ancestor.Focus(child)
      failed = failed + Checks.Expect(ancestor.Handle(UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Handled
          && ancestor.EscapeCount == 1,
        "declined focused events bubble through ancestors")

      let automatic = RouteProbe()
      let automaticRoot = Box{ Children: { automatic } }
      automaticRoot.Handle(UiEvent{
        Kind: UiEventKind.TextInput, Key: Key.Character, Text: "a" })
      failed = failed + Checks.Expect(automatic.IsFocused && automatic.Received == "a",
        "the first keyboard event focuses the first focusable control")

      let app = App()
      failed = failed + Checks.Expect(app.MouseTracking == MouseTracking.Drag,
        "App defaults to drag mouse tracking")
      app.DefaultStyle = Style{
        Foreground: Color.Rgb("6CBC5F"),
        Background: Color.Rgb("0E1117"),
        Attributes: TextAttributes.Bold,
      }
      app.TickInterval = TimeSpan.FromMilliseconds(25.0)
      app.RequestDraw()
      failed = failed + Checks.Expect(app.DefaultStyle.Foreground == Color.Rgb("6CBC5F")
          && app.DefaultStyle.Background == Color.Rgb("0E1117"),
        "App stores its default style")
      failed = failed + Checks.Expect(app.TickInterval == TimeSpan.FromMilliseconds(25.0),
        "App stores a TimeSpan tick interval")
      failed = failed + Checks.Expect(app.IsDrawRequested,
        "App request draw coalesces a pending frame")

      let cancelSelect = Select{ Options: { "one", "two" } }
      let cancelRoot = Box{ Children: { cancelSelect } }
      cancelRoot.Draw(Screen(20, 5))
      cancelRoot.Focus(cancelSelect)
      cancelRoot.Handle(UiEvent{ Kind: UiEventKind.Key, Key: Key.Enter })
      failed = failed + Checks.Expect(app.Route(cancelRoot, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Handled
          && !cancelSelect.IsOpen,
        "App.Run Box routing lets Select handle Escape before quit")

      let handledEscape = RouteBox{ Response: EventResult.Handled }
      failed = failed + Checks.Expect(app.Route(handledEscape, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Handled
          && handledEscape.Events == 1,
        "the tree handles Escape before the default quit gesture")

      let handledInterrupt = RouteBox{ Response: EventResult.Handled }
      failed = failed + Checks.Expect(app.Route(handledInterrupt, UiEvent{
          Kind: UiEventKind.TextInput,
          Key: Key.Character,
          Text: "c",
          Modifiers: KeyModifiers.Ctrl,
        }) == EventResult.Handled && handledInterrupt.Events == 1,
        "the tree handles Ctrl+C before the default quit gesture")

      let fallback = RouteBox{ Response: EventResult.Continue }
      failed = failed + Checks.Expect(app.Route(fallback, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Exit,
        "unhandled Escape uses the default quit gesture")

      var beforeHits = 0
      app.Keys.Add(KeyGesture.Ctrl("s"), BindingPhase.BeforeWidgets,
        () -> beforeHits = beforeHits + 1)
      let blocked = RouteBox{ Response: EventResult.Continue }
      failed = failed + Checks.Expect(app.Route(blocked, typed) == EventResult.Handled
          && blocked.Events == 0 && beforeHits == 1,
        "App before-widget bindings run before the tree")

      var afterHits = 0
      app.Keys.Add(KeyGesture.Character("q"), BindingPhase.AfterWidgets,
        () -> afterHits = afterHits + 1)
      let passed = RouteBox{ Response: EventResult.Continue }
      failed = failed + Checks.Expect(app.Route(passed, UiEvent{
          Kind: UiEventKind.TextInput, Key: Key.Character, Text: "q" }) == EventResult.Handled
          && passed.Events == 1 && afterHits == 1,
        "App after-widget bindings run after an unhandled tree event")

      app.QuitGestures.Clear()
      failed = failed + Checks.Expect(app.Route(RouteBox{ Response: EventResult.Continue }, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Continue,
        "App quit gestures can be cleared")
      app.QuitGestures.Add(KeyGesture.Ctrl("q"))
      failed = failed + Checks.Expect(app.Route(RouteBox{ Response: EventResult.Continue }, UiEvent{
          Kind: UiEventKind.TextInput,
          Key: Key.Character,
          Text: "q",
          Modifiers: KeyModifiers.Ctrl,
        }) == EventResult.Exit,
        "App quit gestures can be configured")

      let phased = App()
      let released = RouteBox{ Response: EventResult.Continue }
      failed = failed + Checks.Expect(phased.Route(released, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape, Phase: KeyPhase.Release,
        }) == EventResult.Continue && released.Events == 1,
        "trees receive key releases but quit gestures ignore them")

      var hotHits = 0
      phased.Keys.Add(KeyGesture.Ctrl("s"), BindingPhase.BeforeWidgets,
        () -> hotHits = hotHits + 1)
      phased.Route(RouteBox{ Response: EventResult.Continue }, UiEvent{
        Kind: UiEventKind.Key, Key: Key.Character, Text: "s",
        Modifiers: KeyModifiers.Ctrl, Phase: KeyPhase.Release,
      })
      failed = failed + Checks.Expect(hotHits == 0,
        "App bindings never fire on a key release")

      let repeated = RouteBox{ Response: EventResult.Continue }
      phased.Route(repeated, UiEvent{
        Kind: UiEventKind.Key, Key: Key.Character, Text: "j", Phase: KeyPhase.Repeat,
      })
      failed = failed + Checks.Expect(repeated.Events == 1,
        "App routing still delivers key repeats")

      return failed
    }

  }
}
