package SharpTui

import SharpTui

import System
import System.Collections.Generic
import System.IO

/// Which panes the editor shows; F2 cycles through them.
enum EditLayout { Split, EditorOnly, PreviewOnly }

/// A markdown editor with a live preview. `sharptui --edit FILE` (any *.md argument works too).
open class Edit : Column {
  private var area TextArea
  private var doc MarkdownView
  private var bar StatusBar
  private var leftBox Box
  private var rightBox Box
  private var path string
  private var previewSource string
  private var saved bool
  private var message string
  private var find TextInput
  private var swap TextInput
  private var findBox Box
  private var searching bool
  private var lastQuery string
  private var layout EditLayout

  private var lastCaretLine int32
  private var wordCount int32
  private var lineCount int32

  public init(file string) {
    path = file
    saved = true
    message = ""
    lastQuery = ""
    layout = EditLayout.Split
    lastCaretLine = 0
    wordCount = 0
    lineCount = 0


    area = TextArea{ Wrapping: TextWrapping.Word, SelectedTextStyle: Style{ Foreground: Ink.Back, Background: Ink.Accent } }
    if File.Exists(file) {
      area.Text = File.ReadAllText(file)
    }
    previewSource = area.Text
    countWords(previewSource)

    // No MaximumLineWidth: MarkdownView falls back to CellLength.Auto and wraps to the pane.
    doc = MarkdownView{ Source: previewSource, Theme: previewTheme() }
    bar = dimStatusBar()

    leftBox = Box{ GrowWeight: 1, ShowBorder: true, Title: "source",
      Style: Style{ Foreground: Color.Rgb("3A4152"), Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit }, Children: { area } }
    rightBox = Box{ GrowWeight: 1, ShowBorder: true, ShowScrollbar: true, Title: "preview",
      Style: Style{ Foreground: Color.Rgb("3A4152"), Background: Color.Inherit }, FocusedStyle: Style{ Foreground: Ink.Accent, Background: Color.Inherit }, Children: { doc } }

    find = TextInput{ GrowWeight: 1, Placeholder: "find", Style: Style{ Foreground: Ink.Text, Background: Color.Inherit },
      PlaceholderStyle: Style{ Foreground: Ink.Dim, Background: Color.Inherit } }
    swap = TextInput{ GrowWeight: 1, Placeholder: "replace with", Style: Style{ Foreground: Ink.Text, Background: Color.Inherit },
      PlaceholderStyle: Style{ Foreground: Ink.Dim, Background: Color.Inherit } }
    findBox = Row{ Height: CellLength.Cells(1), GrowWeight: 0, GapCells: 2, Children: { find, swap } }
    searching = false

    Children.Add(Row{ GrowWeight: 1, GapCells: 1, Children: { leftBox, rightBox } })
    Children.Add(bar)
    Focus(area)
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    syncScroll()
    syncPreview()

    var name = Path.GetFileName(path)
    if name == nil { name = path }
    bar.LeftText = name + (saved ? "" : " *")
    var hint = "shift+arrows mark - ctrl a/c/x/v/z/y - / or ctrl+f finds - f2 layout - ctrl+s saves - ctrl+q quits"
    if searching { hint = "enter/down finds next - up finds prev - ctrl+r replaces the hit - tab swaps field - escape closes" }
    bar.CenterText = message != "" ? message : hint
    bar.RightText = (area.Caret.LineIndex + 1).ToString() + ":" + (area.Caret.GraphemeIndex + 1).ToString()
      + "  " + lineCount.ToString() + "L " + wordCount.ToString() + "W"

  }

  protected override func Accept(ev UiEvent) EventResult {
    // A key acts on press; Kitty terminals also report releases.
    if ev.Phase == KeyPhase.Release { return EventResult.Continue }
    if KeyGesture.Ctrl("q").Matches(ev) { return EventResult.Exit }
    if KeyGesture.Ctrl("f").Matches(ev) {
      openFind()
      return EventResult.Handled
    }
    if ev.Key == Key.F2 {
      cycleLayout()
      return EventResult.Handled
    }
    if searching {
      if ev.Key == Key.Escape {
        closeFind()
        return EventResult.Handled
      }
      if ev.Key == Key.Enter || ev.Key == Key.Down {
        runSearch(SearchDirection.Forward)
        return EventResult.Handled
      }
      if ev.Key == Key.Up {
        runSearch(SearchDirection.Backward)
        return EventResult.Handled
      }
      if KeyGesture.Ctrl("r").Matches(ev) {
        replaceOne()
        return EventResult.Handled
      }
      return EventResult.Continue
    }
    // The preview pane consumes no plain characters, so it can host vim-style / n N without colliding with typing.
    if !area.IsFocused && ev.Key == Key.Character && ev.Modifiers == KeyModifiers.None {
      if ev.Text == "/" {
        openFind()
        return EventResult.Handled
      }
      if ev.Text == "n" && lastQuery != "" {
        runSearch(SearchDirection.Forward)
        return EventResult.Handled
      }
      if ev.Text == "N" && lastQuery != "" {
        runSearch(SearchDirection.Backward)
        return EventResult.Handled
      }
    }
    if KeyGesture.Ctrl("s").Matches(ev) {
      trySave()
      return EventResult.Handled
    }
    if ev.Key == Key.Escape {
      if saved { return EventResult.Exit }
      message = "unsaved changes, ctrl+s to save or ctrl+q to quit"
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func openFind() {
    if !searching {
      searching = true
      Children.Insert(1, findBox)
    }
    if find.Text != "" { lastQuery = find.Text }
    message = ""
    Focus(find)
  }

  private func closeFind() {
    if !searching { return }
    searching = false
    Children.Remove(findBox)
    message = ""
    Focus(area)
  }

  private func runSearch(direction SearchDirection) {
    let needle = find.Text != "" ? find.Text : lastQuery
    if needle == "" { return }
    lastQuery = needle
    message = area.Find(needle, direction) ? "" : "no match for " + needle
  }

  private func replaceOne() {
    if find.Text == "" { return }
    if area.SelectedText.ToUpperInvariant() == find.Text.ToUpperInvariant() {
      area.ReplaceSelection(swap.Text)
    }
    runSearch(SearchDirection.Forward)
  }

  private func cycleLayout() {
    if layout == EditLayout.Split { layout = EditLayout.EditorOnly }
    else if layout == EditLayout.EditorOnly { layout = EditLayout.PreviewOnly }
    else { layout = EditLayout.Split }
    applyLayout()
  }

  private func applyLayout() {
    if layout == EditLayout.Split {
      leftBox.IsVisible = true
      rightBox.IsVisible = true
      return
    }
    if layout == EditLayout.EditorOnly {
      leftBox.IsVisible = true
      rightBox.IsVisible = false
      Focus(area)
      return
    }
    leftBox.IsVisible = false
    rightBox.IsVisible = true
    Focus(doc)
  }

  private func trySave() {
    syncPreview()
    try {
      File.WriteAllText(path, area.Text)
      saved = true
      message = "saved"
    } catch (e Exception) {
      message = e.Message
    }
  }

  /// Caret line fraction mapped onto the preview's wrapped line count; approximate since
  /// block spacing (headings, tables) makes source lines and rendered lines diverge.
  private func syncScroll() {
    let line = area.Caret.LineIndex
    if line == lastCaretLine { return }
    lastCaretLine = line
    let total = lineCount > 1 ? lineCount - 1 : 1
    let previewLines = doc.LineCount()
    if previewLines <= 0 { return }
    let fraction = double(line) / double(total)
    var target = int32(fraction * double(previewLines - 1))
    if target < 0 { target = 0 }
    if target >= previewLines { target = previewLines - 1 }
    doc.ScrollToLine(target)
  }

  private func syncPreview() {
    let text = area.Text
    if text == previewSource { return }
    previewSource = text
    doc.Source = previewSource
    countWords(previewSource)
    saved = false
  }

  private func countWords(text string) {
    var lines = 1
    var words = 0
    var inWord = false
    var i = 0
    while i < text.Length {
      let c = text[i]
      if c == char(10) { lines = lines + 1 }
      let blank = c == ' ' || c == char(9) || c == char(10) || c == char(13)
      if blank {
        inWord = false
      } else if !inWord {
        inWord = true
        words = words + 1
      }
      i = i + 1
    }
    lineCount = lines
    wordCount = words
  }
}
