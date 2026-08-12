package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.IO

/// One directory entry, stat'd once at scan time so filtering and
/// sorting never touch the filesystem again.
public class Entry {
  public var Name string
  public var Dir bool
  public var Hidden bool
  public var Size int64
  public var Stamp DateTime
  public var Paint Style

  public init() {
    Name = ""
    Dir = false
    Hidden = false
    Size = 0
    Stamp = DateTime.MinValue
    Paint = Style()
  }
}

enum SortMode { Name; Size; Mtime }

/// A file browser. `sharptui --files [DIR]`.
class Files : View {
  private var list ListView
  private var preview TextBlock
  private var doc MarkdownView
  private var bar StatusBar
  private var root Box
  private var filter TextInput
  private var filterBar Box
  private var dir string
  private var cachedDirs List[Entry]
  private var cachedFiles List[Entry]
  private var showHidden bool
  private var sort SortMode
  private var note string

  public init(start string) {
    dir = Directory.Exists(start) ? Path.GetFullPath(start) : Directory.GetCurrentDirectory()
    cachedDirs = List[Entry]()
    cachedFiles = List[Entry]()
    showHidden = false
    sort = SortMode.Name
    note = ""

    list = ListView{ GrowWeight: 1, ShowBorder: true, ShowScrollbar: true, Title: "files",
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit }, SelectedStyle: Style{ Foreground: Ink.Back, Background: Ink.Accent } }
    preview = TextBlock{ GrowWeight: 1, ShowBorder: true, Title: "preview",
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit } }
    doc = MarkdownView{ GrowWeight: 1, ShowBorder: true, ShowScrollbar: true, Title: "preview", Theme: previewTheme(),
      Style: Style{ Foreground: Ink.Text, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit } }
    bar = dimStatusBar()
    filter = TextInput{ Placeholder: "filter...", Height: CellLength.Cells(1), ShowBorder: true, Title: "filter",
      Style: Style{ Foreground: Ink.Warm, Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit } }
    filterBar = Box{ Height: CellLength.Cells(3), Children: { filter } }

    root = Column{ Children: {
      Row{ GrowWeight: 1, GapCells: 1, Children: { list, preview, doc } },
      filterBar,
      bar,
    }}
    root.Focus(list)
    rescan()
    apply()
  }

  /// One pass over the directory: names, sizes, stamps, and styles, all
  /// from the same DirectoryInfo walk. Everything after works off the cache.
  private func rescan() {
    cachedDirs = List[Entry]()
    cachedFiles = List[Entry]()
    try {
      let info = DirectoryInfo(dir)
      for d in info.GetDirectories() {
        let e = Entry{}
        e.Name = d.Name + "/"
        e.Dir = true
        e.Hidden = d.Name.StartsWith(".")
        e.Stamp = d.LastWriteTimeUtc
        e.Paint = Style{ Foreground: Ink.Accent, Background: Color.Inherit }
        cachedDirs.Add(e)
      }
      for f in info.GetFiles() {
        let e = Entry{}
        e.Name = f.Name
        e.Hidden = f.Name.StartsWith(".")
        e.Size = f.Length
        e.Stamp = f.LastWriteTimeUtc
        e.Paint = paintFor(f)
        cachedFiles.Add(e)
      }
    } catch (e Exception) {
    }
  }

  private func paintFor(f FileInfo) Style {
    if (int32(f.Attributes) & int32(FileAttributes.ReparsePoint)) != 0 {
      return Style{ Foreground: Ink.Warm, Background: Color.Inherit }
    }
    try {
      let bits = int32(UnixFileMode.UserExecute) | int32(UnixFileMode.GroupExecute) | int32(UnixFileMode.OtherExecute)
      if (int32(f.UnixFileMode) & bits) != 0 { return Style{ Foreground: Ink.Good, Background: Color.Inherit } }
    } catch (e Exception) {
    }
    return Style()
  }

  /// Filters and sorts the cached entries into the list. Pure in-memory
  /// work, so it is safe on every filter keystroke.
  private func apply() {
    let query = filter.Text.Trim().ToLowerInvariant()
    let dirs = kept(cachedDirs, query)
    let files = kept(cachedFiles, query)
    order(dirs)
    order(files)

    let fresh = List[ListItem]()
    if Path.GetPathRoot(dir) != dir {
      fresh.Add(ListItem{ Text: "..", Style: Style{ Foreground: Ink.Accent, Background: Color.Inherit } })
    }
    for e in dirs { fresh.Add(ListItem{ Text: e.Name, Style: e.Paint }) }
    for e in files { fresh.Add(ListItem{ Text: e.Name, Style: e.Paint }) }
    list.Items = fresh

    note = query != "" && dirs.Count + files.Count == 0 ? "nothing matches" : ""
    buildPreview()
  }

  private func kept(all List[Entry], query string) List[Entry] {
    let out = List[Entry]()
    for e in all {
      if e.Hidden && !showHidden { continue }
      if query != "" && !e.Name.ToLowerInvariant().Contains(query) { continue }
      out.Add(e)
    }
    return out
  }

  /// Sorts on the cached fields, so a size or mtime sort costs no stats.
  private func order(entries List[Entry]) {
    if sort == SortMode.Size {
      entries.Sort(func(a Entry, b Entry) int32 {
        if a.Dir { return String.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase) }
        return b.Size.CompareTo(a.Size)
      })
      return
    }
    if sort == SortMode.Mtime {
      entries.Sort(func(a Entry, b Entry) int32 { return b.Stamp.CompareTo(a.Stamp) })
      return
    }
    entries.Sort(func(a Entry, b Entry) int32 { return String.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase) })
  }

  private func selectedName() string? {
    if list.SelectedIndex < 0 || list.SelectedIndex >= list.Items.Count { return nil }
    return list.Items[list.SelectedIndex].Text
  }

  private func fullPath(name string) string {
    if name == ".." { return Path.GetFullPath(Path.Combine(dir, "..")) }
    if name.EndsWith("/") { return Path.Combine(dir, name.Substring(0, name.Length - 1)) }
    return Path.Combine(dir, name)
  }

  private func descend() {
    guard let name = selectedName() else { return }
    if name != ".." && !name.EndsWith("/") { return }
    dir = fullPath(name)
    filter.Text = ""
    rescan()
    apply()
  }

  private func ascend() {
    let parent = Path.GetFullPath(Path.Combine(dir, ".."))
    if parent == dir { return }
    dir = parent
    filter.Text = ""
    rescan()
    apply()
  }

  private func showPreview() {
    preview.IsVisible = true
    doc.IsVisible = false
  }

  private func showMarkdown() {
    preview.IsVisible = false
    doc.IsVisible = true
  }

  private func isMarkdown(name string) bool {
    if name == ".." || name.EndsWith("/") { return false }
    return name.ToLowerInvariant().EndsWith(".md")
  }

  private func buildPreview() {
    guard let name = selectedName() else {
      showPreview()
      preview.Text = ""
      preview.Title = "preview"
      return
    }

    let path = fullPath(name)

    if name == ".." || name.EndsWith("/") {
      showPreview()
      preview.ScrollToLine(0)
      preview.Title = name
      try {
        let count = Directory.GetDirectories(path).Length + Directory.GetFiles(path).Length
        preview.Text = count.ToString() + " entries"
      } catch (e Exception) {
        preview.Text = "cannot read directory"
      }
      return
    }

    if !File.Exists(path) {
      showPreview()
      preview.ScrollToLine(0)
      preview.Title = name
      preview.Text = "not readable"
      return
    }

    if isMarkdown(name) && buildMarkdownPreview(name, path) { return }

    showPreview()
    preview.ScrollToLine(0)
    preview.Title = name
    try {
      let info = FileInfo(path)
      if info.Length > 1048576 {
        preview.Text = "binary or too large (" + info.Length.ToString() + " bytes)"
        return
      }
      let bytes = File.ReadAllBytes(path)
      if looksBinary(bytes) {
        preview.Text = "binary file (" + bytes.Length.ToString() + " bytes)"
        return
      }
      let lines = File.ReadLines(path)
      var out = ""
      var n = 0
      for line in lines {
        if n >= 200 { break }
        out = out + line + "\n"
        n = n + 1
      }
      preview.Text = out
    } catch (e Exception) {
      preview.Text = "cannot read file"
    }
  }

  /// Renders a .md file through MarkdownView. Returns false to fall back to the plain preview.
  private func buildMarkdownPreview(name string, path string) bool {
    try {
      let info = FileInfo(path)
      if info.Length > 1048576 { return false }
      let bytes = File.ReadAllBytes(path)
      if looksBinary(bytes) { return false }
      showMarkdown()
      doc.Title = name
      doc.Source = File.ReadAllText(path)
      doc.ScrollToLine(0)
      return true
    } catch (e Exception) {
      return false
    }
  }

  public func Draw(screen Screen) {
    let change = list.ConsumeSelectionChange()
    if change != nil { buildPreview() }

    bar.LeftText = note == "" ? dir : dir + "  " + note
    var sortLabel = "name"
    if sort == SortMode.Size { sortLabel = "size" }
    if sort == SortMode.Mtime { sortLabel = "mtime" }
    var hiddenLabel = "hidden:off"
    if showHidden { hiddenLabel = "hidden:on" }
    var rightText = sortLabel + " - " + hiddenLabel + " - enter/right open - left/backspace up - / filter - . hidden - s sort - q quits"
    if filter.IsFocused { rightText = "esc closes filter" }
    bar.RightText = rightText

    screen.Clear()
    root.Draw(screen)
  }

  public func Handle(ev UiEvent) EventResult {
    // A key acts on press; Kitty terminals also report releases.
    if ev.Phase == KeyPhase.Release { return root.Handle(ev) }

    // Typing is wherever focus is: tab can land in the filter box without
    // any shortcut, so plain keys must never fire while it holds focus.
    if filter.IsFocused {
      if ev.Key == Key.Escape {
        root.Focus(list)
        apply()
        return EventResult.Handled
      }
      if ev.Key == Key.Enter {
        root.Focus(list)
        return EventResult.Handled
      }
      let before = filter.Text
      root.Handle(ev)
      if filter.Text != before { apply() }
      return EventResult.Continue
    }

    if ev.Key == Key.Character && ev.Text == "q" { return EventResult.Exit }
    if ev.Key == Key.Character && ev.Text == "/" {
      root.Focus(filter)
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "." {
      showHidden = !showHidden
      apply()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "s" {
      cycleSort()
      return EventResult.Handled
    }
    if ev.Key == Key.Enter || ev.Key == Key.Right {
      descend()
      return EventResult.Handled
    }
    if ev.Key == Key.Left || ev.Key == Key.Backspace {
      ascend()
      return EventResult.Handled
    }

    root.Handle(ev)
    return EventResult.Continue
  }

  private func cycleSort() {
    if sort == SortMode.Name { sort = SortMode.Size }
    else if sort == SortMode.Size { sort = SortMode.Mtime }
    else { sort = SortMode.Name }
    apply()
  }
}

/// True when the first up-to-512 bytes contain a null, the cheap heuristic
/// used to steer a preview away from binary content.
func looksBinary(bytes []uint8) bool {
  var i = 0
  let n = bytes.Length < 512 ? bytes.Length : 512
  while i < n {
    if bytes[i] == 0 { return true }
    i = i + 1
  }
  return false
}
