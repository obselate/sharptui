package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.Diagnostics

/// The palette every example draws from, so a reskin is one edit.
public class Ink {
  shared {
    public let Text Color = Color.Rgb("C8CEDA")
    public let Accent Color = Color.Rgb("478AD1")
    public let Dim Color = Color.Rgb("555C6B")
    public let Good Color = Color.Rgb("6CBC5F")
    public let Warm Color = Color.Rgb("D1A047")
    public let Bad Color = Color.Rgb("D1475F")
    public let Back Color = Color.Rgb("0E1117")
  }
}

/// The wordmark rows shared by the picker header and the banner view.
func sharpLogo() List[string] {
  return List[string]{
    "┌─┐┬ ┬┌─┐┬─┐┌─┐┌┬┐┬ ┬┬",
    "└─┐├─┤├─┤├┬┘├─┘ │ │ ││",
    "└─┘┴ ┴┴ ┴┴└─┴   ┴ └─┘┴",
  }
}

/// The dimmed status bar style shared by every app's footer.
func dimStatusBar() StatusBar {
  return StatusBar{ Style: Style{ Foreground: Ink.Dim, Background: Color.Inherit } }
}

/// The markdown look shared by every preview in the set.
func previewTheme() MarkdownTheme {
  let theme = MarkdownTheme{}
  theme.Body = Style{ Foreground: Ink.Text, Background: Color.Inherit }
  theme.Heading = Style{ Foreground: Ink.Accent, Background: Color.Inherit }
  theme.Code = Style{ Foreground: Ink.Good, Background: Color.Inherit }
  theme.Quote = Style{ Foreground: Color.Rgb("8A93A6"), Background: Color.Inherit, Attributes: TextAttributes.Italic }
  theme.Link = Style{ Foreground: Ink.Warm, Background: Color.Inherit }
  theme.Marker = Style{ Foreground: Ink.Good, Background: Color.Inherit }
  return theme
}

/// Tabs slide a paint past a border, so foreign text is flattened first.
func flatText(text string) string {
  return text.Replace(char(9).ToString(), "    ").TrimEnd()
}

/// One subprocess run to completion: whether the process started, its exit
/// code, and both output streams drained in full. Crashed is set only when
/// launching or waiting on the process itself threw; Error then carries the
/// exception message instead of captured stderr.
class ProcRun {
  public var Started bool
  public var Crashed bool
  public var ExitCode int32
  public var Output string
  public var Error string

  public init() {
    Started = false
    Crashed = false
    ExitCode = -1
    Output = ""
    Error = ""
  }
}

/// Spawns exe with args, optionally in dir ("" for the caller's own working
/// directory) and with environment overrides ("KEY=VALUE" entries), then
/// drains stdout and stderr and waits for exit. Never throws.
func procRun(exe string, args List[string], dir string, env List[string]) ProcRun {
  let r = ProcRun{}
  try {
    let psi = ProcessStartInfo(exe)
    if dir != "" { psi.WorkingDirectory = dir }
    for pair in env {
      let at = pair.IndexOf("=")
      psi.Environment[pair.Substring(0, at)] = pair.Substring(at + 1)
    }
    for a in args { psi.ArgumentList.Add(a) }
    psi.RedirectStandardOutput = true
    psi.RedirectStandardError = true
    psi.UseShellExecute = false
    let started = Process.Start(psi)
    guard let p = started else { return r }
    r.Output = p.StandardOutput.ReadToEnd()
    r.Error = p.StandardError.ReadToEnd()
    p.WaitForExit()
    r.Started = true
    r.ExitCode = p.ExitCode
  } catch (e Exception) {
    r.Crashed = true
    r.Error = e.Message
  }
  return r
}

open class LogoLayer : Box {
  private var paint Action[Screen]

  public init(paint Action[Screen]) {
    this.paint = paint
    Placement = Placement.At(CellPoint{})
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    paint(screen)
  }
}

/// The launcher menu shown when no flag picks an app directly.
open class Pick : Column {
  private var list ListView
  private var bar StatusBar
  private var logo List[string]
  private var host App
  private var t float64
  private var mode int32

  public prop Choice int32 { get; set; }

  public init(host App, sweep bool) {
    this.host = host
    Choice = -1
    mode = 0
    t = 0.0
    logo = sharpLogo()
    list = ListView{ GrowWeight: 1, Style: Style{ Foreground: Ink.Text, Background: Color.Inherit },
      SelectedStyle: Style{ Foreground: Ink.Back, Background: Ink.Accent } }
    list.Add("git     beginner-friendly git workbench & diff visualizer")
    list.Add("grep    search a tree with match highlighting")
    list.Add("todo    harvest source markers by tag")
    list.Add("watch   rerun a command and diff its output")
    list.Add("edit    markdown editor with live preview")
    list.Add("julia   the whole framework in 80 lines")
    list.Add("canvas  retained packed subcell drawing showcase")
    list.Add("motion  composed animation and easing gallery")
    bar = dimStatusBar()
    bar.LeftText = "tuitool"
    bar.RightText = "enter launches - q quits"

    let ink = Style{ Foreground: Ink.Accent, Background: Color.Inherit }
    let dim = Style{ Foreground: Ink.Dim, Background: Color.Inherit }
    Children.Add(Label{ Text: "", Height: CellLength.Cells(1) })
    Children.Add(Label{ Text: logo[0], Alignment: HorizontalAlignment.Center, Style: ink })
    Children.Add(Label{ Text: logo[1], Alignment: HorizontalAlignment.Center, Style: ink })
    Children.Add(Label{ Text: logo[2], Alignment: HorizontalAlignment.Center, Style: ink })
    Children.Add(Label{ Text: "a retained-tree TUI for G#", Alignment: HorizontalAlignment.Center, Style: dim })
    Children.Add(Label{ Text: "", Height: CellLength.Cells(1) })
    Children.Add(Box{ GrowWeight: 1, ShowBorder: true, ShowScrollbar: true, Title: "pick an app",
      Style: Style{ Foreground: Ink.Accent, Background: Color.Inherit }, Children: { list } })
    Children.Add(bar)
    Children.Add(LogoLayer((screen Screen) -> paintLogo(screen)))
    Focus(list)
    if !sweep { rest() }
  }

  /// Back to the settled logo, dozing until the next shine is due.
  private func rest() {
    mode = 1
    host.TickInterval = TimeSpan.FromMilliseconds(3400.0)
  }

  private func paintLogo(screen Screen) {
    if mode == 0 { intro(screen) }
    if mode == 2 { shine(screen) }
  }

  /// A fast lightning streak through the settled logo, with a trailing echo.
  private func shine(screen Screen) {
    let w = screen.Size.WidthCells
    let pos = (t - 0.3) * 34.0
    for row in 0 ... 3 {
      let line = logo[row]
      for i in 0 ... line.Length {
        let d = pos - float64(i) - 1.2 * float64(row)
        let hot = Math.Exp(-d * d * 0.09) + 0.5 * Math.Exp(-(d - 5.0) * (d - 5.0) * 0.05)
        screen.WriteCell((w - line.Length) / 2 + i, row + 1, line[i].ToString(),
          Style{ Foreground: Color.Rgb(glow(71.0, 71.0, 0.0, hot), glow(138.0, 138.0, 0.0, hot), glow(209.0, 209.0, 0.0, hot)), Background: Ink.Back })
      }
    }
  }

  /// Repaints the header over the static labels while the light sweep is live.
  private func intro(screen Screen) {
    let w = screen.Size.WidthCells
    let pos = (t - 0.45) * 16.0
    for row in 0 ... 3 {
      let line = logo[row]
      for i in 0 ... line.Length {
        let d = pos - float64(i) - 0.8 * float64(row)
        let lit = Math.Min(Math.Max(d * 0.7, 0.0), 1.0)
        let hot = Math.Exp(-d * d * 0.1)
        screen.WriteCell((w - line.Length) / 2 + i, row + 1, line[i].ToString(),
          Style{ Foreground: Color.Rgb(glow(14.0, 71.0, lit, hot), glow(17.0, 138.0, lit, hot), glow(23.0, 209.0, lit, hot)), Background: Ink.Back })
      }
    }
    let sub = "a retained-tree TUI for G#"
    let sa = Math.Min(Math.Max((t - 1.1) * 1.4, 0.0), 1.0)
    for i in 0 ... sub.Length {
      screen.WriteCell((w - sub.Length) / 2 + i, 4, sub[i].ToString(),
        Style{ Foreground: Color.Rgb(glow(14.0, 85.0, sa, 0.0), glow(17.0, 92.0, sa, 0.0), glow(23.0, 107.0, sa, 0.0)), Background: Ink.Back })
    }
  }

  /// One channel of the sweep: base colour lifted toward full, plus the hot flash.
  private func glow(base float64, full float64, lit float64, hot float64) int32 {
    return int32(Math.Min(base + lit * (full - base) + hot * 230.0, 255.0))
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Kind == UiEventKind.Tick {
      if mode == 1 {
        mode = 2
        t = 0.0
        host.TickInterval = TimeSpan.FromMilliseconds(33.0)
      } else {
        t = t + 0.033
        if mode == 0 && t >= 2.4 { rest() }
        if mode == 2 && t >= 1.45 { rest() }
      }
      return EventResult.Handled
    }
    // A key acts on press; Kitty terminals also report releases.
    if ev.Phase == KeyPhase.Release { return EventResult.Continue }
    if ev.Key == Key.Enter {
      Choice = list.SelectedIndex
      return EventResult.Exit
    }
    if ev.Key == Key.Character && ev.Text == "q" { return EventResult.Exit }
    return EventResult.Continue
  }
}

/// The showcase applications. A flag starts one directly; no flag opens the picker.
func Main(args []string) int32 {
  var i = 0
  while i < args.Length {
    let arg = args[i]
    let next = i + 1 < args.Length ? args[i + 1] : ""
    i = i + 1

    if arg == "--grep" { return run(Hunt(next, i + 1 < args.Length ? args[i + 1] : "")) }
    if arg == "--todo" { return run(Chores(next == "" ? "." : next, choreTagList(i + 1 < args.Length ? args[i + 1] : ""))) }
    if arg == "--watch" { return run(Watcher(next)) }
    if arg == "--edit" { return run(Edit(next)) }
    if arg == "--julia" { return golf() }
    if arg == "--canvas" { return canvas() }
    if arg == "--animation" { return animationGallery() }
    if arg == "--git" { return run(Git(next == "" ? "." : next)) }
    if arg == "--banner" { return banner() }
    if arg.EndsWith(".md") { return run(Edit(arg)) }
  }

  var first = true
  while true {
    let picker = pick(first)
    first = false
    if picker.Choice == 0 { run(Git(".")) }
    else if picker.Choice == 1 { run(Hunt("", "")) }
    else if picker.Choice == 2 { run(Chores(".", choreDefaultTags())) }
    else if picker.Choice == 3 { run(Watcher("")) }
    else if picker.Choice == 4 { run(Edit("sharptui-demo.md")) }
    else if picker.Choice == 5 { golf() }
    else if picker.Choice == 6 { canvas() }
    else if picker.Choice == 7 { animationGallery() }
    else { break }
  }
  return 0
}

/// Runs the picker. Only the session's first one plays the full logo reveal;
/// after that the logo just shines every few seconds, and the picker dials its
/// own tick rate down between shines so idling costs one wakeup per ~3.4s.
func pick(sweep bool) Pick {
  let app = App()
  app.DefaultStyle = Style{ Foreground: Ink.Text, Background: Ink.Back }
  app.TickInterval = TimeSpan.FromMilliseconds(33.0)
  let picker = Pick(app, sweep)
  app.Run(picker)
  return picker
}

/// Hidden recording aid: the full-screen wordmark behind the README banner.
func banner() int32 {
  let app = App()
  app.DefaultStyle = Style{ Foreground: Ink.Text, Background: Ink.Back }
  app.TickInterval = TimeSpan.FromMilliseconds(33.0)
  app.Run(Banner(app))
  return 0
}

/// Julia animates continuously, so it runs the fastest tick.
func golf() int32 {
  let app = App()
  app.TickInterval = TimeSpan.FromMilliseconds(16.0)
  app.Run(Julia())
  return 0
}

func run(view Box) int32 {
  let app = App()
  app.DefaultStyle = Style{
    Foreground: Ink.Text,
    Background: Ink.Back,
  }
  app.Run(view)
  return 0
}
