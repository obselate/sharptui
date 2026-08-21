package SharpTui

import System
import System.Collections.Generic
import System.Net
import System.Text

internal enum BlockKind { Para, Head1, Head2, Head3, Head4, Head5, Head6, Bullet, Number, Quote, Code, Rule, Table, Blank }

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
  let references = collectReferences(source)
  var inFence = false
  var fenceLang = ""
  var fenceChar = '`'
  var fenceLength = 0
  let rows = joinItems(source)

  var at = 0
  while at < rows.Count {
    let line = rows[at].TrimEnd('\r')
    let spaces = leadingSpaces(line)
    let content = spaces < line.Length ? line.Substring(spaces) : ""
    let trimmed = content.TrimEnd()
    at = at + 1

    if inFence {
      if spaces <= 3 && isFenceClose(trimmed, fenceChar, fenceLength) {
        inFence = false
        flushFence(fence, fenceLang, blocks, theme)
        continue
      }
      fence.Add(line)
      continue
    }

    var openingChar = '`'
    var openingLength = 0
    var openingInfo = ""
    if spaces <= 3 && fenceOpen(trimmed, out openingChar, out openingLength, out openingInfo) {
      flushPara(para, blocks, theme, references)
      inFence = true
      fenceChar = openingChar
      fenceLength = openingLength
      fenceLang = LangOf(openingInfo)
      continue
    }

    if trimmed == "" {
      flushPara(para, blocks, theme, references)
      blocks.Add(Block{ Kind: BlockKind.Blank })
      continue
    }

    if para.Count == 0 && spaces >= 4 && !isBullet(trimmed) && numberMarker(trimmed) == "" {
      var c = Block{ Kind: BlockKind.Code }
      c.Runs = asRuns(HighlightCode(line.Substring(4), "", theme.Code))
      blocks.Add(c)
      continue
    }

    let under = spaces <= 3 ? setextLevel(trimmed) : 0
    if under > 0 && para.Count > 0 {
      let text = paragraphText(para)
      para.Clear()
      var sk = BlockKind.Head1
      if under == 2 { sk = BlockKind.Head2 }
      blocks.Add(inlineBlock(sk, text, theme.Heading.WithAttributes(TextAttributes.Bold), theme, references, 0, ""))
      continue
    }

    if spaces <= 3 && isThematicBreak(trimmed) {
      flushPara(para, blocks, theme, references)
      blocks.Add(Block{ Kind: BlockKind.Rule })
      continue
    }

    let level = spaces <= 3 ? headingLevel(trimmed) : 0
    if level > 0 {
      flushPara(para, blocks, theme, references)
      blocks.Add(inlineBlock(headingKind(level), headingText(trimmed, level), theme.Heading.WithAttributes(TextAttributes.Bold), theme, references, 0, ""))
      continue
    }

    if spaces <= 3 && trimmed.StartsWith(">") {
      flushPara(para, blocks, theme, references)
      var body = trimmed
      var deep = 0
      while body.StartsWith(">") {
        deep = deep + 1
        body = body.Substring(1).TrimStart()
      }
      blocks.Add(inlineBlock(BlockKind.Quote, body, theme.Quote, theme, references, deep - 1, ""))
      continue
    }

    if isHtmlBlock(trimmed) {
      flushPara(para, blocks, theme, references)
      continue
    }

    if hasTablePipe(trimmed) && at < rows.Count && isDelimiterRow(rows[at].Trim()) {
      flushPara(para, blocks, theme, references)
      var t = Block{ Kind: BlockKind.Table }
      t.Marker = alignments(rows[at].Trim())
      addCells(t, trimmed, t.Marker.Length, theme, references, theme.Heading.WithAttributes(TextAttributes.Bold))
      at = at + 1
      while at < rows.Count && hasTablePipe(rows[at].Trim()) {
        addCells(t, rows[at].Trim(), t.Marker.Length, theme, references, theme.Body)
        at = at + 1
      }
      blocks.Add(t)
      continue
    }

    let depth = spaces / 2
    var ordered = false
    var marker = ""
    var body = ""
    if isListMarker(trimmed, out ordered, out marker, out body) {
      if para.Count > 0 && ordered && !marker.StartsWith("1.") && !marker.StartsWith("1)") {
        para.Add(line)
        continue
      }
      flushPara(para, blocks, theme, references)
      if body.StartsWith("[ ] ") {
        marker = char(0x2610).ToString()
        body = body.Substring(4)
      } else if body.StartsWith("[x] ") || body.StartsWith("[X] ") {
        marker = char(0x2611).ToString()
        body = body.Substring(4)
      }
      let listKind = ordered ? BlockKind.Number : BlockKind.Bullet
      blocks.Add(inlineBlock(listKind, body, theme.Body, theme, references, depth, marker))
      continue
    }

    if isLinkDef(trimmed) {
      flushPara(para, blocks, theme, references)
      continue
    }

    para.Add(line)
  }

  if inFence { flushFence(fence, fenceLang, blocks, theme) }
  flushPara(para, blocks, theme, references)
  return blocks
}

internal func flushFence(fence List[string], lang string, blocks List[Block], theme MarkdownTheme) {
  if fence.Count == 0 {
    var empty = Block{ Kind: BlockKind.Code }
    empty.Marker = lang
    blocks.Add(empty)
    return
  }
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
  var fenceChar = '`'
  var fenceLength = 0
  for raw in source.Split('\n') {
    let line = raw.TrimEnd('\r')
    let t = line.Trim()
    if inFence {
      if leadingSpaces(line) <= 3 && isFenceClose(t, fenceChar, fenceLength) { inFence = false }
      out.Add(line)
      continue
    }
    var fc = '`'
    var fl = 0
    var fi = ""
    if leadingSpaces(line) <= 3 && fenceOpen(t, out fc, out fl, out fi) {
      inFence = true
      fenceChar = fc
      fenceLength = fl
      inItem = false
      out.Add(line)
      continue
    }
    if t == "" {
      inItem = false
      out.Add(line)
      continue
    }
    var ordered = false
    var marker = ""
    var body = ""
    if isListMarker(t, out ordered, out marker, out body) {
      inItem = true
      out.Add(line)
      continue
    }
    if inItem && !startsBlock(t) {
      if out[out.Count - 1].EndsWith("  ") || out[out.Count - 1].EndsWith("\\") {
        out[out.Count - 1] = out[out.Count - 1] + "\n" + t
      } else {
        out[out.Count - 1] = out[out.Count - 1] + " " + t
      }
      continue
    }
    inItem = false
    out.Add(line)
  }
  return out
}

internal func startsBlock(t string) bool {
  if t.StartsWith(">") || hasTablePipe(t) { return true }
  if isThematicBreak(t) || setextLevel(t) > 0 { return true }
  if isLinkDef(t) { return true }
  if isHtmlBlock(t) { return true }
  var fc = '`'
  var fl = 0
  var fi = ""
  if fenceOpen(t, out fc, out fl, out fi) { return true }
  return headingLevel(t) > 0
}

internal func flushPara(para List[string], blocks List[Block], theme MarkdownTheme, references Dictionary[string, string]) {
  if para.Count == 0 { return }
  var b = Block{ Kind: BlockKind.Para }
  b.Runs = asRuns(parseInline(paragraphText(para), theme.Body, theme, references))
  blocks.Add(b)
  para.Clear()
}

internal func inlineBlock(kind BlockKind, text string, style Style, theme MarkdownTheme, references Dictionary[string, string], depth int32, marker string) Block {
  var b = Block{ Kind: kind }
  b.Runs = asRuns(parseInline(text, style, theme, references))
  b.Depth = depth
  b.Marker = marker
  return b
}

internal func headingLevel(t string) int32 {
  var n = 0
  while n < t.Length && t[n] == '#' { n = n + 1 }
  if n == 0 || n > 6 { return 0 }
  if n < t.Length && !Char.IsWhiteSpace(t[n]) { return 0 }
  return n
}

internal func headingKind(level int32) BlockKind {
  if level == 1 { return BlockKind.Head1 }
  if level == 2 { return BlockKind.Head2 }
  if level == 3 { return BlockKind.Head3 }
  if level == 4 { return BlockKind.Head4 }
  if level == 5 { return BlockKind.Head5 }
  return BlockKind.Head6
}

internal func headingText(t string, level int32) string {
  var text = t.Substring(level).Trim()
  var end = text.Length
  while end > 0 && text[end - 1] == '#' { end = end - 1 }
  if end == 0 { return "" }
  if end < text.Length && end > 0 && Char.IsWhiteSpace(text[end - 1]) {
    text = text.Substring(0, end).TrimEnd()
  }
  return text
}

internal func setextLevel(t string) int32 {
  if t.Length < 1 { return 0 }
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
  if t.Length > 2 && isAutolink(t.Substring(1, t.Length - 2)) { return false }
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
  while i < text.Length && (Char.IsLetterOrDigit(text[i]) || text[i] == '-') { i = i + 1 }
  if i >= text.Length || !Char.IsWhiteSpace(text[i]) && text[i] != '/' && text[i] != '>' { return -1 }
  let close = text.IndexOf('>', i)
  return close >= 0 ? close + 1 : -1
}

internal func leadingSpaces(t string) int32 {
  var n = 0
  while n < t.Length && t[n] == ' ' { n = n + 1 }
  return n
}

internal func isBullet(t string) bool {
  var ordered = false
  var marker = ""
  var body = ""
  return isListMarker(t, out ordered, out marker, out body) && !ordered
}

internal func splitRow(t string) List[string] {
  let out = List[string]()
  let s = t.Trim()
  var i = s.StartsWith("|") ? 1 : 0
  var ticks = 0
  let cell = StringBuilder()
  while i < s.Length {
    if s[i] == '\\' && i + 1 < s.Length {
      cell.Append(s[i])
      cell.Append(s[i + 1])
      i = i + 2
      continue
    }
    if s[i] == '`' {
      let run = charRun(s, i, '`')
      if ticks == 0 { ticks = run } else if ticks == run { ticks = 0 }
      cell.Append(s.Substring(i, run))
      i = i + run
      continue
    }
    if s[i] == '|' && ticks == 0 {
      out.Add(cell.ToString().Trim())
      cell.Clear()
      i = i + 1
      if i == s.Length { return out }
      continue
    }
    cell.Append(s[i])
    i = i + 1
  }
  out.Add(cell.ToString().Trim())
  return out
}

internal func isDelimiterRow(t string) bool {
  if !hasTablePipe(t) { return false }
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

internal func addCells(b Block, row string, cols int32, theme MarkdownTheme, references Dictionary[string, string], style Style) {
  let parts = splitRow(row)
  for i in 0 ... cols {
    let text = i < parts.Count ? parts[i] : ""
    b.Cells.Add(asRuns(parseInline(text, style, theme, references)))
  }
}

internal func numberMarker(t string) string {
  var ordered = false
  var marker = ""
  var body = ""
  if isListMarker(t, out ordered, out marker, out body) && ordered { return marker }
  return ""
}

internal func paragraphText(lines List[string]) string {
  let out = StringBuilder()
  var lineIndex = 0
  for raw in lines {
    var line = raw.TrimStart()
    var slashes = 0
    var slashAt = line.Length - 1
    while slashAt >= 0 && line[slashAt] == '\\' {
      slashes = slashes + 1
      slashAt = slashAt - 1
    }
    let hasNext = lineIndex + 1 < lines.Count
    let slashBreak = hasNext && slashes % 2 == 1
    let spaceBreak = hasNext && line.EndsWith("  ")
    line = line.TrimEnd()
    if slashBreak && line.EndsWith("\\") { line = line.Substring(0, line.Length - 1) }
    out.Append(line)
    if slashBreak || spaceBreak { out.Append('\n') } else { out.Append(' ') }
    lineIndex = lineIndex + 1
  }
  var result = out.ToString().TrimEnd(' ')
  while result.EndsWith("\n") { result = result.Substring(0, result.Length - 1) }
  return result
}

internal func fenceOpen(t string, out marker char, out length int32, out info string) bool {
  marker = '`'
  length = 0
  info = ""
  if t.Length < 3 || t[0] != '`' && t[0] != '~' { return false }
  marker = t[0]
  length = charRun(t, 0, marker)
  if length < 3 { return false }
  info = t.Substring(length).Trim()
  if marker == '`' && info.Contains("`") { return false }
  return true
}

internal func isFenceClose(t string, marker char, length int32) bool {
  if t.Length < length || t[0] != marker { return false }
  let run = charRun(t, 0, marker)
  if run < length { return false }
  var i = run
  while i < t.Length {
    if !Char.IsWhiteSpace(t[i]) { return false }
    i = i + 1
  }
  return true
}

internal func isThematicBreak(t string) bool {
  if t.Length == 0 { return false }
  var marker = char(0)
  var count = 0
  var i = 0
  while i < t.Length {
    let c = t[i]
    if c == ' ' || c == '\t' {
      i = i + 1
      continue
    }
    if c != '-' && c != '*' && c != '_' { return false }
    if marker == char(0) { marker = c } else if marker != c { return false }
    count = count + 1
    i = i + 1
  }
  return count >= 3
}

internal func isListMarker(t string, out ordered bool, out marker string, out body string) bool {
  ordered = false
  marker = ""
  body = ""
  if t.Length == 0 { return false }
  if t[0] == '-' || t[0] == '*' || t[0] == '+' {
    if t.Length > 1 && !Char.IsWhiteSpace(t[1]) { return false }
    marker = t.Substring(0, 1)
    body = t.Length > 1 ? t.Substring(2).TrimStart() : ""
    return true
  }
  var i = 0
  while i < t.Length && i < 9 && Char.IsDigit(t[i]) { i = i + 1 }
  if i == 0 || i >= t.Length || t[i] != '.' && t[i] != ')' { return false }
  if i + 1 < t.Length && !Char.IsWhiteSpace(t[i + 1]) { return false }
  ordered = true
  marker = t.Substring(0, i + 1)
  body = i + 1 < t.Length ? t.Substring(i + 2).TrimStart() : ""
  return true
}

internal func hasTablePipe(t string) bool {
  var ticks = 0
  var i = 0
  while i < t.Length {
    if t[i] == '\\' && i + 1 < t.Length {
      i = i + 2
      continue
    }
    if t[i] == '`' {
      let run = charRun(t, i, '`')
      if ticks == 0 { ticks = run } else if ticks == run { ticks = 0 }
      i = i + run
      continue
    }
    if t[i] == '|' && ticks == 0 { return true }
    i = i + 1
  }
  return false
}

internal func collectReferences(source string) Dictionary[string, string] {
  let references = Dictionary[string, string](StringComparer.OrdinalIgnoreCase)
  var inFence = false
  var fenceChar = '`'
  var fenceLength = 0
  for raw in source.Split('\n') {
    let line = raw.TrimEnd('\r')
    let spaces = leadingSpaces(line)
    let content = spaces < line.Length ? line.Substring(spaces) : ""
    let trimmed = content.TrimEnd()
    if inFence {
      if spaces <= 3 && isFenceClose(trimmed, fenceChar, fenceLength) { inFence = false }
      continue
    }
    var openingChar = '`'
    var openingLength = 0
    var openingInfo = ""
    if spaces <= 3 && fenceOpen(trimmed, out openingChar, out openingLength, out openingInfo) {
      inFence = true
      fenceChar = openingChar
      fenceLength = openingLength
      continue
    }
    if spaces >= 4 { continue }
    var label = ""
    var target = ""
    if referenceDefinition(trimmed, out label, out target) {
      let key = referenceKey(label)
      if !references.ContainsKey(key) { references[key] = target }
    }
  }
  return references
}

internal func referenceKey(label string) string {
  let out = StringBuilder()
  var spacing = false
  for c in label.Trim() {
    if Char.IsWhiteSpace(c) {
      spacing = out.Length > 0
      continue
    }
    if spacing { out.Append(' ') }
    spacing = false
    out.Append(c)
  }
  return out.ToString()
}

internal func referenceDefinition(t string, out label string, out target string) bool {
  label = ""
  target = ""
  if !t.StartsWith("[") { return false }
  let close = t.IndexOf("]:", 1)
  if close <= 1 { return false }
  let rest = t.Substring(close + 2).Trim()
  if rest == "" { return false }
  label = t.Substring(1, close - 1).Trim()
  if rest.StartsWith("<") {
    let end = rest.IndexOf('>', 1)
    if end < 0 { return false }
    target = rest.Substring(1, end - 1)
    return target != ""
  }
  var endAt = 0
  while endAt < rest.Length && !Char.IsWhiteSpace(rest[endAt]) { endAt = endAt + 1 }
  target = rest.Substring(0, endAt)
  return target != ""
}
internal func parseInline(text string, style Style, theme MarkdownTheme) List[Span] {
  return parseInline(text, style, theme, Dictionary[string, string](StringComparer.OrdinalIgnoreCase))
}

internal func parseInline(text string, style Style, theme MarkdownTheme, references Dictionary[string, string]) List[Span] {
  let spans = List[Span]()
  var literal = StringBuilder()
  var i = 0

  while i < text.Length {
    if text[i] == '\\' && i + 1 < text.Length && isMarkdownPunctuation(text[i + 1]) {
      literal.Append(text[i + 1])
      i = i + 2
      continue
    }
    if text[i] == '`' {
      let run = charRun(text, i, '`')
      let close = findCodeClose(text, i + run, run)
      if close >= 0 {
        literal = flushLiteral(spans, literal, style)
        spans.Add(Span(normalizeCodeSpan(text.Substring(i + run, close - i - run)), theme.Code.WithAttributes(style.Attributes)))
        i = close + run
        continue
      }
    }
    if text[i] == '!' && i + 1 < text.Length && text[i + 1] == '[' {
      var skip = -1
      var label = ""
      var target = ""
      if resolveLink(text, i + 1, references, out skip, out label, out target) {
        literal = flushLiteral(spans, literal, style)
        let imageStyle = theme.Link.WithAttributes(style.Attributes).WithAttributes(TextAttributes.Underline)
        appendAll(spans, parseInline(label, imageStyle, theme, references))
        i = skip
        continue
      }
    }
    if text[i] == '[' {
      var skip = -1
      var label = ""
      var target = ""
      if resolveLink(text, i, references, out skip, out label, out target) {
        literal = flushLiteral(spans, literal, style)
        let linkStyle = theme.Link.WithAttributes(style.Attributes).WithAttributes(TextAttributes.Underline)
        appendAll(spans, parseInline(label, linkStyle, theme, references))
        if target != "" && !target.StartsWith("#") && !stringEqualIgnoreCase(target, label) {
          let shownTarget = label == "" ? target : " (" + target + ")"
          spans.Add(Span(shownTarget, theme.Link.WithAttributes(style.Attributes).WithAttributes(TextAttributes.Dim)))
        }
        i = skip
        continue
      }
    }
    if text[i] == '<' {
      let close = text.IndexOf('>', i + 1)
      if close > i + 1 {
        let inner = text.Substring(i + 1, close - i - 1)
        if isAutolink(inner) {
          literal = flushLiteral(spans, literal, style)
          let shown = inner.StartsWith("mailto:") ? inner.Substring(7) : inner
          spans.Add(Span(shown, theme.Link.WithAttributes(style.Attributes).WithAttributes(TextAttributes.Underline)))
          i = close + 1
          continue
        }
      }
      let tag = tagEnd(text, i)
      if tag > 0 {
        literal = flushLiteral(spans, literal, style)
        i = tag
        continue
      }
    }
    if text[i] == '&' {
      var entityEnd = -1
      var entity = ""
      if decodeEntity(text, i, out entityEnd, out entity) {
        literal.Append(entity)
        i = entityEnd
        continue
      }
    }
    if matchAt(text, i, "***") {
      var next = -1
      let both = TextAttributes(int32(TextAttributes.Bold) | int32(TextAttributes.Italic))
      literal = inlineMarker(spans, text, i, "***", both, style, theme, references, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if matchAt(text, i, "___") {
      var next = -1
      let both = TextAttributes(int32(TextAttributes.Bold) | int32(TextAttributes.Italic))
      literal = inlineMarker(spans, text, i, "___", both, style, theme, references, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if matchAt(text, i, "**") {
      var next = -1
      literal = inlineMarker(spans, text, i, "**", TextAttributes.Bold, style, theme, references, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if matchAt(text, i, "__") {
      var next = -1
      literal = inlineMarker(spans, text, i, "__", TextAttributes.Bold, style, theme, references, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if matchAt(text, i, "~~") {
      var next = -1
      literal = inlineMarker(spans, text, i, "~~", TextAttributes.Strikethrough, style, theme, references, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if text[i] == '*' && !matchAt(text, i, "**") {
      var next = -1
      literal = inlineMarker(spans, text, i, "*", TextAttributes.Italic, style, theme, references, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    if text[i] == '_' && !matchAt(text, i, "__") {
      var next = -1
      literal = inlineMarker(spans, text, i, "_", TextAttributes.Italic, style, theme, references, literal, out next)
      if next >= 0 {
        i = next
        continue
      }
    }
    literal.Append(text[i])
    i = i + 1
  }

  literal = flushLiteral(spans, literal, style)
  return spans
}

internal func inlineMarker(spans List[Span], text string, i int32, marker string, attr TextAttributes, style Style, theme MarkdownTheme, references Dictionary[string, string], literal StringBuilder, out next int32) StringBuilder {
  next = -1
  if !canOpenMarker(text, i, marker) { return literal }
  let close = findClosingMarker(text, i + marker.Length, marker)
  if close < 0 { return literal }
  let output = flushLiteral(spans, literal, style)
  appendAll(spans, parseInline(text.Substring(i + marker.Length, close - i - marker.Length), style.WithAttributes(attr), theme, references))
  next = close + marker.Length
  return output
}

internal func canOpenMarker(text string, at int32, marker string) bool {
  let after = at + marker.Length
  if after >= text.Length || Char.IsWhiteSpace(text[after]) { return false }
  if marker[0] == '_' && at > 0 && Char.IsLetterOrDigit(text[at - 1]) && Char.IsLetterOrDigit(text[after]) { return false }
  if marker.Length == 1 && charRun(text, at, marker[0]) != 1 { return false }
  return true
}

internal func findClosingMarker(text string, from int32, marker string) int32 {
  var at = from
  while at + marker.Length <= text.Length {
    let found = text.IndexOf(marker, at)
    if found < 0 { return -1 }
    if isEscaped(text, found) {
      at = found + marker.Length
      continue
    }
    let run = charRun(text, found, marker[0])
    if marker.Length == 1 && run == 2 {
      at = found + run
      continue
    }
    let candidate = marker.Length == 1 && run > 1 ? found + run - 1 : found
    if candidate == 0 || Char.IsWhiteSpace(text[candidate - 1]) {
      at = found + run
      continue
    }
    let after = candidate + marker.Length
    if marker[0] == '_' && after < text.Length && Char.IsLetterOrDigit(text[candidate - 1]) && Char.IsLetterOrDigit(text[after]) {
      at = found + run
      continue
    }
    return candidate
  }
  return -1
}

internal func labelEnd(text string, at int32) int32 {
  var depth = 0
  var i = at
  while i < text.Length {
    if text[i] == '\\' && i + 1 < text.Length {
      i = i + 2
      continue
    }
    if text[i] == '[' { depth = depth + 1 }
    if text[i] == ']' {
      depth = depth - 1
      if depth == 0 { return i }
    }
    i = i + 1
  }
  return -1
}

internal func resolveLink(text string, opener int32, references Dictionary[string, string], out skip int32, out label string, out target string) bool {
  skip = -1
  label = ""
  target = ""
  let shut = labelEnd(text, opener)
  if shut < 0 { return false }
  label = text.Substring(opener + 1, shut - opener - 1)
  let tail = shut + 1
  if tail < text.Length && text[tail] == '(' {
    skip = parenthesisEnd(text, tail)
    if skip < 0 { return false }
    target = linkDestination(text.Substring(tail + 1, skip - tail - 2))
    return true
  }
  if tail < text.Length && text[tail] == '[' {
    let close = labelEnd(text, tail)
    if close < 0 { return false }
    var reference = text.Substring(tail + 1, close - tail - 1)
    if reference == "" { reference = label }
    if !references.TryGetValue(referenceKey(reference), &target) { return false }
    skip = close + 1
    return true
  }
  if !references.TryGetValue(referenceKey(label), &target) { return false }
  skip = tail
  return true
}

internal func isLinkDef(t string) bool {
  var label = ""
  var target = ""
  return referenceDefinition(t, out label, out target)
}

internal func matchAt(text string, i int32, marker string) bool {
  if i + marker.Length > text.Length { return false }
  return text.Substring(i, marker.Length) == marker
}

internal func charRun(text string, at int32, marker char) int32 {
  var i = at
  while i < text.Length && text[i] == marker { i = i + 1 }
  return i - at
}

internal func findCodeClose(text string, from int32, length int32) int32 {
  var at = from
  while at < text.Length {
    let found = text.IndexOf('`', at)
    if found < 0 { return -1 }
    let run = charRun(text, found, '`')
    if run == length { return found }
    at = found + run
  }
  return -1
}

internal func normalizeCodeSpan(text string) string {
  var value = text.Replace("\r\n", " ").Replace('\n', ' ').Replace('\r', ' ')
  if value.Length > 1 && value.StartsWith(" ") && value.EndsWith(" ") && !allSpaces(value) {
    value = value.Substring(1, value.Length - 2)
  }
  return value
}

internal func allSpaces(text string) bool {
  for c in text {
    if c != ' ' { return false }
  }
  return true
}

internal func parenthesisEnd(text string, opener int32) int32 {
  var depth = 0
  var i = opener
  while i < text.Length {
    if text[i] == '\\' && i + 1 < text.Length {
      i = i + 2
      continue
    }
    if text[i] == '(' { depth = depth + 1 }
    if text[i] == ')' {
      depth = depth - 1
      if depth == 0 { return i + 1 }
    }
    i = i + 1
  }
  return -1
}

internal func linkDestination(raw string) string {
  let value = raw.Trim()
  if value.StartsWith("<") {
    let end = value.IndexOf('>', 1)
    if end > 0 { return unescapeMarkdown(value.Substring(1, end - 1)) }
  }
  var depth = 0
  var i = 0
  while i < value.Length {
    if value[i] == '\\' && i + 1 < value.Length {
      i = i + 2
      continue
    }
    if value[i] == '(' { depth = depth + 1 }
    if value[i] == ')' && depth > 0 { depth = depth - 1 }
    if Char.IsWhiteSpace(value[i]) && depth == 0 { break }
    i = i + 1
  }
  return unescapeMarkdown(value.Substring(0, i))
}

internal func unescapeMarkdown(text string) string {
  let out = StringBuilder()
  var i = 0
  while i < text.Length {
    if text[i] == '\\' && i + 1 < text.Length && isMarkdownPunctuation(text[i + 1]) {
      out.Append(text[i + 1])
      i = i + 2
      continue
    }
    out.Append(text[i])
    i = i + 1
  }
  return out.ToString()
}

internal func isEscaped(text string, at int32) bool {
  var count = 0
  var i = at - 1
  while i >= 0 && text[i] == '\\' {
    count = count + 1
    i = i - 1
  }
  return count % 2 == 1
}

internal func isMarkdownPunctuation(c char) bool {
  return c >= '!' && c <= '/' || c >= ':' && c <= '@' || c >= '[' && c <= '`' || c >= '{' && c <= '~'
}

internal func isAutolink(text string) bool {
  for c in text {
    if Char.IsWhiteSpace(c) { return false }
  }
  let colon = text.IndexOf(':')
  if colon >= 2 && colon <= 32 && Char.IsLetter(text[0]) {
    var validScheme = true
    var i = 1
    while i < colon {
      let c = text[i]
      if !Char.IsLetterOrDigit(c) && c != '+' && c != '-' && c != '.' { validScheme = false }
      i = i + 1
    }
    if validScheme { return true }
  }
  let at = text.IndexOf('@')
  return at > 0 && at + 1 < text.Length && text.IndexOf('.', at + 2) > at + 1
}

internal func decodeEntity(text string, at int32, out next int32, out value string) bool {
  next = -1
  value = ""
  let close = text.IndexOf(';', at + 1)
  if close < 0 || close - at > 32 { return false }
  let encoded = text.Substring(at, close - at + 1)
  let decoded = WebUtility.HtmlDecode(encoded)
  guard let decodedValue = decoded else { return false }
  value = decodedValue
  if value == encoded { return false }
  next = close + 1
  return true
}

internal func stringEqualIgnoreCase(a string, b string) bool {
  return String.Equals(a, b, StringComparison.OrdinalIgnoreCase)
}

internal func appendAll(spans List[Span], more List[Span]) {
  for s in more { spans.Add(s) }
}

internal func asRuns(spans List[Span]) List[TextRun] {
  let runs = List[TextRun]()
  for span in spans { runs.Add(TextRun(span.Text, span.Ink)) }
  return runs
}
