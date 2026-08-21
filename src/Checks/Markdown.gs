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

      let allHeads = ParseMarkdown("# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n# closed #", theme)
      failed = failed + Checks.Expect(allHeads.Count == 7, "ATX headings cover levels one through six")
      failed = failed + Checks.Expect(allHeads[3].Kind == BlockKind.Head4
        && allHeads[4].Kind == BlockKind.Head5
        && allHeads[5].Kind == BlockKind.Head6,
        "fourth through sixth hash headings have distinct kinds")
      failed = failed + Checks.Expect(allHeads[6].Runs[0].Text == "closed", "closing heading hashes are optional syntax")
      let emptyHeading = ParseMarkdown("# #", theme)
      failed = failed + Checks.Expect(emptyHeading[0].Kind == BlockKind.Head1 && runText(emptyHeading[0].Runs) == "",
        "a closing hash can leave an empty heading")

      let indented = ParseMarkdown("    # code", theme)
      failed = failed + Checks.Expect(indented.Count == 1 && indented[0].Kind == BlockKind.Code
        && indented[0].Runs[0].Text == "# code", "four spaces make an indented code block")

      let rules = ParseMarkdown("---\n***\n___\n* * *\n- - -\n_ _ _", theme)
      failed = failed + Checks.Expect(rules.Count == 6
        && rules[0].Kind == BlockKind.Rule
        && rules[1].Kind == BlockKind.Rule
        && rules[2].Kind == BlockKind.Rule
        && rules[3].Kind == BlockKind.Rule
        && rules[4].Kind == BlockKind.Rule
        && rules[5].Kind == BlockKind.Rule,
        "common thematic break spellings make Rule blocks")

      let emptyFence = ParseMarkdown("```\n```", theme)
      failed = failed + Checks.Expect(emptyFence.Count == 1 && emptyFence[0].Kind == BlockKind.Code,
        "an empty fenced block is retained")
      let tildeFence = ParseMarkdown("~~~\n**literal**\n~~~", theme)
      failed = failed + Checks.Expect(tildeFence.Count == 1 && tildeFence[0].Kind == BlockKind.Code
        && tildeFence[0].Runs[0].Text == "**literal**", "tilde fences keep inline markers literal")

      let parenNumbers = ParseMarkdown("1) one\n2) two", theme)
      failed = failed + Checks.Expect(parenNumbers.Count == 2
        && parenNumbers[0].Kind == BlockKind.Number
        && parenNumbers[0].Marker == "1)"
        && parenNumbers[1].Marker == "2)", "ordered lists accept a closing parenthesis")
      let interrupted = ParseMarkdown("paragraph\n1. item", theme)
      failed = failed + Checks.Expect(interrupted.Count == 2
        && interrupted[0].Kind == BlockKind.Para
        && interrupted[1].Kind == BlockKind.Number,
        "an ordered list starting at one interrupts a paragraph")
      let listReference = ParseMarkdown("- item\n[id]: /url\n- next", theme)
      failed = failed + Checks.Expect(listReference.Count == 2
        && runText(listReference[0].Runs) == "item"
        && runText(listReference[1].Runs) == "next",
        "a reference definition does not fold into a list item")

      let spacedQuote = ParseMarkdown(">  > nested", theme)
      failed = failed + Checks.Expect(spacedQuote[0].Kind == BlockKind.Quote
        && spacedQuote[0].Depth == 1
        && runText(spacedQuote[0].Runs) == "nested",
        "spaces between quote markers preserve nesting")

      let hardBreak = ParseMarkdown("line one  \nline two", theme)
      failed = failed + Checks.Expect(runText(hardBreak[0].Runs) == "line one\nline two",
        "two trailing spaces preserve a hard line break")
      let escapedBreak = ParseMarkdown("line\\\\\nnext", theme)
      failed = failed + Checks.Expect(runText(escapedBreak[0].Runs) == "line\\ next",
        "an escaped trailing backslash does not make a hard break")
      let trailingSlash = ParseMarkdown("line\\", theme)
      failed = failed + Checks.Expect(runText(trailingSlash[0].Runs) == "line\\",
        "a paragraph-ending backslash stays literal")

      let underscores = ParseMarkdown("foo_bar_baz", theme)
      failed = failed + Checks.Expect(underscores[0].Runs.Count == 1 && underscores[0].Runs[0].Text == "foo_bar_baz",
        "intraword underscores stay literal")
      let whitespaceEmphasis = ParseMarkdown("a * foo* and *foo *", theme)
      failed = failed + Checks.Expect(runText(whitespaceEmphasis[0].Runs) == "a * foo* and *foo *",
        "emphasis delimiters cannot contain leading or trailing whitespace")
      let triple = ParseMarkdown("***bold italic***", theme)
      failed = failed + Checks.Expect(triple[0].Runs.Count == 1
        && (int32(triple[0].Runs[0].Style.Attributes) & int32(TextAttributes.Bold)) != 0
        && (int32(triple[0].Runs[0].Style.Attributes) & int32(TextAttributes.Italic)) != 0,
        "triple asterisks combine bold and italic")
      let mixedNesting = ParseMarkdown("*foo **bar*** baz", theme)
      failed = failed + Checks.Expect(mixedNesting[0].Runs.Count == 3
        && (int32(mixedNesting[0].Runs[0].Style.Attributes) & int32(TextAttributes.Italic)) != 0
        && (int32(mixedNesting[0].Runs[1].Style.Attributes) & int32(TextAttributes.Bold)) != 0
        && (int32(mixedNesting[0].Runs[1].Style.Attributes) & int32(TextAttributes.Italic)) != 0
        && mixedNesting[0].Runs[2].Text == " baz"
        && int32(mixedNesting[0].Runs[2].Style.Attributes) == 0,
        "a triple closing run can close nested strong emphasis")

      let styledCode = ParseMarkdown("_`code`_", theme)
      failed = failed + Checks.Expect((int32(styledCode[0].Runs[0].Style.Attributes) & int32(TextAttributes.Italic)) != 0,
        "inline code keeps enclosing emphasis")
      let styledAuto = ParseMarkdown("*<https://example.com>*", theme)
      failed = failed + Checks.Expect((int32(styledAuto[0].Runs[0].Style.Attributes) & int32(TextAttributes.Italic)) != 0,
        "autolinks keep enclosing emphasis")

      let escaped = ParseMarkdown("\\*literal\\* \\[link\\] \\_word\\_", theme)
      failed = failed + Checks.Expect(runText(escaped[0].Runs) == "*literal* [link] _word_",
        "backslash escapes suppress inline markers")
      let codeSpan = ParseMarkdown("``code ` span``", theme)
      failed = failed + Checks.Expect(codeSpan[0].Runs.Count == 1
        && codeSpan[0].Runs[0].Text == "code ` span",
        "matching multi-backtick delimiters form one code span")

      let validRef = ParseMarkdown("[one][id]\n\n[id]: https://example.com", theme)
      failed = failed + Checks.Expect(validRef[0].Runs.Count > 0
        && validRef[0].Runs[0].Text == "one"
        && (int32(validRef[0].Runs[0].Style.Attributes) & int32(TextAttributes.Underline)) != 0,
        "a defined reference link is styled as a link")
      let missingRef = ParseMarkdown("[one][missing]", theme)
      failed = failed + Checks.Expect(missingRef[0].Runs.Count == 1
        && missingRef[0].Runs[0].Text == "[one][missing]",
        "a missing reference stays literal")
      let shortcutRef = ParseMarkdown("[one]\n\n[one]: /url", theme)
      failed = failed + Checks.Expect(shortcutRef[0].Runs.Count > 0
        && shortcutRef[0].Runs[0].Text == "one"
        && (int32(shortcutRef[0].Runs[0].Style.Attributes) & int32(TextAttributes.Underline)) != 0,
        "a defined shortcut reference is styled as a link")

      let balancedLink = ParseMarkdown("[docs](https://example.com/a_(b) \"title\")", theme)
      failed = failed + Checks.Expect(balancedLink[0].Runs.Count == 2
        && balancedLink[0].Runs[0].Text == "docs"
        && balancedLink[0].Runs[1].Text == " (https://example.com/a_(b))",
        "inline link destinations balance nested parentheses and titles")
      let brokenImage = ParseMarkdown("![alt](broken", theme)
      failed = failed + Checks.Expect(brokenImage[0].Runs.Count == 1 && brokenImage[0].Runs[0].Text == "![alt](broken",
        "an unterminated image stays literal")
      let email = ParseMarkdown("<foo@example.com>", theme)
      failed = failed + Checks.Expect(email[0].Runs.Count == 1
        && email[0].Runs[0].Text == "foo@example.com"
        && (int32(email[0].Runs[0].Style.Attributes) & int32(TextAttributes.Underline)) != 0,
        "an email autolink keeps its address and link style")
      let schemeLink = ParseMarkdown("<ftp://ftp.example.com>", theme)
      failed = failed + Checks.Expect(schemeLink[0].Runs[0].Text == "ftp://ftp.example.com"
        && (int32(schemeLink[0].Runs[0].Style.Attributes) & int32(TextAttributes.Underline)) != 0,
        "a valid URI scheme forms an autolink")
      let spacedLink = ParseMarkdown("<http://foo bar>", theme)
      failed = failed + Checks.Expect(runText(spacedLink[0].Runs) == "<http://foo bar>",
        "whitespace keeps angle-bracketed text from becoming an autolink")
      let entities = ParseMarkdown("&#38; &copy;", theme)
      failed = failed + Checks.Expect(runText(entities[0].Runs) == "& " + char(0x00A9).ToString(),
        "numeric and named entities decode to terminal text")

      let plainTable = ParseMarkdown("a | b\n--- | ---\n1 | 2", theme)
      failed = failed + Checks.Expect(plainTable.Count == 1 && plainTable[0].Kind == BlockKind.Table
        && plainTable[0].Cells.Count == 4
        && plainTable[0].Cells[0][0].Text == "a"
        && plainTable[0].Cells[3][0].Text == "2",
        "pipe tables work without leading pipes")
      let pipeTable = ParseMarkdown("| a\\|b | `c|d` |\n| --- | --- |\n| e\\|f | ``g|h`` |", theme)
      failed = failed + Checks.Expect(pipeTable.Count == 1 && pipeTable[0].Kind == BlockKind.Table
        && pipeTable[0].Cells.Count == 4
        && pipeTable[0].Cells[0][0].Text == "a|b"
        && pipeTable[0].Cells[1][0].Text == "c|d"
        && pipeTable[0].Cells[3][0].Text == "g|h",
        "escaped and code-span pipes stay inside table cells")

      return failed
    }

    private func runText(runs List[TextRun]) string {
      var out = ""
      for run in runs { out = out + run.Text }
      return out
    }
  }
}
