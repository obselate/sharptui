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

internal class RouteView : View {
  internal prop Events int32 { get; set; }
  internal prop Response EventResult { get; set; }

  public func Draw(screen Screen) {
  }

  public func Handle(ev UiEvent) EventResult {
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
      let save = typedBinds.Add(KeyGesture.Ctrl("s"), BindingPhase.BeforeWidgets)
      let quit = typedBinds.Add(KeyGesture.Character("q"), BindingPhase.AfterWidgets)
      failed = failed + Checks.Expect(typedBinds.Offer(typed, BindingPhase.BeforeWidgets),
        "before-widgets typed binding takes its event")
      failed = failed + Checks.Expect(save.IsPending && save.Consume(),
        "binding reports and consumes a pending hit")
      failed = failed + Checks.Expect(!save.IsPending && !save.Consume(),
        "consumed binding is clear")
      failed = failed + Checks.Expect(!typedBinds.Offer(UiEvent{
          Kind: UiEventKind.TextInput, Key: Key.Character, Text: "q" }, BindingPhase.BeforeWidgets),
        "after-widgets binding is absent before widgets")
      failed = failed + Checks.Expect(typedBinds.Offer(UiEvent{
          Kind: UiEventKind.TextInput, Key: Key.Character, Text: "q" }, BindingPhase.AfterWidgets),
        "after-widgets binding takes its event")
      failed = failed + Checks.Expect(quit.Consume(), "after-widgets binding consumes")

      let command = Command("save", "Save", KeyGesture.Ctrl("s"))
      let commandMap = Keymap()
      commandMap.Add(command, BindingPhase.BeforeWidgets)
      failed = failed + Checks.Expect(commandMap.Offer(typed, BindingPhase.BeforeWidgets)
          && command.Consume()
          && !commandMap.Bindings[0].IsPending
          && !commandMap.Bindings[0].Consume(),
        "command registration produces only the command activation signal")

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
      failed = failed + Checks.Expect(app.Route(Shell(cancelRoot), UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Handled
          && !cancelSelect.IsOpen,
        "App.Run Box routing lets Select handle Escape before quit")

      let handledEscape = RouteView{ Response: EventResult.Handled }
      failed = failed + Checks.Expect(app.Route(handledEscape, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Handled
          && handledEscape.Events == 1,
        "a View handles Escape before the default quit gesture")

      let handledInterrupt = RouteView{ Response: EventResult.Handled }
      failed = failed + Checks.Expect(app.Route(handledInterrupt, UiEvent{
          Kind: UiEventKind.TextInput,
          Key: Key.Character,
          Text: "c",
          Modifiers: KeyModifiers.Ctrl,
        }) == EventResult.Handled && handledInterrupt.Events == 1,
        "a View handles Ctrl+C before the default quit gesture")

      let fallback = RouteView{ Response: EventResult.Continue }
      failed = failed + Checks.Expect(app.Route(fallback, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Exit,
        "unhandled Escape uses the default quit gesture")

      let before = app.Keys.Add(KeyGesture.Ctrl("s"), BindingPhase.BeforeWidgets)
      let blocked = RouteView{ Response: EventResult.Continue }
      failed = failed + Checks.Expect(app.Route(blocked, typed) == EventResult.Handled
          && blocked.Events == 0 && before.Consume(),
        "App before-widget bindings run before the View")

      let after = app.Keys.Add(KeyGesture.Character("q"), BindingPhase.AfterWidgets)
      let passed = RouteView{ Response: EventResult.Continue }
      failed = failed + Checks.Expect(app.Route(passed, UiEvent{
          Kind: UiEventKind.TextInput, Key: Key.Character, Text: "q" }) == EventResult.Handled
          && passed.Events == 1 && after.Consume(),
        "App after-widget bindings run after an unhandled View event")

      app.QuitGestures.Clear()
      failed = failed + Checks.Expect(app.Route(RouteView{ Response: EventResult.Continue }, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape }) == EventResult.Continue,
        "App quit gestures can be cleared")
      app.QuitGestures.Add(KeyGesture.Ctrl("q"))
      failed = failed + Checks.Expect(app.Route(RouteView{ Response: EventResult.Continue }, UiEvent{
          Kind: UiEventKind.TextInput,
          Key: Key.Character,
          Text: "q",
          Modifiers: KeyModifiers.Ctrl,
        }) == EventResult.Exit,
        "App quit gestures can be configured")

      let phased = App()
      let released = RouteView{ Response: EventResult.Continue }
      failed = failed + Checks.Expect(phased.Route(released, UiEvent{
          Kind: UiEventKind.Key, Key: Key.Escape, Phase: KeyPhase.Release,
        }) == EventResult.Continue && released.Events == 1,
        "Views receive key releases but quit gestures ignore them")

      let hot = phased.Keys.Add(KeyGesture.Ctrl("s"), BindingPhase.BeforeWidgets)
      phased.Route(RouteView{ Response: EventResult.Continue }, UiEvent{
        Kind: UiEventKind.Key, Key: Key.Character, Text: "s",
        Modifiers: KeyModifiers.Ctrl, Phase: KeyPhase.Release,
      })
      failed = failed + Checks.Expect(!hot.IsPending,
        "App bindings never fire on a key release")

      let repeated = RouteView{ Response: EventResult.Continue }
      phased.Route(repeated, UiEvent{
        Kind: UiEventKind.Key, Key: Key.Character, Text: "j", Phase: KeyPhase.Repeat,
      })
      failed = failed + Checks.Expect(repeated.Events == 1,
        "App routing still delivers key repeats")

      return failed
    }

  }
}
