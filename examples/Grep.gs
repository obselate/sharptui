package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Text.RegularExpressions

/// One matching line found by grep or rg.
public class Hit {
  public var Path string
  public var Line int32
  public var Text string

  public init() {
    Path = ""
    Line = 0
    Text = ""
  }
}

/// grep/rg output parsing, kept pure for the checks.
public class Hits {
  shared {
    /// Prefers a NUL-separated "path\0line:text" line (grep -Z / rg --null),
    /// which survives colons in filenames; falls back to the old
    /// first-two-colons split when no NUL is present.
    public func Parse(line string) Hit? {
      let nul = line.IndexOf(char(0))
      if nul > 0 {
        let rest = line.Substring(nul + 1)
        let sep = rest.IndexOf(":")
        if sep <= 0 { return nil }
        var num = 0
        if !Int32.TryParse(rest.Substring(0, sep), &num) { return nil }
        let hit = Hit{}
        hit.Path = line.Substring(0, nul)
        hit.Line = num
        hit.Text = rest.Substring(sep + 1)
        return hit
      }

      let first = line.IndexOf(":")
      if first <= 0 { return nil }
      let second = line.IndexOf(":", first + 1)
      if second <= first { return nil }
      var n = 0
      if !Int32.TryParse(line.Substring(first + 1, second - first - 1), &n) { return nil }
      let out = Hit{}
      out.Path = line.Substring(0, first)
      out.Line = n
      out.Text = line.Substring(second + 1)
      return out
    }

  }
}

/// Runs a command with unquoted arguments and returns its output.
func capture(exe string, args List[string]) string {
  try {
    let psi = ProcessStartInfo(exe)
    for a in args { psi.ArgumentList.Add(a) }
    psi.RedirectStandardOutput = true
    psi.RedirectStandardError = true
    psi.UseShellExecute = false
    let started = Process.Start(psi)
    guard let p = started else { return "" }
    let out = p.StandardOutput.ReadToEnd()
    p.WaitForExit()
    return out
  } catch (e Exception) {
    return ""
  }
}

/// A recursive text search with a preview. `sharptui --grep PATTERN [DIR]`.
class Hunt : View {
  private var list ListView
  private var preview ListView
  private var pane Box
  private var entry TextInput
  private var glob TextInput
  private var bar StatusBar
  private var root Box
  private var found List[Hit]
  private var where string
  private var at int32
  private var note string
  private var caseSensitive bool
  private var fixedString bool
  private var useRg bool
  private var matcher Regex?
  private var hotStyle Style
  private var plainStyle Style

  public init(pattern string, dir string) {
    found = List[Hit]()
    where = dir == "" ? "." : dir
    at = -1
    note = ""
    caseSensitive = true
    fixedString = false
    matcher = nil
    hotStyle = Style{ Foreground: Ink.Back, Background: Ink.Warm, Attributes: TextAttributes.Bold }
    plainStyle = Style()
    useRg = capture("rg", List[string]{ "--version" }) != ""

    list = ListView{ Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit },
      SelectedStyle: Style{ Foreground: Ink.Back, Background: Ink.Accent }, SelectionMarker: "" }
    preview = ListView{ Style: Style{ Foreground: Color.Rgb("8B93A3"), Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit },
      SelectedStyle: Style{ Foreground: Color.Rgb("F0F3F8"), Background: Color.Rgb("3A2F1A") }, SelectionMarker: "" }
    entry = TextInput{ GrowWeight: 1, Placeholder: "text to look for",
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit } }
    entry.Text = pattern
    glob = TextInput{ Width: CellLength.Cells(18), Placeholder: "-g glob",
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit } }
    bar = StatusBar{ Style: Style{ Foreground: Ink.Dim, Background: Color.Inherit } }

    pane = Box{ GrowWeight: 1, ShowBorder: true, Title: "preview", ShowScrollbar: true,
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit }, Children: { preview } }

    root = Column{ Children: {
      Row{ GrowWeight: 1, GapCells: 1, Children: {
        Box{ GrowWeight: 1, ShowBorder: true, Title: "matches", ShowScrollbar: true,
          Style: Style{ Foreground: Ink.Good, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit }, Children: { list } },
        pane,
      }},
      Box{ Height: CellLength.Cells(3), ShowBorder: true, Title: "pattern", Children: {
        Row{ GapCells: 1, Children: { entry, glob } },
      }},
      bar,
    }}

    if pattern != "" { hunt() }
    if pattern == "" { root.Focus(entry) } else { root.Focus(list) }
  }

  /// Typing is wherever focus is: tab can land in an input box without any
  /// shortcut, so plain keys must never fire while one holds focus.
  private func typing() bool {
    return entry.IsFocused || glob.IsFocused
  }

  /// .NET regex approximating the live pattern, for cosmetic highlighting only.
  private func buildMatcher() Regex? {
    if entry.Text == "" { return nil }
    let source = fixedString ? Regex.Escape(entry.Text) : entry.Text
    let options = caseSensitive ? RegexOptions.None : RegexOptions.IgnoreCase
    try {
      return Regex(source, options, TimeSpan.FromMilliseconds(200.0))
    } catch (e Exception) {
      return nil
    }
  }

  /// Splits text into plain/highlighted TextRuns around every matcher hit.
  private func spans(text string) List[TextRun] {
    let out = List[TextRun]()
    let re = matcher
    guard let r = re else {
      out.Add(TextRun(text, plainStyle))
      return out
    }
    var at2 = 0
    var count = 0
    try {
      for m in r.Matches(text) {
        if count >= 50 { break }
        if m.Length <= 0 { continue }
        if m.Index > at2 { out.Add(TextRun(text.Substring(at2, m.Index - at2), plainStyle)) }
        out.Add(TextRun(text.Substring(m.Index, m.Length), hotStyle))
        at2 = m.Index + m.Length
        count = count + 1
      }
    } catch (e Exception) {
      out.Clear()
    }
    if at2 < text.Length { out.Add(TextRun(text.Substring(at2), plainStyle)) }
    if out.Count == 0 { out.Add(TextRun(text, plainStyle)) }
    return out
  }

  private func hitRow(h Hit) ListItem {
    let prefix = h.Path + ":" + h.Line.ToString() + " "
    let flat = flatText(h.Text).Trim()
    let item = ListItem{}
    item.Text = prefix + flat
    let runs = List[TextRun]()
    runs.Add(TextRun(prefix, plainStyle))
    runs.AddRange(spans(flat))
    item.Runs = runs
    return item
  }

  private func previewLine(lineNo int32, flat string, highlight bool) ListItem {
    let prefix = lineNo.ToString().PadLeft(6) + "  "
    let item = ListItem{}
    item.Text = prefix + flat
    if !highlight { return item }
    let runs = List[TextRun]()
    runs.Add(TextRun(prefix, plainStyle))
    runs.AddRange(spans(flat))
    item.Runs = runs
    return item
  }

  /// Builds the search argument list, honoring toggles and the include glob.
  /// Only the prefix and the glob spelling differ per engine; the shared
  /// tail keeps a new toggle from having to be added twice.
  private func searchArgs() List[string] {
    let args = List[string]()
    if useRg {
      args.Add("--line-number")
      args.Add("--no-heading")
      args.Add("--null")
      args.Add("--color=never")
      if glob.Text != "" {
        args.Add("-g")
        args.Add(glob.Text)
      }
    } else {
      args.Add("-rnIsZ")
      args.Add("--exclude-dir=.git")
      if glob.Text != "" { args.Add("--include=" + glob.Text) }
    }
    if !caseSensitive { args.Add("-i") }
    if fixedString { args.Add("-F") }
    args.Add("--")
    args.Add(entry.Text)
    args.Add(where)
    return args
  }

  private func hunt() {
    found = List[Hit]()
    list.Items.Clear()
    list.SelectedIndex = 0
    list.FirstVisibleItemIndex = 0
    at = -1
    note = ""
    matcher = buildMatcher()

    let output = capture(useRg ? "rg" : "grep", searchArgs())
    for line in output.Split("\n") {
      if line == "" { continue }
      let parsed = Hits.Parse(line)
      guard let h = parsed else { continue }
      found.Add(h)
      list.Items.Add(hitRow(h))
      if found.Count >= 2000 {
        note = "first 2000 matches"
        break
      }
    }
    if found.Count == 0 { note = "nothing matched" }
  }

  /// Reads only a window of lines around the hit so huge files stay fast.
  private func show() {
    if list.SelectedIndex == at { return }
    at = list.SelectedIndex
    preview.Items.Clear()
    preview.SelectedIndex = 0
    if at < 0 || at >= found.Count {
      pane.Title = "preview"
      return
    }
    let h = found[at]
    pane.Title = h.Path
    var start = h.Line - 200
    if start < 1 { start = 1 }
    let stop = h.Line + 200
    var i = 1
    try {
      for line in File.ReadLines(h.Path) {
        if i > stop { break }
        if i >= start { preview.Items.Add(previewLine(i, flatText(line), i == h.Line)) }
        i = i + 1
      }
    } catch (e Exception) {
      preview.Add(e.Message)
      return
    }
    let within = h.Line - start
    preview.SelectedIndex = within
    var top = within - preview.ContentBounds.HeightRows / 3
    if top < 0 { top = 0 }
    preview.FirstVisibleItemIndex = top
  }

  public func Draw(screen Screen) {
    show()
    let engine = useRg ? "rg" : "grep"
    let caseLabel = caseSensitive ? "case" : "nocase"
    let modeLabel = fixedString ? "fixed" : "regex"
    let globLabel = glob.Text == "" ? "" : " glob:" + glob.Text
    let count = note != "" ? note : found.Count.ToString() + " matches"
    bar.LeftText = count + " in " + where + " [" + engine + " " + caseLabel + " " + modeLabel + globLabel + "]"
    bar.RightText = typing() ? "enter searches - esc leaves the box"
      : "/ pattern - g glob - c case - x fixed/regex - tab swaps panes - q quits"
    screen.Clear()
    root.Draw(screen)
  }

  public func Handle(ev UiEvent) EventResult {
    // A key acts on press; Kitty terminals also report releases.
    if ev.Phase == KeyPhase.Release { return root.Handle(ev) }
    if typing() {
      if ev.Key == Key.Enter {
        hunt()
        root.Focus(list)
        return EventResult.Handled
      }
      if ev.Key == Key.Escape {
        root.Focus(list)
        return EventResult.Handled
      }
      root.Handle(ev)
      return EventResult.Continue
    }

    if ev.Key == Key.Character {
      if ev.Text == "q" { return EventResult.Exit }
      if ev.Text == "/" {
        entry.Text = ""
        root.Focus(entry)
        return EventResult.Handled
      }
      if ev.Text == "g" {
        root.Focus(glob)
        return EventResult.Handled
      }
      if ev.Text == "c" {
        caseSensitive = !caseSensitive
        hunt()
        return EventResult.Handled
      }
      if ev.Text == "x" {
        fixedString = !fixedString
        hunt()
        return EventResult.Handled
      }
    }
    root.Handle(ev)
    return EventResult.Continue
  }
}
