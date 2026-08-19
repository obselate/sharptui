package SharpTui

import SharpTui

import System
import System.Collections.Generic

func editorRoot(area TextArea, width int32, height int32) Box {
  let root = Box{ Children: { area } }
  root.Draw(Screen(width, height))
  root.Focus(area)
  return root
}

public class DataCheck {
  shared {
    public func Run() int32 {
      var failed = 0

      failed = failed + Checks.Expect(LangOf("rust,ignore") == "rust", "the fence lang stops at a comma")
      failed = failed + Checks.Expect(LangOf("rust	ignore") == "rust", "the fence lang stops at a tab")
      failed = failed + Checks.Expect(LangOf("js title=foo") == "js", "the fence lang stops at a space")
      failed = failed + Checks.Expect(LangOf("GS") == "gs", "the fence lang is lowercased")
      failed = failed + Checks.Expect(LangOf("") == "", "an empty fence has no lang")

      let base = Style{ Foreground: Color.Rgb("C8CEDA"), Background: Color.TerminalDefault }
      failed = failed + Checks.Expect(rejoin("let x = \"hi\" // note", "gs", base)
        == "let x = \"hi\" // note", "c-like highlighting round trips")
      let shell = "echo " + char(36).ToString() + "HOME # go"
      failed = failed + Checks.Expect(rejoin(shell, "sh", base) == shell,
        "shell highlighting round trips")
      failed = failed + Checks.Expect(rejoin("{ \"a\": 1, \"b\": null }", "json", base)
        == "{ \"a\": 1, \"b\": null }", "json highlighting round trips")
      let jsonTabKey = HighlightCode("{ \"key\"	: 1 }", "json", base)
      failed = failed + Checks.Expect(hasColor(asRuns(jsonTabKey), Color.Rgb("478AD1")),
        "a json key before a tabbed colon is coloured")
      failed = failed + Checks.Expect(rejoin("日本語 = 12 # 語", "py", base)
        == "日本語 = 12 # 語", "wide characters round trip")
      failed = failed + Checks.Expect(rejoin("", "gs", base) == "", "an empty line round trips")

      let spans = HighlightCode("let x = 1 // c", "gs", base)
      failed = failed + Checks.Expect(spans.Count > 1, "a c-like line splits into runs")
      failed = failed + Checks.Expect(hasColor(asRuns(spans), Color.Rgb("555C6B")), "the comment is dimmed")
      failed = failed + Checks.Expect(hasColor(asRuns(spans), Color.Rgb("D1A047")), "the number is coloured")
      let unterminated = HighlightCode("let a = 1 /* never closes", "gs", base)
      failed = failed + Checks.Expect(hasColor(asRuns(unterminated), Color.Rgb("555C6B")),
        "an unterminated c-like comment is coloured")

      let fenced = ParseMarkdown("```go\nfunc main() {}\n```", MarkdownTheme())
      failed = failed + Checks.Expect(fenced.Count == 1, "the fence pair wraps one code line")
      failed = failed + Checks.Expect(fenced[0].Marker == "go", "the block remembers its language")

      let comment = HighlightBlock(twoLines("let a = 1 /* start", "still comment */ let b = 2"), "gs", base)
      failed = failed + Checks.Expect(hasColor(asRuns(comment[1]), Color.Rgb("555C6B")), "the comment carries to the next line")
      failed = failed + Checks.Expect(hasColor(asRuns(comment[1]), Color.Rgb("B47FD1")), "and the code after it goes back to normal")
      let quotedComment = HighlightBlock(twoLines("let s = \"/*\"", "let b = 2"), "gs", base)
      failed = failed + Checks.Expect(!hasColor(asRuns(quotedComment[1]), Color.Rgb("555C6B")),
        "a c-like marker in a string does not carry a comment")
      let reopened = HighlightBlock(threeLines("/* open", "still */ let x = 1 /* reopen", "still comment"), "gs", base)
      failed = failed + Checks.Expect(hasColor(asRuns(reopened[2]), Color.Rgb("555C6B")),
        "a comment can reopen after closing on a continuation line")

      let pydoc = HighlightBlock(twoLines("x = \"\"\"open", "still string\"\"\""), "py", base)
      failed = failed + Checks.Expect(hasColor(asRuns(pydoc[1]), Color.Rgb("6CBC5F")), "a docstring carries to the next line")
      let pyComment = HighlightBlock(twoLines("# \"\"\"", "x = 1"), "py", base)
      failed = failed + Checks.Expect(!hasColor(asRuns(pyComment[1]), Color.Rgb("6CBC5F")),
        "a triple quote in a python comment does not carry a string")
      let luaComment = HighlightBlock(twoLines("-- /*", "local x = 1"), "lua", base)
      failed = failed + Checks.Expect(!hasColor(asRuns(luaComment[1]), Color.Rgb("555C6B")),
        "a block marker in a lua comment does not carry a comment")

      let steady = HighlightBlock(twoLines("let a = 1", "let b = 2"), "gs", base)
      failed = failed + Checks.Expect(!hasColor(asRuns(steady[1]), Color.Rgb("555C6B")), "an ordinary line is untouched")

      let publicLines = twoLines("let a = 1 /* start", "still comment */ let b = 2")
      let publicRuns = SyntaxHighlighter.HighlightLines(publicLines, "GS", base)
      failed = failed + Checks.Expect(SyntaxHighlighter.Supports("GS")
          && !SyntaxHighlighter.Supports("txt"),
        "the public syntax highlighter reports explicit language support")
      failed = failed + Checks.Expect(flat(publicRuns)
          == "let a = 1 /* start\nstill comment */ let b = 2",
        "the public syntax highlighter preserves physical lines")
      failed = failed + Checks.Expect(hasColor(publicRuns, Color.Rgb("555C6B"))
          && hasColor(publicRuns, Color.Rgb("B47FD1")),
        "the public syntax highlighter preserves multiline state")

      let lazyLines = threeLines("/* open", "still open", "close */ let x = 1")
      let lazy = SyntaxLineSource(lazyLines, "gs", base)
      failed = failed + Checks.Expect(lazy.CachedLineCount() == 0,
        "the lazy syntax source does not tokenize during construction")
      lazyLines.Add("caller mutation")
      let lazyTail = lazy.ItemAt(2)
      failed = failed + Checks.Expect(lazy.Count() == 3
          && lazy.CachedLineCount() == 1
          && hasColor(lazyTail.Runs, Color.Rgb("555C6B"))
          && hasColor(lazyTail.Runs, Color.Rgb("B47FD1")),
        "the lazy syntax source owns its input snapshot and reaches arbitrary multiline state")
      let plainSource = SyntaxHighlighter.CreateLineSource(twoLines("# plain 12", "tail"), "txt", base)
      failed = failed + Checks.Expect(plainSource.ItemAt(0).Runs.Count == 1
          && plainSource.ItemAt(0).Runs[0].Style.Foreground == base.Foreground,
        "unsupported lazy sources preserve the base style")

      let mutableRuns = List[TextRun]{ TextRun("fixed", base) }
      let fixedLine = RichTextLine(mutableRuns)
      mutableRuns[0] = TextRun("changed", Style())
      mutableRuns.Add(TextRun("extra", Style()))
      failed = failed + Checks.Expect(fixedLine.Runs.Count == 1
          && fixedLine.Runs[0].Text == "fixed"
          && fixedLine.WidthCells == 5,
        "RichTextLine owns its input snapshot and keeps cached widths consistent")

      let doc = MarkdownView{ Source: "| a | b |\n| - | - |\n| one two three four five six | y |" }
      let docRoot = Box{ Children: { doc } }
      docRoot.Draw(Screen(24, 12))
      failed = failed + Checks.Expect(doc.LineCount() > 4, "an overlong table cell wraps to more lines")

      let wide = MarkdownView{
        Source: "```\nalpha beta gamma delta epsilon zeta eta\n```",
        MaximumLineWidth: CellLength.Cells(8),
      }
      let wideRoot = Box{ Children: { wide } }
      wideRoot.Draw(Screen(20, 12))
      failed = failed + Checks.Expect(wide.LineCount() > 1, "MaximumLineWidth constrains code wrapping")

      let source = MarkdownView{ Source: "one" }
      let sourceRoot = Box{ Children: { source } }
      sourceRoot.Draw(Screen(4, 4))
      source.Source = "one two four"
      sourceRoot.Draw(Screen(4, 4))
      failed = failed + Checks.Expect(source.LineCount() == 4, "MarkdownView invalidates when Source changes")

      let links = ParseMarkdown("see [one][r] then ![pic](p.png) and [two](u)", MarkdownTheme())
      failed = failed + Checks.Expect(flat(links[0].Runs) == "see one then pic and two (u)",
        "reference links, images and inline links each stop at their own end")
      failed = failed + Checks.Expect(flat(ParseMarkdown("[http://x](http://x) and [top](#top)", MarkdownTheme())[0].Runs)
        == "http://x and top", "a redundant target and an anchor stay hidden")
      failed = failed + Checks.Expect(flat(ParseMarkdown("[![build](i.svg)](ci)", MarkdownTheme())[0].Runs)
        == "build (ci)", "a badge shows its alt text and the link it wraps")

      let wrapped = ParseMarkdown("- first line\n  second line\n- next\n\ntail", MarkdownTheme())
      failed = failed + Checks.Expect(wrapped[0].Kind == BlockKind.Bullet, "the item is a bullet")
      failed = failed + Checks.Expect(flat(wrapped[0].Runs) == "first line second line",
        "the continuation folds into the item")
      failed = failed + Checks.Expect(wrapped[1].Kind == BlockKind.Bullet, "the next bullet still starts")
      failed = failed + Checks.Expect(flat(wrapped[3].Runs) == "tail",
        "a blank line ends the item so the paragraph stays separate")

      let defs = ParseMarkdown("body\n\n[r]: http://example.com", MarkdownTheme())
      failed = failed + Checks.Expect(flat(defs[0].Runs) == "body", "the paragraph survives")
      failed = failed + Checks.Expect(blockText(defs) == "body",
        "a reference definition is not rendered as content")

      let setext = ParseMarkdown("Title\n=====\n\nBody\n-----", MarkdownTheme())
      failed = failed + Checks.Expect(setext[0].Kind == BlockKind.Head1 && flat(setext[0].Runs) == "Title",
        "an equals underline makes a level one heading")
      failed = failed + Checks.Expect(setext[2].Kind == BlockKind.Head2 && flat(setext[2].Runs) == "Body",
        "a dash underline makes a level two heading")

      let ruled = ParseMarkdown("a\n\n---\n", MarkdownTheme())
      failed = failed + Checks.Expect(ruled[2].Kind == BlockKind.Rule, "a dash run alone is still a rule")

      let nested = ParseMarkdown("> one\n> > deep", MarkdownTheme())
      failed = failed + Checks.Expect(nested[0].Depth == 0 && flat(nested[0].Runs) == "one",
        "a plain quote is depth zero")
      failed = failed + Checks.Expect(nested[1].Depth == 1 && flat(nested[1].Runs) == "deep",
        "a doubled marker nests the quote one level")

      let html = ParseMarkdown("<div align=\"center\">\n\ntext", MarkdownTheme())
      failed = failed + Checks.Expect(blockText(html) == "text", "an html block line is dropped")
      failed = failed + Checks.Expect(
        blockText(ParseMarkdown("<p align=\"center\">a tagline</p>", MarkdownTheme())) == "a tagline",
        "markup wrapped around text keeps the text")
      let tags = ParseMarkdown("a <br> b <http://x.y> c", MarkdownTheme())
      failed = failed + Checks.Expect(flat(tags[0].Runs) == "a  b http://x.y c",
        "an inline tag is stripped and an autolink keeps its url")
      failed = failed + Checks.Expect(flat(ParseMarkdown("2 < 3 and 4 > 1", MarkdownTheme())[0].Runs) == "2 < 3 and 4 > 1",
        "a literal less than is not markup")

      let indented = ParseMarkdown("text\n\n    code here\n\n- a\n  - deep", MarkdownTheme())
      failed = failed + Checks.Expect(indented[2].Kind == BlockKind.Code && flat(indented[2].Runs) == "code here",
        "four spaces after a blank line is a code block")
      failed = failed + Checks.Expect(indented[4].Kind == BlockKind.Bullet && indented[5].Depth == 1,
        "an indented list item is still a list item")

      let patch = HighlightCode("-  gone", "diff", base)
      failed = failed + Checks.Expect(hasColor(asRuns(patch), Color.Rgb("C96C6C")), "a removed diff line is red")
      failed = failed + Checks.Expect(hasColor(asRuns(HighlightCode("+  new", "diff", base)), Color.Rgb("6CBC5F")),
        "an added diff line is green")
      failed = failed + Checks.Expect(hasColor(asRuns(HighlightCode("--- a/x", "diff", base)), Color.Rgb("B47FD1")),
        "a file header is not read as a removal")
      failed = failed + Checks.Expect(hasColor(asRuns(HighlightCode("@@ -1 +1 @@", "diff", base)), Color.Rgb("478AD1")),
        "a hunk header stands out")
      failed = failed + Checks.Expect(rejoin("-  gone", "diff", base) == "-  gone",
        "diff highlighting round trips")

      failed = failed + Checks.Expect(hasColor(asRuns(HighlightCode("fun f() // c", "kotlin", base)), Color.Rgb("555C6B")),
        "kotlin highlights as c-like")
      failed = failed + Checks.Expect(hasColor(asRuns(HighlightCode("x = 1 # c", "ruby", base)), Color.Rgb("555C6B")),
        "ruby highlights as shell-like")
      failed = failed + Checks.Expect(hasColor(asRuns(HighlightCode("key = 1 # c", "conf", base)), Color.Rgb("555C6B")),
        "a conf file highlights as keyed")
      failed = failed + Checks.Expect(hasColor(asRuns(HighlightCode("select 1 -- c", "sql", base)), Color.Rgb("555C6B")),
        "a double dash comments a sql line")
      failed = failed + Checks.Expect(!hasColor(asRuns(HighlightCode("i--; x = 1", "c", base)), Color.Rgb("555C6B")),
        "a decrement is not a comment in c")

      failed = failed + editing()
      return failed
    }

    private func editing() int32 {
      var failed = 0
      let ta = TextArea()
      ta.Text = "日本語\nabc"
      let taRoot = editorRoot(ta, 20, 6)

      taRoot.Handle(arrow(Key.Right, true))
      taRoot.Handle(arrow(Key.Right, true))
      failed = failed + Checks.Expect(ta.HasSelection, "shift and an arrow starts a selection")
      failed = failed + Checks.Expect(ta.SelectedText == "日本", "the selection is two wide clusters")

      taRoot.Handle(ctrl("x"))
      failed = failed + Checks.Expect(ta.Text.StartsWith("語"), "cut removes exactly the selected clusters")
      failed = failed + Checks.Expect(!ta.HasSelection, "cut drops the selection")

      taRoot.Handle(ctrl("v"))
      failed = failed + Checks.Expect(ta.Text.StartsWith("日本語"), "paste puts them back at the cursor")

      failed = failed + Checks.Expect(ta.Undo(), "undo has something to undo")
      failed = failed + Checks.Expect(ta.Text.StartsWith("語"), "undo walks back one edit")
      failed = failed + Checks.Expect(ta.Redo() && ta.Text.StartsWith("日本語"), "redo walks forward again")

      let typed = TextArea()
      typed.Text = ""
      let typedRoot = editorRoot(typed, 20, 6)
      typedRoot.Handle(charEv("a"))
      typedRoot.Handle(charEv("é"))
      typedRoot.Handle(charEv("語"))
      failed = failed + Checks.Expect(typed.Text == "aé語", "typing appends whole clusters")
      failed = failed + Checks.Expect(typed.Caret.GraphemeIndex == 3, "the cursor counts clusters, not chars")
      failed = failed + Checks.Expect(typed.Undo(), "the typed run undoes")
      failed = failed + Checks.Expect(typed.Text == "", "a run of typing undoes as one edit")

      typed.Redo()
      typedRoot.Handle(keyEv(Key.Enter))
      typedRoot.Handle(charEv("z"))
      typed.Undo()
      failed = failed + Checks.Expect(typed.Text == "aé語\n",
        "undo after a split leaves the split alone")

      let hay = TextArea()
      hay.Text = "alpha BETA\ngamma 日本語\nbeta again"
      let hayRoot = editorRoot(hay, 20, 6)
      failed = failed + Checks.Expect(hay.Find("beta", SearchDirection.Forward), "find locates a case folded match")
      failed = failed + Checks.Expect(hay.Caret.LineIndex == 0 && hay.SelectedText == "BETA",
        "the match is marked where it was found")
      failed = failed + Checks.Expect(hay.Find("beta", SearchDirection.Forward) && hay.Caret.LineIndex == 2,
        "a second find moves on to the next match")
      failed = failed + Checks.Expect(hay.Find("beta", SearchDirection.Forward) && hay.Caret.LineIndex == 0,
        "find wraps back to the first match")
      failed = failed + Checks.Expect(hay.Find("日本", SearchDirection.Forward)
        && hay.Caret.LineIndex == 1 && hay.Caret.GraphemeIndex == 8,
        "find counts clusters, not chars")
      failed = failed + Checks.Expect(!hay.Find("nothing here", SearchDirection.Forward), "a miss reports false")

      failed = failed + Checks.Expect(hay.Find("日本", SearchDirection.Forward) && hay.ReplaceSelection("ko"),
        "replace consumes the marked hit")
      failed = failed + Checks.Expect(hay.Text.Contains("gamma ko語"), "replace swaps exactly the match")
      failed = failed + Checks.Expect(!hay.ReplaceSelection("x"), "replace without a selection reports false")
      failed = failed + Checks.Expect(hay.Undo() && hay.Text.Contains("gamma 日本語"),
        "replace undoes as one edit")

      let wide = TextArea()
      wide.Text = "日本語日本語日本語日本語"
      let wideRoot = editorRoot(wide, 12, 3)
      failed = failed + Checks.Expect(wide.HorizontalCellOffset == 0, "a cursor at the start does not pan")
      wideRoot.Handle(keyEv(Key.End))
      wideRoot.Draw(Screen(12, 3))
      failed = failed + Checks.Expect(wide.HorizontalCellOffset > 0, "End on a long line pans to the cursor")
      let panned = Screen(12, 3)
      wideRoot.Draw(panned)
      failed = failed + Checks.Expect(panned.Probe(11, 0) != "", "the panned line reaches the last cell")

      let words = TextArea()
      words.Text = "日本 語  tail"
      let wordsRoot = editorRoot(words, 30, 4)
      wordsRoot.Handle(ctrlArrow(Key.Right))
      failed = failed + Checks.Expect(words.Caret.GraphemeIndex == 3, "ctrl right lands on the next word")
      wordsRoot.Handle(ctrlArrow(Key.Right))
      failed = failed + Checks.Expect(words.Caret.GraphemeIndex == 6, "and skips the run of spaces after it")
      wordsRoot.Handle(ctrlArrow(Key.Left))
      failed = failed + Checks.Expect(words.Caret.GraphemeIndex == 3, "ctrl left walks back to the word start")

      let source = "one two three four five six seven eight nine ten"
      let soft = TextArea{ Wrapping: TextWrapping.Word }
      soft.Text = source
      let softRoot = editorRoot(soft, 20, 6)
      let softScreen = Screen(20, 6)
      softRoot.Draw(softScreen)
      failed = failed + Checks.Expect(softScreen.Probe(2, 1) != " ", "a long line wraps to more screen rows")
      failed = failed + Checks.Expect(soft.Text == source, "wrapping never edits the buffer")

      softRoot.Handle(keyEv(Key.Down))
      failed = failed + Checks.Expect(soft.Caret.LineIndex == 0 && soft.Caret.GraphemeIndex > 0,
        "down walks to the next screen row inside the same line")
      softRoot.Handle(keyEv(Key.Up))
      failed = failed + Checks.Expect(soft.Caret.LineIndex == 0 && soft.Caret.GraphemeIndex == 0,
        "up walks back again")

      softRoot.Handle(keyEv(Key.Down))
      softRoot.Handle(keyEv(Key.End))
      let whole = CellText.Graphemes(soft.Text).Count
      failed = failed + Checks.Expect(soft.Caret.GraphemeIndex > 0 && soft.Caret.GraphemeIndex < whole,
        "End stops at the end of the screen row, not the line")
      softRoot.Handle(keyEv(Key.Home))
      failed = failed + Checks.Expect(soft.Caret.GraphemeIndex > 0, "Home stops at the start of the screen row")
      softRoot.Handle(keyEv(Key.Up))
      softRoot.Handle(keyEv(Key.Home))
      failed = failed + Checks.Expect(soft.Caret.GraphemeIndex == 0, "Home on the first row is still the line start")

      failed = failed + Checks.Expect(soft.Find("nine", SearchDirection.Forward) && soft.SelectedText == "nine",
        "find still marks the match on a wrapped line")
      softRoot.Handle(keyEv(Key.End))
      failed = failed + Checks.Expect(soft.Find("seven", SearchDirection.Forward) && soft.ReplaceSelection("7"),
        "replace still consumes the hit after a visual End")
      failed = failed + Checks.Expect(soft.Text.Contains("six 7 eight"),
        "and swaps exactly the match")

      softRoot.Handle(UiEvent{
        Kind: UiEventKind.Mouse,
        Mouse: MouseKind.Press,
        Position: CellPoint{ Column: 3, Row: 1 },
      })
      failed = failed + Checks.Expect(soft.Caret.LineIndex == 0 && soft.Caret.GraphemeIndex > 0,
        "a click on a wrapped row maps back into its line")

      let multi = TextArea()
      multi.Text = "one\ntwo\nthree"
      let multiRoot = editorRoot(multi, 20, 6)
      multiRoot.Handle(keyEv(Key.Down))
      multiRoot.Handle(arrow(Key.Down, true))
      multiRoot.Handle(arrow(Key.Right, true))
      failed = failed + Checks.Expect(multi.SelectedText == "two\nt", "a selection spans the line break")
      multiRoot.Handle(keyEv(Key.Backspace))
      failed = failed + Checks.Expect(multi.Text == "one\nhree", "deleting a spanning selection joins lines")

      return failed
    }

    private func arrow(key Key, shift bool) UiEvent {
      return UiEvent{
        Kind: UiEventKind.Key,
        Key: key,
        Modifiers: shift ? KeyModifiers.Shift : KeyModifiers.None,
      }
    }

    private func ctrlArrow(key Key) UiEvent {
      return UiEvent{ Kind: UiEventKind.Key, Key: key, Modifiers: KeyModifiers.Ctrl }
    }

    private func ctrl(text string) UiEvent {
      return UiEvent{
        Kind: UiEventKind.TextInput,
        Key: Key.Character,
        Text: text,
        Modifiers: KeyModifiers.Ctrl,
      }
    }

    private func rejoin(line string, lang string, base Style) string {
      var out = ""
      for s in HighlightCode(line, lang, base) { out = out + s.Text }
      return out
    }

    private func twoLines(a string, b string) List[string] {
      let out = List[string]()
      out.Add(a)
      out.Add(b)
      return out
    }
    private func threeLines(a string, b string, c string) List[string] {
      let out = List[string]()
      out.Add(a)
      out.Add(b)
      out.Add(c)
      return out
    }

    private func flat(runs List[TextRun]) string {
      var out = ""
      for run in runs { out = out + run.Text }
      return out
    }

    private func blockText(blocks List[Block]) string {
      var out = ""
      for block in blocks { out = out + flat(block.Runs) }
      return out
    }

    private func hasColor(runs IReadOnlyList[TextRun], foreground Color) bool {
      for run in runs {
        if run.Style.Foreground == foreground { return true }
      }
      return false
    }
  }
}
