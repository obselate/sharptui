package SharpTui

import SharpTui

import System
import System.Collections.Generic

public class MarkdownCheck {
  shared {
    public func Run() int32 {
      var failed = 0
      let theme = MarkdownTheme()

      let heads = ParseMarkdown("# H1\n## H2\n### H3", theme)
      failed = failed + Checks.Expect(heads.Count == 3, "three heading lines produce three blocks")
      failed = failed + Checks.Expect(heads[0].Kind == BlockKind.Head1, "single # is Head1")
      failed = failed + Checks.Expect(heads[1].Kind == BlockKind.Head2, "double ## is Head2")
      failed = failed + Checks.Expect(heads[2].Kind == BlockKind.Head3, "triple ### is Head3")
      failed = failed + Checks.Expect(heads[0].Runs[0].Text == "H1", "heading text strips the marker")

      let folded = ParseMarkdown("line one\nline two\n\nline three", theme)
      failed = failed + Checks.Expect(folded.Count == 3, "blank line separates two para blocks")
      failed = failed + Checks.Expect(folded[0].Kind == BlockKind.Para, "consecutive lines fold into Para")
      failed = failed + Checks.Expect(folded[0].Runs[0].Text == "line one line two",
        "folded para joins lines with a single space")
      failed = failed + Checks.Expect(folded[1].Kind == BlockKind.Blank, "the empty line is Blank")
      failed = failed + Checks.Expect(folded[2].Runs[0].Text == "line three", "para resumes after the blank")

      let fenced = ParseMarkdown("```\n**not bold**\n```", theme)
      failed = failed + Checks.Expect(fenced.Count == 1, "a fence line pair wraps exactly one code line")
      failed = failed + Checks.Expect(fenced[0].Kind == BlockKind.Code, "fenced content is a Code block")
      failed = failed + Checks.Expect(fenced[0].Runs.Count == 1, "code line is one run, no inline parsing")
      failed = failed + Checks.Expect(fenced[0].Runs[0].Text == "**not bold**",
        "fenced code keeps its markers literal")

      let nested = ParseMarkdown("**bold with _italic_ inside**", theme)
      let ns = nested[0].Runs
      failed = failed + Checks.Expect(ns.Count == 3, "bold-then-italic nesting yields three runs")
      failed = failed + Checks.Expect(ns[0].Text == "bold with " && (int32(ns[0].Style.Attributes) & int32(TextAttributes.Bold)) != 0,
        "the leading run is bold")
      failed = failed + Checks.Expect(ns[1].Text == "italic"
        && (int32(ns[1].Style.Attributes) & int32(TextAttributes.Bold)) != 0
        && (int32(ns[1].Style.Attributes) & int32(TextAttributes.Italic)) != 0,
        "the nested run carries both bold and italic")
      failed = failed + Checks.Expect(ns[2].Text == " inside", "the trailing run resumes plain bold")

      let literal = ParseMarkdown("a * b", theme)
      failed = failed + Checks.Expect(literal[0].Runs.Count == 1 && literal[0].Runs[0].Text == "a * b",
        "an unmatched asterisk stays in the text")

      let link = ParseMarkdown("[click here](http://example.com)", theme)
      let ls = link[0].Runs
      failed = failed + Checks.Expect(ls.Count == 2 && ls[0].Text == "click here",
        "a link keeps its label text")
      failed = failed + Checks.Expect(ls[1].Text == " (http://example.com)"
        && (int32(ls[1].Style.Attributes) & int32(TextAttributes.Dim)) != 0,
        "and shows its target dimmed after it")
      failed = failed + Checks.Expect((int32(ls[0].Style.Attributes) & int32(TextAttributes.Underline)) != 0,
        "a link is underlined")

      let items = ParseMarkdown("- top\n  - nested", theme)
      failed = failed + Checks.Expect(items[0].Kind == BlockKind.Bullet && items[0].Depth == 0 && items[0].Marker == "-",
        "a top level bullet has depth 0 and captures its marker")
      failed = failed + Checks.Expect(items[1].Depth == 1, "two leading spaces is one indent level deeper")

      let tasks = ParseMarkdown("- [ ] todo\n- [x] done\n- [plain]", theme)
      failed = failed + Checks.Expect(tasks[0].Marker == char(0x2610).ToString(),
        "an unticked task swaps the bullet for an empty checkbox")
      failed = failed + Checks.Expect(tasks[0].Runs[0].Text == "todo", "the checkbox is stripped from the text")
      failed = failed + Checks.Expect(tasks[1].Marker == char(0x2611).ToString(), "a ticked task gets a full checkbox")
      failed = failed + Checks.Expect(tasks[2].Marker == "-", "a bracket that is not a checkbox stays a plain bullet")

      let numbered = ParseMarkdown("1. one", theme)
      failed = failed + Checks.Expect(numbered[0].Kind == BlockKind.Number && numbered[0].Marker == "1.",
        "a numbered item captures its number as the marker")
      failed = failed + Checks.Expect(numbered[0].Runs[0].Text == "one", "the numbered item text follows the marker")

      let table = ParseMarkdown("| a | b |\n| --- | ---: |\n| 1 | 2 |\n| 3 | 4 |", theme)
      failed = failed + Checks.Expect(table.Count == 1, "a whole table is one block")
      failed = failed + Checks.Expect(table[0].Kind == BlockKind.Table, "pipes plus a delimiter row make a Table")
      failed = failed + Checks.Expect(table[0].Marker == "lr", "the delimiter row colons set per column alignment")
      failed = failed + Checks.Expect(table[0].Cells.Count == 6, "header plus two rows of two is six cells")
      failed = failed + Checks.Expect(table[0].Cells[0][0].Text == "a", "the header cell keeps its text")
      failed = failed + Checks.Expect((int32(table[0].Cells[0][0].Style.Attributes) & int32(TextAttributes.Bold)) != 0,
        "header cells are bold")
      failed = failed + Checks.Expect(table[0].Cells[5][0].Text == "4", "the last body cell is the last row's last column")

      let ragged = ParseMarkdown("| a | b | c |\n|---|---|---|\n| 1 |", theme)
      failed = failed + Checks.Expect(ragged[0].Cells.Count == 6, "a short row is padded to the column count")
      failed = failed + Checks.Expect(ragged[0].Cells[4].Count == 0, "the padding cells are empty")

      let notTable = ParseMarkdown("| a | b |\n| c | d |", theme)
      failed = failed + Checks.Expect(notTable[0].Kind == BlockKind.Para,
        "pipes with no delimiter row stay a paragraph")

      let inlineCells = ParseMarkdown("| **x** |\n| --- |\n| `y` |", theme)
      failed = failed + Checks.Expect(inlineCells[0].Cells[1][0].Text == "y", "body cells run inline parsing")

      return failed
    }
  }
}
