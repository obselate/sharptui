# Text and rich content

Text has three shapes: display, single-line input, and multi-line editing. Pick the narrowest shape. The complete member list is in [the reference](reference.md).

## Choose the surface

| Need | Type | Rule |
| --- | --- | --- |
| Static wrapped text | `TextBlock` | Use `TextWrapping.Word` unless horizontal panning is deliberate. |
| One editable value | `TextInput` | Keep the label outside the field. `Placeholder` is empty-state text, not a label. |
| Plain-text document | `TextArea` | Keep selection, caret, search, and undo in the editor. |
| Styled generated output | `RichTextBlock` | Build `TextRun` values or supply a `RichLineSource`. |
| Markdown document | `MarkdownView` | Set `Source` and a `MarkdownTheme`. Do not pre-render Markdown as plain text. |
| Source preview | `SyntaxHighlighter` | Ask `Supports` before relying on a language name. |

## Text blocks

No manual line splitting for ordinary prose. `TextBlock` wraps and has an explicit wrapped-line viewport.

```gsharp
let notice = TextBlock{
  Text: "The operation completed. Review the output before you close this panel.",
  Wrapping: TextWrapping.Word,
  ShowScrollbar: true,
}

notice.ScrollToLine(0)
```

`TextWrapping.None` preserves explicit lines. `TextWrapping.Word` wraps at word boundaries within the available width. `TextBlock.FirstVisibleLine` reports the top wrapped line. It is read-only.

## Single-line input

`TextInput` is indexed by grapheme cluster, not byte or UTF-16 offset. Set `CaretGraphemeIndex` only with a cluster index. The control clamps it to the current text bounds.

```gsharp
let filter = TextInput{
  Placeholder: "filter files",
  PlaceholderStyle: Style{ Foreground: Color.Rgb("6B7280"), Background: Color.Inherit },
  GrowWeight: 1,
}

filter.Text = "report"
filter.MoveCaretToEnd()
```

`MoveCaretToStart()` and `MoveCaretToEnd()` move to the two text endpoints. `IsPassword` changes rendering to bullets. It does not protect the value in `Text`.

### Input rules

- Don't use `Placeholder` as the only prompt. A placeholder disappears when a value exists.
- Don't slice `Text` with the caret index. The index counts grapheme clusters.
- Don't echo active editor input through a separate status label. Let the focused `TextInput` render it.

## Text areas

`TextArea` owns a multi-line document, a grapheme-indexed `Caret`, selection, undo, redo, and search. Set `Text` to load a document. That resets the caret and clears undo history.

```gsharp
let editor = TextArea{
  Text: "one\ntwo\nthree",
  Wrapping: TextWrapping.Word,
  SelectedTextStyle: Style{ Foreground: Color.Rgb("FFFFFF"), Background: Color.Rgb("2563EB") },
}

if editor.Find("two", SearchDirection.Forward) {
  editor.ReplaceSelection("second")
}
```

| State | Meaning |
| --- | --- |
| `Caret` | A `TextPosition` with zero-based `LineIndex` and `GraphemeIndex`. Setting it scrolls the caret into view. |
| `Selection` | A read-only optional `TextSelection` with `Start` and `End` positions. |
| `SelectedText` | The selected text, or an empty string. |
| `HasSelection` | True only while a selection exists. |
| `IsModified` | True after an edit since the last `Text` assignment. |
| `FirstVisibleRowIndex` | The top visible visual row. Negative assignments clamp to zero. |
| `HorizontalCellOffset` | The horizontal scroll offset when wrapping is `None`. |

`Find` searches from the caret, wraps around the document, and marks the first match. It returns false for an empty or missing needle. `SearchDirection.Forward` and `SearchDirection.Backward` select the direction. `ReplaceSelection`, `Undo`, and `Redo` report whether they changed editor state.

### Editor rules

- Don't mutate the document after every paint. Mutate it from input or application state.
- Don't assume a selection exists. Check `HasSelection` or the result of `ReplaceSelection`.
- Don't use horizontal panning with `TextWrapping.Word`. The offset belongs to `TextWrapping.None`.

## Rich lines

`TextRun` is one immutable text-and-style pair. `RichTextLine` groups runs for one logical line. `RichLineSource` supplies indexed rich lines without retaining all output in the block.

```gsharp
let output = RichTextBlock{
  Runs: {
    TextRun("PASS ", Style{ Foreground: Color.Rgb("16A34A"), Background: Color.Inherit }),
    TextRun("42 checks", Style{ Foreground: Color.Rgb("E5E7EB"), Background: Color.Inherit }),
  },
  Wrapping: TextWrapping.Word,
}

let runs = output.Runs
runs.Add(TextRun("\nready", Style{}))
output.Runs = runs
output.ScrollToEnd()
```

Set `Runs` for an owned run list. Use `AppendRuns`, `PrependRuns`, `RemoveHeadRuns`, and `RemoveTailRuns` for retained output. Set `LineSource` when an indexed source can answer `Count`, `ItemAt`, and `MaximumLineWidth`; it replaces the owned-run presentation. `ShowLineNumbers`, `GutterStyle`, and `HorizontalCellOffset` control the viewport.

## Markdown and syntax

`MarkdownView` owns parsing and wrapped layout. `Source` or `Theme` invalidates its cache. `MaximumLineWidth` limits a wrapped line before centering; `CellLength.Auto` uses the available width.

```gsharp
let theme = MarkdownTheme{
  Body: Style{ Foreground: Color.Rgb("E5E7EB"), Background: Color.Inherit },
  Heading: Style{ Foreground: Color.Rgb("2563EB"), Background: Color.Inherit },
  Code: Style{ Foreground: Color.Rgb("F59E0B"), Background: Color.Inherit },
}

let preview = MarkdownView{
  Source: "# Report\n\n`done`",
  Theme: theme,
  ShowScrollbar: true,
}
```

`MarkdownTheme` separates `Body`, `Heading`, `Code`, `Link`, `Marker`, and `Quote` styles. Parsing adds bold to headings and underline to links. `SyntaxHighlighter.CreateLineSource(lines, language, baseStyle)` creates a `RichLineSource`. `HighlightLines` returns `TextRun` values. `Supports(language)` is the capability check.

For exhaustive signatures, see [reference.md](reference.md#sharptuitextblock), [the text-area entry](reference.md#sharptuitextarea), and [the rich-content entries](reference.md#sharptuirichtextblock).
