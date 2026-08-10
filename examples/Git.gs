package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO

/// A named theme palette for the Git workbench.
public class GitPalette {
  public var Name string
  public var Text Color
  public var Accent Color
  public var Dim Color
  public var Good Color
  public var Warm Color
  public var Bad Color
  public var Back Color
  public var AddedBack Color
  public var DeletedBack Color
  public var HeaderBack Color

  public init() {
    Name = ""
    Text = Color.TerminalDefault
    Accent = Color.TerminalDefault
    Dim = Color.TerminalDefault
    Good = Color.TerminalDefault
    Warm = Color.TerminalDefault
    Bad = Color.TerminalDefault
    Back = Color.TerminalDefault
    AddedBack = Color.TerminalDefault
    DeletedBack = Color.TerminalDefault
    HeaderBack = Color.TerminalDefault
  }
}

/// Builds one palette from ten #RRGGBB surfaces.
func gitTheme(name string, text string, accent string, dim string, good string, warm string, bad string, back string, added string, deleted string, header string) GitPalette {
  let p = GitPalette{}
  p.Name = name
  p.Text = Color.Rgb(text)
  p.Accent = Color.Rgb(accent)
  p.Dim = Color.Rgb(dim)
  p.Good = Color.Rgb(good)
  p.Warm = Color.Rgb(warm)
  p.Bad = Color.Rgb(bad)
  p.Back = Color.Rgb(back)
  p.AddedBack = Color.Rgb(added)
  p.DeletedBack = Color.Rgb(deleted)
  p.HeaderBack = Color.Rgb(header)
  return p
}

/// GitHub Pages Jekyll theme presets.
func gitPresets() List[GitPalette] {
  let list = List[GitPalette]()
  list.Add(gitTheme("Cayman (GitHub Pages)", "E1E8ED", "159957", "606F7B", "2E7D32", "F59E0B", "E53935", "1E293B", "1B4D3E", "5C1D24", "0F172A"))
  list.Add(gitTheme("Primer Dark (GitHub Pages)", "C8CEDA", "58A6FF", "484F58", "3FB950", "D29922", "F85149", "0D1117", "134E3A", "5A1E24", "152238"))
  list.Add(gitTheme("Primer Light (GitHub Pages)", "24292E", "0366D6", "57606A", "1A7F37", "9A6700", "CF222E", "FFFFFF", "C6F6D5", "FFD8D8", "F6F8FA"))
  list.Add(gitTheme("Midnight (GitHub Pages)", "F1F5F9", "7C3AED", "64748B", "10B981", "F59E0B", "EF4444", "0F172A", "14532D", "6B1616", "1E1B4B"))
  list.Add(gitTheme("Hacker (GitHub Pages)", "22C55E", "4ADE80", "15803D", "86EFAC", "CA8A04", "DC2626", "050505", "0C4A1E", "4A0E17", "0A1F0D"))
  list.Add(gitTheme("Architect (GitHub Pages)", "E2E8F0", "0EA5E9", "0F172A", "10B981", "EAB308", "F43F5E", "1E293B", "0F4C3A", "541A28", "0284C7"))
  list.Add(gitTheme("Tactile (GitHub Pages)", "F8FAFC", "D97706", "78716C", "16A34A", "F59E0B", "DC2626", "1C1917", "155029", "5A1818", "292524"))
  list.Add(gitTheme("Leap Day (GitHub Pages)", "F1F5F9", "06B6D4", "64748B", "22C55E", "F97316", "F43F5E", "0F172A", "114B3E", "5B182B", "0891B2"))
  return list
}

/// One file entry reported by git status.
public class GitEntry {
  public var Path string
  public var Status string
  public var IsStaged bool

  public init() {
    Path = ""
    Status = ""
    IsStaged = false
  }
}

/// The outcome of one git command.
public class GitResult {
  public var Output string
  public var Error string
  public var Ok bool

  public init() {
    Output = ""
    Error = ""
    Ok = false
  }
}

/// Runs git without credential prompts and drains both pipes, so a large
/// diff or error can never wedge the child on a full pipe buffer.
func gitRun(dir string, args List[string]) GitResult {
  let r = GitResult{}
  try {
    let psi = ProcessStartInfo("git")
    psi.WorkingDirectory = dir
    psi.Environment["GIT_TERMINAL_PROMPT"] = "0"
    // Stable English messages: the status bar shows them and push sniffs --set-upstream.
    psi.Environment["LC_ALL"] = "C"
    for a in args { psi.ArgumentList.Add(a) }
    psi.RedirectStandardOutput = true
    psi.RedirectStandardError = true
    psi.UseShellExecute = false
    let started = Process.Start(psi)
    guard let p = started else {
      r.Error = "could not start git"
      return r
    }
    r.Output = p.StandardOutput.ReadToEnd()
    r.Error = p.StandardError.ReadToEnd().Trim()
    p.WaitForExit()
    r.Ok = p.ExitCode == 0
    return r
  } catch (e Exception) {
    r.Error = e.Message
    return r
  }
}

/// Runs git and returns stdout, empty when it fails.
func gitExec(dir string, args List[string]) string {
  return gitRun(dir, args).Output
}

/// A beginner-friendly interactive Git workbench.
/// `sharptui --git [DIR]`.
class Git : View {
  private var dir string
  private var repoOk bool
  private var currentBranch string
  private var note string
  private var palette GitPalette
  private var presets List[GitPalette]

  private var unstagedList ListView
  private var stagedList ListView
  private var diffList ListView
  private var historyList ListView
  private var bar StatusBar
  private var root Box

  private var unstagedBox Box
  private var stagedBox Box
  private var diffBox Box
  private var historyBox Box
  private var unstagedTitle string
  private var stagedTitle string
  private var diffTitle string
  private var historyTitle string

  private var unstagedFiles List[GitEntry]
  private var stagedFiles List[GitEntry]
  private var historyBranches List[string]
  private var historyCommits List[string]
  private var lastStagedFocus bool

  private var settingsOverlay Overlay
  private var settingsBox Box
  private var settingsTabs Tabs
  private var presetListView ListView
  private var helpBox Box
  private var helpList ListView
  private var settingsFooter Label

  private var promptOverlay Overlay
  private var promptBox Box
  private var promptInput TextInput
  private var promptHeader Label
  private var promptFooter Label
  private var promptMode string

  private var discardOverlay Overlay
  private var discardBox Box
  private var discardHeader Label
  private var discardWarn Label
  private var discardFooter Label
  private var fileToDiscard string
  private var discardUntracked bool

  public init(startDir string) {
    let base = Directory.Exists(startDir) ? Path.GetFullPath(startDir) : Directory.GetCurrentDirectory()
    dir = base
    repoOk = false
    currentBranch = ""
    note = ""
    promptMode = "commit"
    fileToDiscard = ""
    discardUntracked = false
    lastStagedFocus = false
    resolveRepo(base)

    presets = gitPresets()
    palette = presets[0]
    unstagedFiles = List[GitEntry]()
    stagedFiles = List[GitEntry]()
    historyBranches = List[string]()
    historyCommits = List[string]()

    unstagedList = ListView{ GrowWeight: 1, SelectionMarker: "" }
    stagedList = ListView{ GrowWeight: 1, SelectionMarker: "" }
    diffList = ListView{ GrowWeight: 1, SelectionMarker: "" }
    historyList = ListView{ GrowWeight: 1, SelectionMarker: "" }

    unstagedBox = Box{ GrowWeight: 1, ShowBorder: true, Children: { unstagedList } }
    stagedBox = Box{ GrowWeight: 1, ShowBorder: true, Children: { stagedList } }
    diffBox = Box{ GrowWeight: 1, ShowBorder: true, ShowScrollbar: true, Children: { diffList } }
    historyBox = Box{ Height: CellLength.Cells(8), ShowBorder: true, ShowScrollbar: true, Children: { historyList } }
    bar = StatusBar{}
    unstagedTitle = ""
    stagedTitle = ""
    diffTitle = "file diff [changes view]"
    historyTitle = "history & branches [workstreams]"

    let mainCol = Column{ GrowWeight: 1, Children: {
      Row{ GrowWeight: 1, GapCells: 1, Children: {
        Column{ GrowWeight: 1, Children: { unstagedBox, stagedBox } },
        diffBox,
      }},
      historyBox,
      bar,
    }}

    settingsTabs = Tabs{ Height: CellLength.Cells(1), Titles: List[string]{ "preset themes [github pages]", "keybinds & help" } }
    presetListView = ListView{ Height: CellLength.Cells(12), GrowWeight: 1, Title: "select github pages theme preset", ShowBorder: true, ShowScrollbar: true }
    for p in presets { presetListView.Add(p.Name) }

    helpList = ListView{ GrowWeight: 1, SelectionMarker: "" }
    helpList.Add("[space]    - Stage or unstage the selected file")
    helpList.Add("[A] / [U]  - Stage all changed files / Unstage everything")
    helpList.Add("[c]        - Save a snapshot (git commit)")
    helpList.Add("[b]        - Start a new workstream (git branch)")
    helpList.Add("[enter]    - On a workstream row: switch to it")
    helpList.Add("[p] / [P]  - Pull newest snapshots / Push yours to the remote")
    helpList.Add("[d]        - Discard uncommitted edits to the selected file")
    helpList.Add("[i]        - Create a repository when none exists (git init)")
    helpList.Add("[r]        - Refresh the repository state")
    helpList.Add("[tab]      - Move focus between panes, [s] settings, [q] quit")
    helpBox = Box{ Height: CellLength.Cells(12), GrowWeight: 1, Title: "beginner keybinds & git guidance", ShowBorder: true, Children: { helpList } }
    helpBox.IsVisible = false

    settingsFooter = Label{ Text: "[enter]: apply - [left/right]: switch tab - [esc]: close", Alignment: HorizontalAlignment.Center }
    settingsBox = Box{ Width: CellLength.Cells(78), Height: CellLength.Cells(18), ShowBorder: true, Title: "settings & theme",
      Children: { Column{ GrowWeight: 1, GapCells: 1, Children: { settingsTabs, presetListView, helpBox, settingsFooter } } } }
    settingsOverlay = Overlay{ Content: settingsBox, DimBackground: true }
    settingsOverlay.IsOpen = false

    promptHeader = Label{ Text: "" }
    promptInput = TextInput{ Placeholder: "", Height: CellLength.Cells(1) }
    promptFooter = Label{ Text: "", Alignment: HorizontalAlignment.Center }
    promptBox = Box{ Width: CellLength.Cells(64), Height: CellLength.Cells(7), ShowBorder: true, Title: "",
      Children: { Column{ GapCells: 1, Children: { promptHeader, promptInput, promptFooter } } } }
    promptOverlay = Overlay{ Content: promptBox, DimBackground: true }
    promptOverlay.IsOpen = false

    discardHeader = Label{ Text: "Are you sure you want to revert changes to this file?", Alignment: HorizontalAlignment.Center }
    discardWarn = Label{ Text: "Unsaved edits will be lost permanently!", Alignment: HorizontalAlignment.Center }
    discardFooter = Label{ Text: "[enter]/[y]: confirm - [esc]/[n]: cancel", Alignment: HorizontalAlignment.Center }
    discardBox = Box{ Width: CellLength.Cells(60), Height: CellLength.Cells(6), ShowBorder: true, Title: "confirm discard changes",
      Children: { Column{ GapCells: 1, Children: { discardHeader, discardWarn, discardFooter } } } }
    discardOverlay = Overlay{ Content: discardBox, DimBackground: true }
    discardOverlay.IsOpen = false

    root = Box{ Children: {
      mainCol,
      settingsOverlay,
      promptOverlay,
      discardOverlay,
    }}

    root.Focus(unstagedList)
    refreshTheme()
    refreshAll()
  }

  /// Finds the repository root above base, if any.
  private func resolveRepo(base string) {
    let top = gitExec(base, List[string]{ "rev-parse", "--show-toplevel" }).Trim()
    repoOk = top != "" && Directory.Exists(top)
    dir = repoOk ? top : base
  }

  private func dimInherit() Style {
    return Style{ Foreground: palette.Dim, Background: Color.Inherit }
  }

  /// Focus never lands on the wrapper boxes, so their border chrome is driven
  /// here from the inner list: an asterisk in the title plus an accent border.
  private func markPane(box Box, focused bool, title string, fg Color) {
    box.Title = focused ? "* " + title : title
    var borderFg = fg
    if focused { borderFg = palette.Accent }
    box.Style = Style{ Foreground: borderFg, Background: palette.Back }
  }

  private func listStyles(list ListView, selectionBack Color) {
    list.Style = Style{ Foreground: palette.Text, Background: palette.Back }
    list.SelectedStyle = Style{ Foreground: palette.Back, Background: selectionBack }
  }

  /// Reapplies the palette everywhere, restyling rows from cached state without running git.
  /// The four main pane borders are restyled every frame by markPane instead.
  private func refreshTheme() {
    root.Style = Style{ Foreground: palette.Text, Background: palette.Back }
    bar.Style = Style{ Foreground: palette.Dim, Background: palette.HeaderBack }

    listStyles(unstagedList, palette.Warm)
    listStyles(stagedList, palette.Good)
    listStyles(historyList, palette.Accent)
    diffList.Style = Style{ Foreground: palette.Text, Background: palette.Back }

    settingsTabs.Style = Style{ Foreground: palette.Dim, Background: palette.HeaderBack }
    settingsTabs.SelectedStyle = Style{ Foreground: palette.Accent, Background: palette.Back }
    listStyles(presetListView, palette.Accent)
    presetListView.FocusedStyle = Style{ Foreground: palette.Accent, Background: palette.Back }
    helpBox.Style = Style{ Foreground: palette.Accent, Background: palette.HeaderBack }
    helpList.Style = Style{ Foreground: palette.Text, Background: palette.Back }
    settingsFooter.Style = Style{ Foreground: palette.Dim, Background: palette.HeaderBack }
    settingsBox.Style = Style{ Foreground: palette.Accent, Background: palette.HeaderBack }

    promptBox.Style = Style{ Foreground: palette.Good, Background: palette.HeaderBack }
    promptHeader.Style = Style{ Foreground: palette.Text, Background: palette.HeaderBack }
    promptInput.Style = Style{ Foreground: palette.Text, Background: palette.Back }
    promptFooter.Style = Style{ Foreground: palette.Dim, Background: palette.HeaderBack }

    discardBox.Style = Style{ Foreground: palette.Bad, Background: palette.HeaderBack }
    discardHeader.Style = Style{ Foreground: palette.Text, Background: palette.HeaderBack }
    discardWarn.Style = Style{ Foreground: palette.Bad, Background: palette.HeaderBack }
    discardFooter.Style = Style{ Foreground: palette.Dim, Background: palette.HeaderBack }

    rebuildFileItems()
    rebuildHistoryItems()
    updateDiffView()
  }

  /// Reloads status, history, and the diff pane from git.
  private func refreshAll() {
    scanGitStatus()
    scanGitHistory()
    updateDiffView()
  }

  /// Parses git status --porcelain into the staged and unstaged caches.
  private func scanGitStatus() {
    unstagedFiles = List[GitEntry]()
    stagedFiles = List[GitEntry]()
    if repoOk {
      let raw = gitExec(dir, List[string]{ "status", "--porcelain" })
      for line in raw.Split('\n') {
        if line.Length < 4 { continue }
        let indexChar = line[0]
        let workChar = line[1]
        var path = line.Substring(3).Trim().Trim('"')
        if path.Contains("->") {
          path = path.Substring(path.IndexOf("->") + 2).Trim().Trim('"')
        }
        if path == "" { continue }

        if indexChar != ' ' && indexChar != '?' {
          let e = GitEntry{}
          e.Path = path
          e.IsStaged = true
          e.Status = indexChar == 'A' ? "Added" : (indexChar == 'M' ? "Modified" : (indexChar == 'D' ? "Deleted" : "Renamed"))
          stagedFiles.Add(e)
        }
        if workChar != ' ' || indexChar == '?' {
          let e = GitEntry{}
          e.Path = path
          e.IsStaged = false
          if indexChar == '?' && workChar == '?' { e.Status = "Untracked" }
          else if workChar == 'M' { e.Status = "Modified" }
          else if workChar == 'D' { e.Status = "Deleted" }
          else { e.Status = "Changed" }
          unstagedFiles.Add(e)
        }
      }
    }
    rebuildFileItems()
  }

  /// Rebuilds both file lists; path Ids keep the selection stable across rescans.
  private func rebuildFileItems() {
    let unItems = List[ListItem]()
    for e in unstagedFiles {
      unItems.Add(ListItem{ Id: e.Path, Text: "[ ] " + e.Status.PadRight(10) + " " + e.Path,
        Style: Style{ Foreground: palette.Warm, Background: Color.Inherit } })
    }
    unstagedList.Items = unItems

    let stItems = List[ListItem]()
    for e in stagedFiles {
      stItems.Add(ListItem{ Id: e.Path, Text: "[✓] " + e.Status.PadRight(10) + " " + e.Path,
        Style: Style{ Foreground: palette.Good, Background: Color.Inherit } })
    }
    stagedList.Items = stItems

    unstagedTitle = "unstaged files [changed, not in snapshot] (" + unstagedFiles.Count.ToString() + ")"
    stagedTitle = "staged files [ready to save] (" + stagedFiles.Count.ToString() + ")"
  }

  /// Reads the branch list and recent commits into the history caches.
  private func scanGitHistory() {
    historyBranches = List[string]()
    historyCommits = List[string]()
    currentBranch = ""
    if repoOk {
      let branchesRaw = gitExec(dir, List[string]{ "branch", "--list" })
      for line in branchesRaw.Split('\n') {
        let trimmed = line.Trim()
        if trimmed == "" { continue }
        let name = trimmed.TrimStart('*').Trim()
        if line.StartsWith("*") { currentBranch = name }
        historyBranches.Add(name)
      }
      let logRaw = gitExec(dir, List[string]{ "log", "-n", "15", "--oneline" })
      for line in logRaw.Split('\n') {
        if line.Trim() == "" { continue }
        historyCommits.Add(line)
      }
    }
    rebuildHistoryItems()
  }

  /// Branch rows first, then a separator, then commit rows. Row order matches historyBranches.
  private func rebuildHistoryItems() {
    let items = List[ListItem]()
    for name in historyBranches {
      let current = name == currentBranch
      var style = dimInherit()
      if current { style = Style{ Foreground: palette.Accent, Background: Color.Inherit, Attributes: TextAttributes.Bold } }
      items.Add(ListItem{ Id: "branch:" + name, Text: (current ? "▶ Workstream: " : "  Workstream: ") + name + (current ? " (Active)" : ""), Style: style })
    }
    items.Add(ListItem{ Id: "separator", IsSelectable: false, Text: "────────── Recent Saved Snapshots (Commits) ──────────", Style: dimInherit() })
    for line in historyCommits {
      items.Add(ListItem{ Id: "commit:" + line.Split(' ')[0], Text: "  " + line, Style: Style{ Foreground: palette.Text, Background: Color.Inherit } })
    }
    if historyBranches.Count == 0 && historyCommits.Count == 0 {
      items.Add(ListItem{ Id: "empty", IsSelectable: false, Text: "  no snapshots yet - stage files with [space], then press [c]", Style: dimInherit() })
    }
    historyList.Items = items
  }

  private func looksBinary(bytes []uint8) bool {
    var i = 0
    let n = bytes.Length < 512 ? bytes.Length : 512
    while i < n {
      if bytes[i] == 0 { return true }
      i = i + 1
    }
    return false
  }

  /// Appends a new file's lines as an all-added diff. Returns the rendered
  /// line count, 0 for a placeholder row, or -1 when there is no file.
  private func appendWholeFile(fullPath string, items List[ListItem]) int32 {
    if !File.Exists(fullPath) { return -1 }
    try {
      let info = FileInfo(fullPath)
      if info.Length > 1048576 {
        items.Add(ListItem{ Text: "Too large to preview (" + info.Length.ToString() + " bytes).", Style: dimInherit() })
        return 0
      }
      let bytes = File.ReadAllBytes(fullPath)
      if looksBinary(bytes) {
        items.Add(ListItem{ Text: "Binary file (" + bytes.Length.ToString() + " bytes).", Style: dimInherit() })
        return 0
      }
      let lines = File.ReadAllLines(fullPath)
      var n = 1
      for l in lines {
        items.Add(ListItem{ Text: n.ToString().PadLeft(4) + " │ " + l, Style: Style{ Foreground: palette.Text, Background: palette.AddedBack } })
        n = n + 1
      }
      return lines.Length
    } catch (e Exception) {
      return -1
    }
  }

  /// Shows the diff for the selected file. The staged pane drives the view while it holds focus.
  private func updateDiffView() {
    let items = List[ListItem]()
    var targetPath = ""
    var isStaged = false
    var isUntracked = false

    if stagedList.IsFocused && stagedList.SelectedIndex >= 0 && stagedList.SelectedIndex < stagedFiles.Count {
      targetPath = stagedFiles[stagedList.SelectedIndex].Path
      isStaged = true
    } else if unstagedList.SelectedIndex >= 0 && unstagedList.SelectedIndex < unstagedFiles.Count {
      targetPath = unstagedFiles[unstagedList.SelectedIndex].Path
      isUntracked = unstagedFiles[unstagedList.SelectedIndex].Status == "Untracked"
    } else if stagedList.SelectedIndex >= 0 && stagedList.SelectedIndex < stagedFiles.Count {
      targetPath = stagedFiles[stagedList.SelectedIndex].Path
      isStaged = true
    }

    if !repoOk {
      diffTitle = "file diff"
      items.Add(ListItem{ Text: "This folder is not a git repository yet. Press [i] to create one.", Style: dimInherit() })
      diffList.Items = items
      return
    }
    if targetPath == "" {
      diffTitle = "file diff [no file selected]"
      items.Add(ListItem{ Text: "Select a file on the left to view its changes.", Style: dimInherit() })
      diffList.Items = items
      return
    }

    let suffix = isStaged ? " [staged]" : " [unstaged]"
    let fullPath = Path.Combine(dir, targetPath)

    var diffText = ""
    if !isUntracked {
      let args = List[string]()
      args.Add("diff")
      if isStaged { args.Add("--staged") }
      args.Add("--")
      args.Add(targetPath)
      diffText = gitExec(dir, args)
    }

    if diffText.Trim() == "" {
      let added = appendWholeFile(fullPath, items)
      if added > 0 {
        diffTitle = "file diff: " + targetPath + suffix + " (+" + added.ToString() + " new file)"
      } else if added == 0 {
        diffTitle = "file diff: " + targetPath + suffix + " [new file]"
      } else {
        diffTitle = "file diff: " + targetPath + suffix
        var hint = "No changes to show."
        if Directory.Exists(fullPath) { hint = "Untracked folder. Press [space] to stage every file inside it." }
        items.Add(ListItem{ Text: hint, Style: dimInherit() })
      }
      diffList.Items = items
      return
    }

    var oldNum = 1
    var newNum = 1
    var addedCount = 0
    var deletedCount = 0

    for line in diffText.Split('\n') {
      if line.StartsWith("diff ") || line.StartsWith("index ") || line.StartsWith("--- ") || line.StartsWith("+++ ") { continue }
      if line.StartsWith("@@") {
        // "@@ -12,3 +14,4 @@": reset the running line counters for this hunk.
        for p in line.Split(' ') {
          if p.Length > 1 && p.StartsWith("-") {
            let nums = p.Substring(1).Split(',')
            var o = 1
            if Int32.TryParse(nums[0], &o) { oldNum = o }
          } else if p.Length > 1 && p.StartsWith("+") {
            let nums = p.Substring(1).Split(',')
            var n = 1
            if Int32.TryParse(nums[0], &n) { newNum = n }
          }
        }
        continue
      }

      var style = Style{ Foreground: palette.Text, Background: Color.Inherit }
      var lineNo = 0
      var content = line
      if line.StartsWith("+") {
        style = Style{ Foreground: palette.Text, Background: palette.AddedBack }
        lineNo = newNum
        newNum = newNum + 1
        addedCount = addedCount + 1
        content = line.Substring(1)
      } else if line.StartsWith("-") {
        style = Style{ Foreground: palette.Text, Background: palette.DeletedBack }
        lineNo = oldNum
        oldNum = oldNum + 1
        deletedCount = deletedCount + 1
        content = line.Substring(1)
      } else {
        lineNo = newNum
        newNum = newNum + 1
        oldNum = oldNum + 1
        if line.StartsWith(" ") { content = line.Substring(1) }
      }
      items.Add(ListItem{ Text: lineNo.ToString().PadLeft(4) + " │ " + content, Style: style })
    }

    diffTitle = "file diff: " + targetPath + suffix + " (+" + addedCount.ToString() + " -" + deletedCount.ToString() + ")"
    diffList.Items = items
  }

  private func firstLine(text string) string {
    for line in text.Split('\n') {
      if line.Trim() != "" { return line.Trim() }
    }
    return "git command failed"
  }

  /// Runs a git action, surfaces the first error line in the status bar, and rescans.
  private func runNoted(args List[string], okNote string) bool {
    let r = gitRun(dir, args)
    note = r.Ok ? okNote : firstLine(r.Error)
    refreshAll()
    return r.Ok
  }

  private func stageSelected() {
    if unstagedList.SelectedIndex < 0 || unstagedList.SelectedIndex >= unstagedFiles.Count { return }
    let path = unstagedFiles[unstagedList.SelectedIndex].Path
    runNoted(List[string]{ "add", "--", path }, "staged " + path)
  }

  private func unstageSelected() {
    if stagedList.SelectedIndex < 0 || stagedList.SelectedIndex >= stagedFiles.Count { return }
    let path = stagedFiles[stagedList.SelectedIndex].Path
    runNoted(List[string]{ "restore", "--staged", "--", path }, "unstaged " + path)
  }

  /// Enter on a branch row switches to that workstream.
  private func switchToSelected() {
    let idx = historyList.SelectedIndex
    if idx < 0 { return }
    if idx >= historyBranches.Count {
      note = "select a workstream row to switch branches"
      return
    }
    let name = historyBranches[idx]
    if name == currentBranch {
      note = "already on workstream " + name
      return
    }
    runNoted(List[string]{ "switch", name }, "switched to workstream " + name)
  }

  /// Pushes, linking the branch to origin on the first push.
  private func pushCurrent() {
    var r = gitRun(dir, List[string]{ "push" })
    if !r.Ok && currentBranch != "" && r.Error.Contains("--set-upstream") {
      r = gitRun(dir, List[string]{ "push", "-u", "origin", currentBranch })
    }
    note = r.Ok ? "pushed your snapshots to the remote" : firstLine(r.Error)
    refreshAll()
  }

  private func initRepo() {
    let r = gitRun(dir, List[string]{ "init" })
    note = r.Ok ? "created an empty repository - make edits, then stage them" : firstLine(r.Error)
    resolveRepo(dir)
    refreshAll()
  }

  /// One input dialog serves both the commit message and the new branch name.
  private func openPrompt(mode string) {
    promptMode = mode
    promptInput.Text = ""
    if mode == "commit" {
      promptBox.Title = "save snapshot [git commit]"
      promptHeader.Text = "Enter a message describing this saved snapshot:"
      promptInput.Placeholder = "a short summary of what you changed"
      promptFooter.Text = "[enter]: snapshot - [esc]: cancel"
    } else {
      promptBox.Title = "new workstream [git branch]"
      promptHeader.Text = "Name the new workstream (branch):"
      promptInput.Placeholder = "my-new-idea"
      promptFooter.Text = "[enter]: create - [esc]: cancel"
    }
    promptOverlay.IsOpen = true
    root.Focus(promptInput)
  }

  private func openCommitPrompt() {
    if stagedFiles.Count == 0 {
      note = "nothing staged yet - press [space] on an unstaged file first"
      return
    }
    openPrompt("commit")
  }

  private func executePrompt() {
    let text = promptInput.Text.Trim()
    if text == "" { return }
    promptOverlay.IsOpen = false
    root.Focus(unstagedList)
    if promptMode == "commit" {
      runNoted(List[string]{ "commit", "-m", text }, "saved snapshot: " + text)
    } else {
      runNoted(List[string]{ "switch", "-c", text }, "created and switched to workstream " + text)
    }
  }

  private func promptDiscard() {
    if !unstagedList.IsFocused { return }
    if unstagedList.SelectedIndex < 0 || unstagedList.SelectedIndex >= unstagedFiles.Count { return }
    let entry = unstagedFiles[unstagedList.SelectedIndex]
    fileToDiscard = entry.Path
    discardUntracked = entry.Status == "Untracked"
    discardOverlay.IsOpen = true
  }

  /// Untracked files are removed with clean; tracked edits are reverted with checkout.
  private func executeDiscard() {
    discardOverlay.IsOpen = false
    if fileToDiscard == "" { return }
    if discardUntracked {
      runNoted(List[string]{ "clean", "-fd", "--", fileToDiscard }, "deleted untracked " + fileToDiscard)
    } else {
      runNoted(List[string]{ "checkout", "--", fileToDiscard }, "discarded edits to " + fileToDiscard)
    }
    fileToDiscard = ""
  }

  private func toggleSettings() {
    settingsOverlay.IsOpen = !settingsOverlay.IsOpen
    if settingsOverlay.IsOpen { updateSettingsTab() }
    else { root.Focus(unstagedList) }
  }

  private func updateSettingsTab() {
    presetListView.IsVisible = settingsTabs.SelectedIndex == 0
    helpBox.IsVisible = settingsTabs.SelectedIndex == 1
    if settingsTabs.SelectedIndex == 0 { root.Focus(presetListView) }
    else { root.Focus(helpList) }
  }

  private func applyPreset(index int32) {
    if index < 0 || index >= presets.Count { return }
    palette = presets[index]
    refreshTheme()
  }

  public func Draw(screen Screen) {
    // The diff target depends on which file pane holds focus, so a focus
    // flip must refresh it just like a selection change does.
    let focusFlip = stagedList.IsFocused != lastStagedFocus
    if focusFlip { lastStagedFocus = stagedList.IsFocused }
    let unChanged = unstagedList.ConsumeSelectionChange()
    let stChanged = stagedList.ConsumeSelectionChange()
    if unChanged != nil || stChanged != nil || focusFlip { updateDiffView() }

    // Consume unconditionally so a change from a closing overlay cannot fire later.
    let tabChanged = settingsTabs.ConsumeSelectionChange()
    let presetChanged = presetListView.ConsumeSelectionChange()
    if settingsOverlay.IsOpen {
      if tabChanged != nil { updateSettingsTab() }
      if presetChanged != nil && settingsTabs.SelectedIndex == 0 {
        applyPreset(presetListView.SelectedIndex)
        note = "previewing theme: " + palette.Name
      }
    }

    markPane(unstagedBox, unstagedList.IsFocused, unstagedTitle, palette.Warm)
    markPane(stagedBox, stagedList.IsFocused, stagedTitle, palette.Good)
    markPane(diffBox, diffList.IsFocused, diffTitle, palette.Text)
    markPane(historyBox, historyList.IsFocused, historyTitle, palette.Dim)

    if repoOk {
      let branch = currentBranch == "" ? "no workstream yet" : currentBranch
      bar.LeftText = "(" + branch + ") " + dir + (note == "" ? "" : "  " + note)
    } else {
      bar.LeftText = dir + "  not a git repository - press [i] to create one"
    }

    if unstagedList.IsFocused {
      bar.RightText = "[space]: stage - [A]: stage all - [d]: discard - [c]: snapshot - [s]: settings - [q]: quit"
    } else if stagedList.IsFocused {
      bar.RightText = "[space]: unstage - [U]: unstage all - [c]: snapshot - [s]: settings - [q]: quit"
    } else if historyList.IsFocused {
      bar.RightText = "[enter]: switch workstream - [b]: new workstream - [p]: pull - [P]: push - [q]: quit"
    } else {
      bar.RightText = "[tab]: pane - [p]: pull - [P]: push - [c]: snapshot - [s]: settings - [q]: quit"
    }

    screen.Clear()
    root.Draw(screen)
  }

  public func Handle(ev UiEvent) EventResult {
    if ev.Phase == KeyPhase.Release { return root.Handle(ev) }

    if promptOverlay.IsOpen {
      if ev.Key == Key.Escape {
        promptOverlay.IsOpen = false
        root.Focus(unstagedList)
        return EventResult.Handled
      }
      if ev.Key == Key.Enter {
        executePrompt()
        return EventResult.Handled
      }
      // Focus traversal must not escape the modal into the panes behind it.
      if ev.Key == Key.Tab { return EventResult.Handled }
      return root.Handle(ev)
    }

    if discardOverlay.IsOpen {
      if ev.Key == Key.Escape || (ev.Key == Key.Character && ev.Text == "n") {
        discardOverlay.IsOpen = false
        return EventResult.Handled
      }
      if ev.Key == Key.Enter || (ev.Key == Key.Character && ev.Text == "y") {
        executeDiscard()
        return EventResult.Handled
      }
      return EventResult.Handled
    }

    if settingsOverlay.IsOpen {
      if ev.Key == Key.Escape {
        settingsOverlay.IsOpen = false
        root.Focus(unstagedList)
        return EventResult.Handled
      }
      if ev.Key == Key.Enter {
        if settingsTabs.SelectedIndex == 0 {
          applyPreset(presetListView.SelectedIndex)
          note = "applied theme: " + palette.Name
        }
        settingsOverlay.IsOpen = false
        root.Focus(unstagedList)
        return EventResult.Handled
      }
      if ev.Key == Key.Left || ev.Key == Key.Right {
        let count = settingsTabs.Titles.Count
        var next = settingsTabs.SelectedIndex + (ev.Key == Key.Left ? -1 : 1)
        if next < 0 { next = count - 1 }
        if next >= count { next = 0 }
        settingsTabs.SelectedIndex = next
        updateSettingsTab()
        return EventResult.Handled
      }
      if ev.Key == Key.Tab { return EventResult.Handled }
      return root.Handle(ev)
    }

    if ev.Key == Key.Character && ev.Text == "q" { return EventResult.Exit }
    if ev.Key == Key.Character && ev.Text == "s" {
      toggleSettings()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "r" {
      resolveRepo(dir)
      refreshAll()
      note = "refreshed"
      return EventResult.Handled
    }

    if !repoOk {
      if ev.Key == Key.Character && ev.Text == "i" {
        initRepo()
        return EventResult.Handled
      }
      return root.Handle(ev)
    }

    if ev.Key == Key.Character && ev.Text == "c" {
      openCommitPrompt()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "b" {
      openPrompt("branch")
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "p" {
      runNoted(List[string]{ "pull" }, "pulled the newest snapshots from the remote")
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "P" {
      pushCurrent()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "A" {
      runNoted(List[string]{ "add", "-A" }, "staged all changed files")
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "U" {
      runNoted(List[string]{ "restore", "--staged", "." }, "unstaged all files")
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == "d" {
      promptDiscard()
      return EventResult.Handled
    }
    if ev.Key == Key.Character && ev.Text == " " {
      if unstagedList.IsFocused {
        stageSelected()
        return EventResult.Handled
      }
      if stagedList.IsFocused {
        unstageSelected()
        return EventResult.Handled
      }
    }
    if ev.Key == Key.Enter && historyList.IsFocused {
      switchToSelected()
      return EventResult.Handled
    }
    if ev.Key == Key.Tab {
      if unstagedList.IsFocused { root.Focus(stagedList) }
      else if stagedList.IsFocused { root.Focus(diffList) }
      else if diffList.IsFocused { root.Focus(historyList) }
      else { root.Focus(unstagedList) }
      return EventResult.Handled
    }

    return root.Handle(ev)
  }
}
