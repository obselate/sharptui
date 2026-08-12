package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO

/// One marker left in the source.
public class Chore {
  public var Tag string
  public var Who string
  public var Body string
  public var File string
  public var Line int32

  public init() {
    Tag = ""
    Who = ""
    Body = ""
    File = ""
    Line = 0
  }
}

/// The marker words looked for when none are named on the command line.
func choreDefaultTags() List[string] {
  return List[string]{ "TODO", "FIXME", "HACK", "XXX", "BUG", "NOTE" }
}

/// "todo,wip" as marker words, uppercased; the default set when empty.
func choreTagList(spec string) List[string] {
  let out = List[string]()
  for part in spec.Split(',') {
    let word = part.Trim().ToUpperInvariant()
    if word != "" { out.Add(word) }
  }
  return out.Count == 0 ? choreDefaultTags() : out
}

/// The tag and its message, or nil, against whichever marker words are in
/// play. A tag counts only as a whole word, so "todos" and "mastodon" are
/// not markers, and the message drops a leading colon, dash or bracketed
/// owner. "TODO(demo): ..." or "TODO(demo) ..." keeps the name separately
/// on Who.
func choreParse(line string, tags List[string]) Chore? {
  for tag in tags {
    let at = choreWord(line, tag)
    if at < 0 { continue }
    let out = Chore{}
    out.Tag = tag
    let rest = line.Substring(at + tag.Length)
    out.Who = choreWho(rest)
    out.Body = choreBody(rest)
    return out
  }
  return nil
}

/// Where the tag sits as its own word, or -1.
func choreWord(line string, tag string) int32 {
  var from = 0
  while from <= line.Length - tag.Length {
    let at = line.IndexOf(tag, from)
    if at < 0 { return -1 }
    let before = at == 0 ? char(32) : line[at - 1]
    let after = at + tag.Length >= line.Length ? char(32) : line[at + tag.Length]
    if !choreLetter(before) && !choreLetter(after) { return at }
    from = at + 1
  }
  return -1
}

func choreLetter(c char) bool {
  if c >= char(48) && c <= char(57) { return true }
  if c >= char(65) && c <= char(90) { return true }
  if c >= char(97) && c <= char(122) { return true }
  return c == char(95)
}

/// File-extension recognition, trimmed from the loc example's Tongue so
/// binaries and vendored trees are never opened.
class Tongue {
  shared {
    /// The name a file's extension gives it, or "" for anything not counted.
    public func Of(path string) string {
      let dot = path.LastIndexOf(".")
      let slash = path.LastIndexOf("/")
      let leaf = slash >= 0 ? path.Substring(slash + 1) : path
      if leaf == "Makefile" || leaf == "makefile" { return "make" }
      if dot <= slash || dot < 0 { return "" }
      let ext = path.Substring(dot + 1).ToLowerInvariant()
      if ext == "gs" || ext == "cs" || ext == "c" || ext == "h" || ext == "cc" || ext == "cpp"
        || ext == "rs" || ext == "go" || ext == "py" || ext == "rb" || ext == "js" || ext == "ts"
        || ext == "java" || ext == "kt" || ext == "swift" || ext == "sh" || ext == "lua"
        || ext == "sql" || ext == "html" || ext == "css" || ext == "md" || ext == "json"
        || ext == "yml" || ext == "yaml" || ext == "toml" || ext == "xml" { return ext }
      return ""
    }

    /// Directories that hold other people's code or build output.
    public func Skip(name string) bool {
      if name == ".git" || name == ".svn" || name == ".hg" { return true }
      if name == "node_modules" || name == "vendor" || name == "target" { return true }
      if name == "bin" || name == "obj" || name == "dist" || name == "build" { return true }
      return false
    }
  }
}

/// "(demo): wire this up" becomes "wire this up".
func choreBody(rest string) string {
  var text = rest.Trim()
  if text.StartsWith("(") {
    let close = text.IndexOf(")")
    if close >= 0 { text = text.Substring(close + 1).Trim() }
  }
  while text.StartsWith(":") || text.StartsWith("-") {
    text = text.Substring(1).Trim()
  }
  return flatText(text)
}

/// "(demo): wire this up" or "(demo) wire this up" yields "demo".
func choreWho(rest string) string {
  let text = rest.TrimStart()
  if !text.StartsWith("(") { return "" }
  let close = text.IndexOf(")")
  if close <= 1 { return "" }
  return text.Substring(1, close - 1)
}

/// Leading run of spaces/tabs.
func choreIndent(line string) string {
  var i = 0
  while i < line.Length && (line[i] == char(32) || line[i] == char(9)) { i = i + 1 }
  return line.Substring(0, i)
}

/// A continuation line: same indent as the marker, comment-shaped, and not
/// itself a fresh marker.
func choreContinuation(line string, indent string, tags List[string]) string? {
  if !line.StartsWith(indent) { return nil }
  let rest = line.Substring(indent.Length)
  if rest.Length == 0 { return nil }
  if rest[0] == char(32) || rest[0] == char(9) { return nil }
  if choreParse(rest, tags) != nil { return nil }
  var text = ""
  if rest.StartsWith("//") { text = rest.Substring(2) }
  else if rest.StartsWith("--") { text = rest.Substring(2) }
  else if rest.StartsWith("#") { text = rest.Substring(1) }
  else if rest.StartsWith("*") { text = rest.Substring(1) }
  else if rest.StartsWith(";") { text = rest.Substring(1) }
  else { return nil }
  text = text.Trim()
  if text == "" { return nil }
  return flatText(text)
}

/// A marker harvest. `sharptui --todo [DIR] [TAG,TAG,...]` — the second
/// argument swaps the marker words, e.g. `--todo . TODO,WIP,PERF`.
class Chores : View {
  private var list ListView
  private var preview ListView
  private var tabs Tabs
  private var filter TextInput
  private var bar StatusBar
  private var root Box
  private var pane Box
  private var dir string
  private var all List[Chore]
  private var shown List[Chore]
  private var tabTags List[string]
  private var tags List[string]
  private var tagEdit bool
  private var savedFilter string
  private var filterBox Box
  private var scanned int32

  public init(where string, marks List[string]) {
    dir = where
    tags = marks
    all = List[Chore]()
    shown = List[Chore]()
    tabTags = List[string]()
    tagEdit = false
    savedFilter = ""
    scanned = 0

    list = ListView{ Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit },
      SelectedStyle: Style{ Foreground: Ink.Back, Background: Ink.Accent }, SelectionMarker: "" }
    preview = ListView{ GrowWeight: 1, SelectionMarker: "", Style: Style{ Foreground: Ink.Warm, Background: Color.Inherit },
      SelectedStyle: Style{ Foreground: Ink.Back, Background: Ink.Warm } }
    tabs = Tabs{ Height: CellLength.Cells(1), Style: Style{ Foreground: Ink.Dim, Background: Color.Inherit },
      SelectedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit } }
    filter = TextInput{ GrowWeight: 1, Placeholder: "a tag or any word in the marker",
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit } }
    bar = dimStatusBar()

    pane = Box{ GrowWeight: 1, ShowBorder: true, Title: "source", ShowScrollbar: true,
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, Children: { preview } }

    filterBox = Box{ Height: CellLength.Cells(3), ShowBorder: true, Title: "filter", Children: { filter } }

    root = Column{ Children: {
      tabs,
      Box{ GrowWeight: 2, ShowBorder: true, ShowScrollbar: true, Title: "tag    where",
        Style: Style{ Foreground: Ink.Good, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit }, Children: { list } },
      pane,
      filterBox,
      bar,
    }}
    root.Focus(list)
    reload()
  }

  private func reload() {
    all = List[Chore]()
    let tracked = choreTracked(dir)
    if tracked.Count > 0 {
      var read = 0
      for file in tracked {
        if choreScanOne(file, all, tags) { read = read + 1 }
      }
      scanned = read
    } else {
      scanned = choreWalk(dir, all, 0, tags)
    }
    rebuildTabs()
    apply()
  }

  /// "all (N)" plus one tab per discovered tag, each carrying its count.
  private func rebuildTabs() {
    let counts = Dictionary[string, int32]()
    for c in all {
      var n = 0
      if counts.ContainsKey(c.Tag) { n = counts[c.Tag] }
      counts[c.Tag] = n + 1
    }
    let titles = List[string]()
    let seen = List[string]()
    titles.Add("all (" + all.Count.ToString() + ")")
    seen.Add("")
    for tag in tags {
      if !counts.ContainsKey(tag) { continue }
      titles.Add(tag + " (" + counts[tag].ToString() + ")")
      seen.Add(tag)
    }
    tabTags = seen
    tabs.Titles = titles
  }

  private func apply() {
    let needle = filter.Text.Trim().ToLowerInvariant()
    var tagFilter = ""
    if tabTags.Count > 0 && tabs.SelectedIndex < tabTags.Count { tagFilter = tabTags[tabs.SelectedIndex] }
    shown = List[Chore]()
    list.Items = List[ListItem]()
    list.SelectedIndex = 0
    list.FirstVisibleItemIndex = 0
    for c in all {
      if tagFilter != "" && c.Tag != tagFilter { continue }
      let hay = (c.Tag + " " + c.Who + " " + c.Body + " " + c.File).ToLowerInvariant()
      if needle != "" && !hay.Contains(needle) { continue }
      shown.Add(c)
      var bodyText = c.Body
      if c.Who != "" { bodyText = "(" + c.Who + ") " + c.Body }
      list.Add(c.Tag.PadRight(6) + " " + choreShort(c.File, dir, 52).PadRight(53)
        + c.Line.ToString().PadLeft(6) + "  " + CellText.Clip(bodyText, 80))
    }
    refreshPreview()
  }

  /// Rebuilds the preview around the current selection. Called once per
  /// rebuild and once per user navigation, never blindly every frame.
  private func refreshPreview() {
    preview.Items = List[ListItem]()
    preview.SelectedIndex = 0
    preview.FirstVisibleItemIndex = 0
    let at = list.SelectedIndex
    if at < 0 || at >= shown.Count {
      pane.Title = "source"
      return
    }
    let c = shown[at]
    var title = c.File + ":" + c.Line.ToString()
    if c.Who != "" { title = title + " @" + c.Who }
    pane.Title = title

    let rows = List[string]()
    try {
      for line in File.ReadAllLines(c.File) { rows.Add(line) }
    } catch (e Exception) {
      preview.Add("cannot read " + c.File)
      return
    }
    var from = c.Line - 9
    if from < 0 { from = 0 }
    var to = c.Line + 8
    if to > rows.Count { to = rows.Count }
    var i = from
    while i < to {
      preview.Add((i + 1).ToString().PadLeft(6) + "  " + flatText(rows[i]))
      if i == c.Line - 1 { preview.SelectedIndex = preview.Items.Count - 1 }
      i = i + 1
    }
  }

  public func Draw(screen Screen) {
    if tabs.ConsumeSelectionChange() != nil { apply() }
    if list.ConsumeSelectionChange() != nil { refreshPreview() }
    bar.LeftText = shown.Count.ToString() + " of " + all.Count.ToString()
      + " markers in " + scanned.ToString() + " files under " + dir
    var hint = "/ filters - t edits tags - left and right swap tags - r rereads - q quits"
    if tagEdit { hint = "enter applies the tags and rescans - esc keeps the old ones" }
    else if filter.IsFocused { hint = "enter filters - esc clears it" }
    bar.RightText = hint
    screen.Clear()
    root.Draw(screen)
  }

  /// Turns the bottom box into a tag editor, prefilled with the active set.
  private func openTags() {
    if !tagEdit {
      tagEdit = true
      savedFilter = filter.Text
    }
    var spec = ""
    for t in tags { spec = spec == "" ? t : spec + "," + t }
    filter.Text = spec
    filterBox.Title = "tags"
    root.Focus(filter)
  }

  /// Leaves tag editing; applies the typed set when told to.
  private func closeTags(keep bool) {
    if keep { tags = choreTagList(filter.Text) }
    tagEdit = false
    filter.Text = savedFilter
    filterBox.Title = "filter"
    root.Focus(list)
    if keep {
      tabs.SelectedIndex = 0
      reload()
    }
  }

  public func Handle(ev UiEvent) EventResult {
    // A key acts on press; Kitty terminals also report releases.
    if ev.Phase == KeyPhase.Release { return root.Handle(ev) }

    // Typing is wherever focus is: tab can land in the bottom box without
    // any shortcut, so plain keys must never fire while it holds focus.
    if filter.IsFocused {
      if ev.Key == Key.Escape || ev.Key == Key.Enter {
        if tagEdit {
          closeTags(ev.Key == Key.Enter)
          return EventResult.Handled
        }
        if ev.Key == Key.Escape { filter.Text = "" }
        apply()
        root.Focus(list)
        return EventResult.Handled
      }
      root.Handle(ev)
      return EventResult.Continue
    }

    if ev.Key == Key.Character {
      if ev.Text == "q" { return EventResult.Exit }
      if ev.Text == "r" {
        reload()
        return EventResult.Handled
      }
      if ev.Text == "/" {
        if tagEdit { closeTags(false) }
        filter.Text = ""
        root.Focus(filter)
        return EventResult.Handled
      }
      if ev.Text == "t" {
        openTags()
        return EventResult.Handled
      }
    }
    if ev.Key == Key.Left || ev.Key == Key.Right {
      let delta = ev.Key == Key.Left ? -1 : 1
      var next = tabs.SelectedIndex + delta
      if next < 0 { next = tabs.Titles.Count - 1 }
      if next >= tabs.Titles.Count { next = 0 }
      tabs.SelectedIndex = next
      apply()
      return EventResult.Handled
    }
    root.Handle(ev)
    return EventResult.Continue
  }
}

/// The path under the scanned directory, cut from the left so the file name
/// always survives.
func choreShort(path string, dir string, width int32) string {
  var text = path
  if dir != "" && text.StartsWith(dir) { text = text.Substring(dir.Length) }
  text = text.TrimStart(char(47))
  if text.Length <= width { return text }
  return char(0x2026).ToString() + text.Substring(text.Length - width + 1)
}

/// One file, folded into `into`, joining bounded comment continuations onto
/// the marker's body. Returns true if the file was actually opened.
func choreScanOne(file string, into List[Chore], tags List[string]) bool {
  if Tongue.Of(file) == "" { return false }
  try {
    if FileInfo(file).Length > int64(2) * 1024 * 1024 { return false }
    let rows = List[string]()
    for line in File.ReadAllLines(file) { rows.Add(line) }
    var n = 0
    while n < rows.Count {
      let found = choreParse(rows[n], tags)
      guard let c = found else {
        n = n + 1
        continue
      }
      c.File = file
      c.Line = n + 1
      let lead = choreIndent(rows[n])
      var j = n + 1
      var joined = 0
      while j < rows.Count && joined < 5 {
        let cont = choreContinuation(rows[j], lead, tags)
        guard let text = cont else { break }
        c.Body = c.Body + " " + text
        joined = joined + 1
        j = j + 1
      }
      into.Add(c)
      n = n + 1
    }
    return true
  } catch (e Exception) {
    return false
  }
}

/// Source files only, by Tongue.Of, so a binary is never opened. Returns the
/// number of files read.
func choreWalk(dir string, into List[Chore], depth int32, tags List[string]) int32 {
  if depth > 12 || into.Count > 5000 { return 0 }
  var read = 0
  try {
    for file in Directory.GetFiles(dir) {
      if choreScanOne(file, into, tags) { read = read + 1 }
    }
    for kid in Directory.GetDirectories(dir) {
      let leaf = Path.GetFileName(kid) ?? ""
      if Tongue.Skip(leaf) { continue }
      read = read + choreWalk(kid, into, depth + 1, tags)
    }
  } catch (e Exception) {
  }
  return read
}

/// The tracked-and-untracked-but-not-ignored files under dir, by way of git,
/// or an empty list if git is unavailable or dir sits outside a repo.
func choreTracked(dir string) List[string] {
  let out = List[string]()
  let inside = choreGit(dir, "rev-parse --is-inside-work-tree").Trim()
  if inside != "true" { return out }
  let raw = choreGit(dir, "ls-files --cached --others --exclude-standard")
  if raw == "" { return out }
  for line in raw.Split('\n') {
    let name = line.Trim()
    if name == "" { continue }
    out.Add(Path.Combine(dir, name))
  }
  return out
}

func choreGit(dir string, args string) string {
  let list = List[string]()
  for part in args.Split(' ') {
    if part != "" { list.Add(part) }
  }
  let core = procRun("git", list, dir, List[string]())
  if core.Crashed || !core.Started || core.ExitCode != 0 { return "" }
  return core.Output
}
