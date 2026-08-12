package SharpTui

import System
import System.Collections.Generic

internal enum BlockKind { Para, Head1, Head2, Head3, Bullet, Number, Quote, Code, Rule, Table, Blank }

/// One block of a parsed document: its kind, styled spans, list depth and marker.
internal class Block {
  public var Kind BlockKind
  public var Runs List[TextRun]
  public var Depth int32
  /// The list bullet or number, or for a Table one alignment letter per column.
  public var Marker string
  /// Table cells, row major, header first. Column count is Marker.Length.
  public var Cells List[List[TextRun]]

  public init() {
    Kind = BlockKind.Blank
    Runs = List[TextRun]()
    Depth = 0
    Marker = ""
    Cells = List[List[TextRun]]()
  }
}

/// The styles a markdown view uses when it parses source.
public open class MarkdownTheme {
  /// Style applied to plain paragraph and list-item text.
  public prop Body Style { get; set; }
  /// Style applied to headings; parsing adds bold on top of it.
  public prop Heading Style { get; set; }
  /// Style applied to inline code spans and fenced code blocks; syntax
  /// highlighting layers token colors on top of it.
  public prop Code Style { get; set; }
  /// Style applied to blockquote text.
  public prop Quote Style { get; set; }
  /// Style applied to link text and image alt text; parsing adds underline.
  public prop Link Style { get; set; }
  /// Style associated with list bullets, numbers, and table markers.
  public prop Marker Style { get; set; }

  /// Creates a theme with every style defaulted to Style().
  public init() {
    Body = Style()
    Heading = Style()
    Code = Style()
    Quote = Style()
    Link = Style()
    Marker = Style()
  }
}

/// Parses a markdown source string into a flat list of blocks. No wrapping,
/// no widths: the viewer does that with the spans this returns.
internal func ParseMarkdown(source string, theme MarkdownTheme) List[Block] {
  let blocks = List[Block]()
  let para = List[string]()
  let fence = List[string]()
  var inFence = false
  var fenceLang = ""
  let rows = joinItems(source)

  var at = 0
  while at < rows.Count {
    let line = rows[at].TrimEnd('\r')
    let trimmed = line.Trim()
    at = at + 1

    if inFence {
      if trimmed.StartsWith("```") {
        inFence = false
        flushFence(fence, fenceLang, blocks, theme)
        continue
      }
      fence.Add(line)
      continue
    }

    if trimmed.StartsWith("```") {
      flushPara(para, blocks, theme)
      inFence = true
      fenceLang = LangOf(trimmed.Substring(3))
      continue
    }

    if trimmed == "" {
      flushPara(para, blocks, theme)
      blocks.Add(Block{ Kind: BlockKind.Blank })
      continue
    }

    let under = setextLevel(trimmed)
    if under > 0 && para.Count > 0 {
      let text = String.Join(" ", para)
      para.Clear()
      var sk = BlockKind.Head1
      if under == 2 { sk = BlockKind.Head2 }
      blocks.Add(inlineBlock(sk, text, theme.Heading.WithAttributes(TextAttributes.Bold), theme, 0, ""))
      continue
    }

    if trimmed == "---" || trimmed == "***" {
      flushPara(para, blocks, theme)
      blocks.Add(Block{ Kind: BlockKind.Rule })
      continue
    }

    let level = headingLevel(trimmed)
    if level > 0 {
      flushPara(para, blocks, theme)
      var kind = BlockKind.Head1
      if level == 2 { kind = BlockKind.Head2 }
      if level == 3 { kind = BlockKind.Head3 }
      blocks.Add(inlineBlock(kind, trimmed.Substring(level + 1), theme.Heading.WithAttributes(TextAttributes.Bold), theme, 0, ""))
      continue
    }

    if trimmed.StartsWith(">") {
      flushPara(para, blocks, theme)
      var body = trimmed
      var deep = 0
      while body.StartsWith(">") {
        deep = deep + 1
        body = body.Substring(1)
        if body.StartsWith(" ") { body = body.Substring(1) }
      }
      blocks.Add(inlineBlock(BlockKind.Quote, body, theme.Quote, theme, deep - 1, ""))
      continue
    }

    if isHtmlBlock(trimmed) {
      flushPara(para, blocks, theme)
      continue
    }

    if trimmed.StartsWith("|") && at < rows.Count && isDelimiterRow(rows[at].Trim()) {
      flushPara(para, blocks, theme)
      var t = Block{ Kind: BlockKind.Table }
      t.Marker = alignments(rows[at].Trim())
      addCells(t, trimmed, t.Marker.Length, theme, theme.Heading.WithAttributes(TextAttributes.Bold))
      at = at + 1
      while at < rows.Count && rows[at].Trim().StartsWith("|") {
        addCells(t, rows[at].Trim(), t.Marker.Length, theme, theme.Body)
        at = at + 1
      }
      blocks.Add(t)
      continue
    }

    let depth = leadingSpaces(line) / 2

    if isBullet(trimmed) {
      flushPara(para, blocks, theme)
      var marker = trimmed.Substring(0, 1)
      var body = trimmed.Substring(2)
      if body.StartsWith("[ ] ") {
        marker = char(0x2610).ToString()
        body = body.Substring(4)
      } else if body.StartsWith("[x] ") || body.StartsWith("[X] ") {
        marker = char(0x2611).ToString()
        body = body.Substring(4)
      }
      blocks.Add(inlineBlock(BlockKind.Bullet, body, theme.Body, theme, depth, marker))
      continue
    }

    let num = numberMarker(trimmed)
    if num != "" {
      flushPara(para, blocks, theme)
      blocks.Add(inlineBlock(BlockKind.Number, trimmed.Substring(num.Length + 1), theme.Body, theme, depth, num))
      continue
    }

    if isLinkDef(trimmed) {
      flushPara(para, blocks, theme)
      continue
    }

    if para.Count == 0 && leadingSpaces(line) >= 4 {
      var c = Block{ Kind: BlockKind.Code }
      c.Runs = asRuns(HighlightCode(line.Substring(4), "", theme.Code))
      blocks.Add(c)
      continue
    }

    para.Add(trimmed)
  }

  flushFence(fence, fenceLang, blocks, theme)
  flushPara(para, blocks, theme)
  return blocks
}

internal func flushFence(fence List[string], lang string, blocks List[Block], theme MarkdownTheme) {
  if fence.Count == 0 { return }
  for spans in HighlightBlock(fence, lang, theme.Code) {
    var b = Block{ Kind: BlockKind.Code }
    b.Marker = lang
    b.Runs = asRuns(spans)
    blocks.Add(b)
  }
  fence.Clear()
}

internal func joinItems(source string) List[string] {
  let out = List[string]()
  var inItem = false
  var inFence = false
  for raw in source.Split('\n') {
    let line = raw.TrimEnd('\r')
    let t = line.Trim()
    if inFence {
      if t.StartsWith("```") { inFence = false }
      out.Add(line)
      continue
    }
    if t.StartsWith("```") {
      inFence = true
      inItem = false
      out.Add(line)
      continue
    }
    if t == "" {
      inItem = false
      out.Add(line)
      continue
    }
    if isBullet(t) || numberMarker(t) != "" {
      inItem = true
      out.Add(line)
      continue
    }
    if inItem && !startsBlock(t) {
      out[out.Count - 1] = out[out.Count - 1] + " " + t
      continue
    }
    inItem = false
    out.Add(line)
  }
  return out
}

internal func startsBlock(t string) bool {
  if t.StartsWith(">") || t.StartsWith("|") { return true }
  if t == "***" || setextLevel(t) > 0 { return true }
  if isHtmlBlock(t) { return true }
  return headingLevel(t) > 0
}

internal func flushPara(para List[string], blocks List[Block], theme MarkdownTheme) {
  if para.Count == 0 { return }
  let joined = String.Join(" ", para)
  var b = Block{ Kind: BlockKind.Para }
  b.Runs = asRuns(parseInline(joined, theme.Body, theme))
  blocks.Add(b)
  para.Clear()
}

internal func inlineBlock(kind BlockKind, text string, style Style, theme MarkdownTheme, depth int32, marker string) Block {
  var b = Block{ Kind: kind }
  b.Runs = asRuns(parseInline(text, style, theme))
  b.Depth = depth
  b.Marker = marker
  return b
}

internal func headingLevel(t string) int32 {
  var n = 0
  while n < t.Length && t[n] == '#' { n = n + 1 }
  if n == 0 || n > 3 { return 0 }
  if n >= t.Length || t[n] != ' ' { return 0 }
  return n
}

internal func setextLevel(t string) int32 {
  if t.Length < 2 { return 0 }
  let c = t[0]
  if c != '=' && c != '-' { return 0 }
  var i = 0
  while i < t.Length {
    if t[i] != c { return 0 }
    i = i + 1
  }
  return c == '=' ? 1 : 2
}

internal func isHtmlBlock(t string) bool {
  if !t.StartsWith("<") || !t.EndsWith(">") { return false }
  if tagEnd(t, 0) < 0 { return false }
  var i = 0
  while i < t.Length {
    if t[i] == '<' {
      let end = tagEnd(t, i)
      if end < 0 { return false }
      i = end
      continue
    }
    if !Char.IsWhiteSpace(t[i]) { return false }
    i = i + 1
  }
  return true
}

internal func tagEnd(text string, at int32) int32 {
  var i = at + 1
  if i < text.Length && (text[i] == '/' || text[i] == '!') { i = i + 1 }
  if i >= text.Length || !Char.IsLetter(text[i]) { return -1 }
  let close = text.IndexOf('>', i)
  return close >= 0 ? close + 1 : -1
}

internal func leadingSpaces(t string) int32 {
  var n = 0
  while n < t.Length && t[n] == ' ' { n = n + 1 }
  return n
}

internal func isBullet(t string) bool {
  if t.Length < 2 { return false }
  let c = t.Substring(0, 1)
  if c != "-" && c != "*" && c != "+" { return false }
  return t.Substring(1, 1) == " "
}

internal func splitRow(t string) List[string] {
  var s = t
  if s.StartsWith("|") { s = s.Substring(1) }
  if s.EndsWith("|") { s = s.Substring(0, s.Length - 1) }
  let out = List[string]()
  for part in s.Split('|') {
    out.Add(part.Trim())
  }
  return out
}

internal func isDelimiterRow(t string) bool {
  if !t.StartsWith("|") { return false }
  let cells = splitRow(t)
  if cells.Count == 0 { return false }
  for c in cells {
    if !isDelimiterCell(c) { return false }
  }
  return true
}

internal func isDelimiterCell(c string) bool {
  var s = c
  if s.StartsWith(":") { s = s.Substring(1) }
  if s.EndsWith(":") { s = s.Substring(0, s.Length - 1) }
  if s.Length == 0 { return false }
  var i = 0
  while i < s.Length {
    if s[i] != '-' { return false }
    i = i + 1
  }
  return true
}

internal func alignments(t string) string {
  var out = ""
  for c in splitRow(t) {
    let left = c.StartsWith(":")
    let right = c.EndsWith(":")
    if left && right {
      out = out + "c"
    } else if right {
      out = out + "r"
    } else {
      out = out + "l"
    }
  }
  return out
}

internal func addCells(b Block, row string, cols int32, theme MarkdownTheme, style Style) {
  let parts = splitRow(row)
  for i in 0 ... cols {
    let text = i < parts.Count ? parts[i] : ""
    b.Cells.Add(asRuns(parseInline(text, style, theme)))
  }
}

internal func numberMarker(t string) string {
  var i = 0
  while i < t.Length && Char.IsDigit(t[i]) { i = i + 1 }
  if i == 0 { return "" }
  if i >= t.Length || t[i] != '.' { return "" }
  if i + 1 >= t.Length || t[i + 1] != ' ' { return "" }
  return t.Substring(0, i + 1)
}


/// Parses one marker-delimited styled span. Returns the flushed literal and sets
/// next past the closing marker, or -1 when the marker never closes.
internal func inlineMarker(spans List[Span], text string, i int32, marker string, attr TextAttributes, style Style, theme MarkdownTheme, literal string, out next int32) string {
  let len = marker.Length
  let close = len == 1 ? text.IndexOf(marker[0], i + 1) : text.IndexOf(marker, i + len)
  if close < 0 {
    next = -1
    return literal
  }
  let flushed = flushLiteral(spans, literal, style)
  appendAll(spans, parseInline(text.Substring(i + len, close - i - len), style.WithAttributes(attr), theme))
  next = close + len
  return flushed
}

internal func parseInline(text string, style Style, theme MarkdownTheme) List[Span] {
  let spans = List[Span]()
  var literal = ""
  var i = 0

  while i < text.Length {
    if matchAt(text, i, "**") {
      var next = 0
      literal = inlineMarker(spans, text, i, "**", TextAttributes.Bold, style, theme, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if matchAt(text, i, "__") {
      var next = 0
      literal = inlineMarker(spans, text, i, "__", TextAttributes.Bold, style, theme, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if matchAt(text, i, "~~") {
      var next = 0
      literal = inlineMarker(spans, text, i, "~~", TextAttributes.Strikethrough, style, theme, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if text[i] == '`' {
      let close = text.IndexOf('`', i + 1)
      if close >= 0 {
        literal = flushLiteral(spans, literal, style)
        spans.Add(Span(text.Substring(i + 1, close - i - 1), theme.Code))
        i = close + 1
        continue
      }
    }
    if text[i] == '!' && i + 1 < text.Length && text[i + 1] == '[' {
      let shut = labelEnd(text, i + 1)
      if shut >= 0 && linkTail(text, shut + 1) > 0 {
        literal = flushLiteral(spans, literal, style)
        appendAll(spans, parseInline(text.Substring(i + 2, shut - i - 2), style, theme))
        i = linkTail(text, shut + 1)
        continue
      }
      i = i + 1
      continue
    }
    if text[i] == '[' {
      let end = labelEnd(text, i)
      if end >= 0 {
        let skip = linkTail(text, end + 1)
        if skip > 0 {
          let label = text.Substring(i + 1, end - i - 1)
          literal = flushLiteral(spans, literal, style)
          appendAll(spans, parseInline(label, theme.Link.WithAttributes(TextAttributes.Underline), theme))
          if text[end + 1] == '(' {
            let url = text.Substring(end + 2, skip - end - 3)
            if url != "" && url != label && !url.StartsWith("#") {
              spans.Add(Span(" (" + url + ")", theme.Link.WithAttributes(TextAttributes.Dim)))
            }
          }
          i = skip
          continue
        }
      }
    }
    if text[i] == '<' {
      let end = tagEnd(text, i)
      if end > 0 {
        let inner = text.Substring(i + 1, end - i - 2)
        literal = flushLiteral(spans, literal, style)
        if inner.Contains("://") || inner.StartsWith("mailto:") {
          spans.Add(Span(inner, theme.Link.WithAttributes(TextAttributes.Underline)))
        }
        i = end
        continue
      }
    }
    if text[i] == '*' && !matchAt(text, i, "**") {
      var next = 0
      literal = inlineMarker(spans, text, i, "*", TextAttributes.Italic, style, theme, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if text[i] == '_' && !matchAt(text, i, "__") {
      var next = 0
      literal = inlineMarker(spans, text, i, "_", TextAttributes.Italic, style, theme, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    literal = literal + text.Substring(i, 1)
    i = i + 1
  }

  literal = flushLiteral(spans, literal, style)
  return spans
}

internal func labelEnd(text string, at int32) int32 {
  var depth = 0
  var i = at
  while i < text.Length {
    if text[i] == '[' { depth = depth + 1 }
    if text[i] == ']' {
      depth = depth - 1
      if depth == 0 { return i }
    }
    i = i + 1
  }
  return -1
}

internal func linkTail(text string, at int32) int32 {
  if at >= text.Length { return -1 }
  if text[at] == '(' {
    let close = text.IndexOf(')', at + 1)
    return close >= 0 ? close + 1 : -1
  }
  if text[at] == '[' {
    let close = text.IndexOf(']', at + 1)
    return close >= 0 ? close + 1 : -1
  }
  return -1
}

internal func isLinkDef(t string) bool {
  if !t.StartsWith("[") { return false }
  return t.IndexOf("]:", 1) > 1
}

internal func matchAt(text string, i int32, marker string) bool {
  if i + marker.Length > text.Length { return false }
  return text.Substring(i, marker.Length) == marker
}

internal func flushLiteral(spans List[Span], literal string, style Style) string {
  if literal != "" { spans.Add(Span(literal, style)) }
  return ""
}

internal func appendAll(spans List[Span], more List[Span]) {
  for s in more { spans.Add(s) }
}

internal func asRuns(spans List[Span]) List[TextRun] {
  let runs = List[TextRun]()
  for span in spans { runs.Add(TextRun(span.Text, span.Ink)) }
  return runs
}
