package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.Diagnostics

/// Fresh lines paint green, except lines that themselves read as diff headers.
func freshInk(line string) Style {
  if line.StartsWith("++") { return Style{ Foreground: Ink.Dim, Background: Color.Inherit } }
  return Style{ Foreground: Ink.Good, Background: Color.Inherit }
}

/// A command run again on demand — nothing reruns by itself; each press of
/// space runs it once more and highlights what changed since the previous
/// run. Runs via `sh -c`, so quoting behaves like a shell would.
/// `sharptui --watch "COMMAND ARGS"`.
class Watcher : View {
  private var pane ListView
  private var entry TextInput
  private var bar StatusBar
  private var root Box
  private var frame Box
  private var command string
  private var history List[WatchRun]
  private var viewIndex int32
  private var shownMoved int32
  private var shownHasPrev bool

  public init(command string) {
    this.command = command.Trim()
    history = List[WatchRun]()
    viewIndex = -1
    shownMoved = 0
    shownHasPrev = false

    pane = ListView{ GrowWeight: 1, SelectionMarker: "" }
    entry = TextInput{ GrowWeight: 1, Placeholder: "a command, run through sh -c",
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit } }
    entry.Text = this.command
    bar = dimStatusBar()
    frame = Box{ GrowWeight: 1, ShowBorder: true, ShowScrollbar: true,
      Title: this.command == "" ? "no command yet" : this.command,
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit }, Children: { pane } }

    root = Column{ Children: {
      frame,
      Box{ Height: CellLength.Cells(3), ShowBorder: true, Title: "command", Children: { entry } },
      bar,
    }}
    if this.command == "" { root.Focus(entry) } else { root.Focus(pane) }
    if this.command != "" { again() } else { showEmpty() }
  }

  private func showEmpty() {
    let plain = Style{ Foreground: Ink.Text, Background: Color.Inherit }
    let good = Style{ Foreground: Ink.Good, Background: Color.Inherit }
    let items = List[ListItem]()
    items.Add(ListItem{ Text: "type a command below and press enter to run it once.", Style: plain })
    items.Add(ListItem{ Text: "nothing reruns by itself: each press of space runs it once more", Style: plain })
    items.Add(ListItem{ Text: "and highlights the lines that changed since the previous run.", Style: plain })
    items.Add(ListItem{ Text: "", Style: plain })
    items.Add(ListItem{ Text: "commands that print a snapshot of something that changes work best:", Style: plain })
    items.Add(ListItem{ Text: "  git status --short", Style: good })
    items.Add(ListItem{ Text: "  df -h", Style: good })
    items.Add(ListItem{ Text: "  free -h", Style: good })
    items.Add(ListItem{ Text: "  ls -lt", Style: good })
    items.Add(ListItem{ Text: "  ss -tlnp", Style: good })
    items.Add(ListItem{ Text: "  systemctl --failed", Style: good })
    pane.Items = items
  }

  /// Takes the typed command, starts history over, and runs it once.
  private func adopt() {
    let next = entry.Text.Trim()
    root.Focus(pane)
    if next == "" || next == command { return }
    command = next
    frame.Title = command
    history.Clear()
    viewIndex = -1
    again()
  }

  /// Runs the command fresh, appends it to history, and shows it. The pane's
  /// scroll offset is left untouched so a rerun does not snap back to the top.
  private func again() {
    if command == "" { return }
    let run = watchExec(command)
    history.Add(run)
    while history.Count > 20 { history.RemoveAt(0) }
    viewIndex = history.Count - 1
    render()
  }

  /// Moves the shown run by one step through history; the diff target
  /// (the run just before it) moves along with it.
  private func page(delta int32) {
    if history.Count == 0 { return }
    let next = viewIndex + delta
    if next < 0 || next >= history.Count { return }
    viewIndex = next
    render()
  }

  /// Rebuilds the pane's items for the shown run against its predecessor.
  /// Only called on a rerun or a page, never from Draw.
  private func render() {
    if viewIndex < 0 || viewIndex >= history.Count { return }
    let now = history[viewIndex].Lines
    let hasPrev = viewIndex > 0
    let before = hasPrev ? history[viewIndex - 1].Lines : List[string]()
    let fresh = hasPrev ? watchFresh(before, now) : List[bool]()

    let items = List[ListItem]()
    for i in 0 ... now.Count {
      let mark = hasPrev && fresh[i]
      if mark {
        items.Add(ListItem{ Text: now[i], Style: freshInk(now[i]) })
      } else {
        items.Add(ListItem{ Text: now[i], Style: Style{ Foreground: Ink.Dim, Background: Color.Inherit } })
      }
    }
    if now.Count == 0 {
      items.Add(ListItem{ Text: "it printed nothing", Style: Style{ Foreground: Ink.Dim, Background: Color.Inherit } })
    }
    pane.Items = items
    shownHasPrev = hasPrev
    shownMoved = hasPrev ? watchCount(fresh) : 0
  }

  public func Draw(screen Screen) {
    if history.Count == 0 {
      bar.LeftText = command == "" ? "no command yet" : "not run yet - space runs it"
    } else {
      let run = history[viewIndex]
      let compared = !shownHasPrev ? "nothing to compare it with yet" : (shownMoved == 0 ? "nothing moved" : watchMany(shownMoved, "line") + " moved")
      let position = "run " + (viewIndex + 1).ToString() + " of " + history.Count.ToString()
      let outcome = "exit " + run.ExitCode.ToString() + ", " + run.DurationMs.ToString() + " ms"
      let summary = position + ", " + run.Stamp + ", " + outcome + ", " + watchMany(run.Lines.Count, "line") + ", " + compared
      bar.LeftText = summary
    }
    bar.RightText = entry.IsFocused ? "enter runs it - esc leaves the box"
      : "space runs it again - c changes it - [ ] browse history - q quits"
    screen.Clear()
    root.Draw(screen)
  }

  public func Handle(ev UiEvent) EventResult {
    // A key acts on press; Kitty terminals also report releases.
    if ev.Phase == KeyPhase.Release { return root.Handle(ev) }

    // Typing is wherever focus is: tab can land in the command box without
    // any shortcut, so plain keys must never fire while it holds focus.
    if entry.IsFocused {
      if ev.Key == Key.Enter {
        adopt()
        return EventResult.Handled
      }
      if ev.Key == Key.Escape {
        root.Focus(pane)
        return EventResult.Handled
      }
      root.Handle(ev)
      return EventResult.Continue
    }

    if ev.Key == Key.Character {
      if ev.Text == "q" { return EventResult.Exit }
      if ev.Text == "c" {
        entry.Text = command
        root.Focus(entry)
        return EventResult.Handled
      }
      if ev.Text == " " || ev.Text == "r" {
        again()
        return EventResult.Handled
      }
      if ev.Text == "[" {
        page(-1)
        return EventResult.Handled
      }
      if ev.Text == "]" {
        page(1)
        return EventResult.Handled
      }
    }
    root.Handle(ev)
    return EventResult.Continue
  }
}

/// One completed run: its output, when it ran, how it exited, how long it took.
struct WatchRun {
  var Lines List[string]
  var ExitCode int32
  var DurationMs int64
  var Stamp string
}

/// Runs a command through the shell so quoted arguments behave as they would
/// on a command line, and times and captures its exit code.
func watchExec(command string) WatchRun {
  var run = WatchRun{}
  run.Stamp = DateTime.Now.ToString("HH:mm:ss")
  let started = Environment.TickCount64
  let core = procRun("sh", List[string]{ "-c", command }, "", List[string]())
  if core.Crashed || !core.Started {
    run.Lines = List[string]()
    run.ExitCode = -1
  } else {
    run.Lines = watchLines(core.Output)
    run.ExitCode = core.ExitCode
  }
  run.DurationMs = Environment.TickCount64 - started
  return run
}

/// Output as lines, with tabs flattened so nothing paints past the border.
func watchLines(text string) List[string] {
  let out = List[string]()
  for raw in text.Split(char(10)) {
    out.Add(flatText(raw))
  }
  while out.Count > 0 && out[out.Count - 1] == "" {
    out.RemoveAt(out.Count - 1)
  }
  return out
}

/// Which lines read differently from the previous run. A line the command has
/// not printed before is new, so a longer output is all new at the end.
func watchFresh(before List[string], now List[string]) List[bool] {
  let out = List[bool]()
  for i in 0 ... now.Count {
    out.Add(i >= before.Count || before[i] != now[i])
  }
  return out
}

func watchMany(count int32, noun string) string {
  return count.ToString() + " " + noun + (count == 1 ? "" : "s")
}

func watchCount(flags List[bool]) int32 {
  var count = 0
  for on in flags {
    if on { count = count + 1 }
  }
  return count
}
