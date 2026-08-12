package SharpTui

import System
import System.Collections.Generic

/// Keyword and language-family lookup tables. A type cannot reach its own
/// statics, but these are read from package-level funcs below, which is fine.
internal class SyntaxData {
  shared {
    public let CKeywords string = " if else for while return func class struct interface enum switch case break continue default do try catch finally throw new public private protected static readonly const var let import package namespace using null true false this base virtual override abstract sealed extends implements super void int float double bool string char byte long short unsigned signed in as is typeof sizeof instanceof yield async await function fn impl trait mod pub mut match loop where dyn move ref unsafe box crate self Self type export default from of get set nil "
    public let ShellKeywords string = " if then else elif fi for while until do done case esac function local export return in select break continue exit "
    public let PyKeywords string = " def class if elif else for while return import from as try except finally raise with yield lambda pass break continue global nonlocal assert del print not in is and or True False None async await "
    public let JsonKeywords string = " true false null "

    public let CLangs string = " gs g# gsharp cs c# csharp c cpp c++ h hpp java go golang rust rs js ts jsx tsx javascript typescript kt kotlin swift scala dart zig groovy php proto sql lua haskell hs ada "
    public let BacktickLangs string = " js ts jsx tsx javascript typescript "
    public let DashLangs string = " sql lua haskell hs ada "
    public let ShellLangs string = " sh bash zsh fish shell console shell-session ps1 powershell rb ruby perl pl make makefile dockerfile docker cmake nginx "
    public let PyLangs string = " py python python3 "
    public let KeyedLangs string = " toml yaml yml ini conf cfg env properties editorconfig gitconfig "
  }
}

/// Returns the lowercased first token of a fence info string, e.g.
/// "rust,ignore" or "js title=foo" becomes "rust" / "js". Empty in, empty out.
internal func LangOf(info string) string {
  if info == "" { return "" }
  let s = info.Trim()
  if s == "" { return "" }
  var end = 0
  while end < s.Length && s[end] != ' ' && s[end] != ',' {
    end = end + 1
  }
  return s.Substring(0, end).ToLower()
}

/// Breaks one line of code into styled spans. Concatenating the returned
/// spans' text always reproduces the input line exactly.
internal func HighlightCode(line string, lang string, base Style) List[Span] {
  let l = lang.ToLower()
  if SyntaxData.CLangs.Contains(" " + l + " ") {
    let backtick = SyntaxData.BacktickLangs.Contains(" " + l + " ")
    return highlightCLike(line, base, backtick, SyntaxData.DashLangs.Contains(" " + l + " "))
  }
  if SyntaxData.ShellLangs.Contains(" " + l + " ") {
    return highlightShell(line, base)
  }
  if SyntaxData.PyLangs.Contains(" " + l + " ") {
    return highlightPython(line, base)
  }
  if l == "json" || l == "jsonc" || l == "json5" {
    return highlightJson(line, base)
  }
  if l == "diff" || l == "patch" {
    return highlightDiff(line, base)
  }
  if SyntaxData.KeyedLangs.Contains(" " + l + " ") {
    return highlightKeyed(line, base)
  }
  return highlightGeneric(line, base)
}

/// Highlights a whole fenced block, so a block comment or a triple-quoted
/// string keeps its colour on every line it covers.
internal func HighlightBlock(lines List[string], lang string, base Style) List[List[Span]] {
  let out = List[List[Span]]()
  let l = lang.ToLower()
  let clike = SyntaxData.CLangs.Contains(" " + l + " ")
  let py = SyntaxData.PyLangs.Contains(" " + l + " ")
  var state = 0

  for line in lines {
    if state == 0 {
      out.Add(HighlightCode(line, lang, base))
      if clike && opensComment(line) { state = 1 }
      if py { state = opensTriple(line) }
      continue
    }
    let closer = closerOf(state)
    let at = line.IndexOf(closer)
    let spans = List[Span]()
    if at < 0 {
      if line != "" { spans.Add(Span(line, spillStyle(state, base))) }
    } else {
      let end = at + closer.Length
      spans.Add(Span(line.Substring(0, end), spillStyle(state, base)))
      for s in HighlightCode(line.Substring(end), lang, base) { spans.Add(s) }
      state = 0
    }
    out.Add(spans)
  }
  return out
}

internal func opensComment(line string) bool {
  let at = line.LastIndexOf("/*")
  if at < 0 { return false }
  return line.IndexOf("*/", at + 2) < 0
}

internal func opensTriple(line string) int32 {
  if oddCount(line, "\"\"\"") { return 2 }
  if oddCount(line, "'''") { return 3 }
  return 0
}

internal func oddCount(line string, marker string) bool {
  var n = 0
  var i = line.IndexOf(marker)
  while i >= 0 {
    n = n + 1
    i = line.IndexOf(marker, i + marker.Length)
  }
  return n % 2 == 1
}

internal func closerOf(state int32) string {
  if state == 1 { return "*/" }
  if state == 2 { return "\"\"\"" }
  return "'''"
}

internal func spillStyle(state int32, base Style) Style {
  return state == 1 ? commentStyle(base) : stringStyle(base)
}

/// Data that parameterizes the shared line scanner in `scanLine`. Every
/// field is a per-language on/off switch or table; the two bits of behaviour
/// that are not expressible as a switch (shell's `$`-expansion and JSON's
/// key-vs-value quote colour) are small guarded blocks inside `scanLine`
/// itself, not copies of the scan loop.
internal struct LineScanSpec {
  var CommentSlash bool
  var CommentDash bool
  var CommentHash bool
  var BlockComment bool
  var Backtick bool
  var SingleQuote bool
  var JsonKeyQuotes bool
  var Digits bool
  var NegativeNumbers bool
  var Ident bool
  var IdentUnderscoreStart bool
  var Keywords string
  var UpperFallbackType bool
  var DollarExpand bool
}

/// The one scan loop shared by every line-highlighter below. Walks `line`
/// from `start`, appending spans to `spans`, and is driven entirely by
/// `spec`. Comment markers, quote characters, digit/identifier scanning, and
/// the keyword table are all data; only shell's `${...}`/`$ident` and JSON's
/// key-quote colouring need a guarded block instead of a plain switch.
internal func scanLine(line string, base Style, spec LineScanSpec, spans List[Span], start int32) List[Span] {
  let n = line.Length
  var literal = ""
  var i = start
  while i < n {
    let c = line[i]
    if spec.CommentSlash && c == '/' && i + 1 < n && line[i + 1] == '/' {
      literal = flushLiteral(spans, literal, base)
      spans.Add(Span(line.Substring(i), commentStyle(base)))
      i = n
      continue
    }
    if spec.CommentDash && c == '-' && i + 1 < n && line[i + 1] == '-' {
      literal = flushLiteral(spans, literal, base)
      spans.Add(Span(line.Substring(i), commentStyle(base)))
      i = n
      continue
    }
    if spec.CommentHash && c == '#' {
      literal = flushLiteral(spans, literal, base)
      spans.Add(Span(line.Substring(i), commentStyle(base)))
      i = n
      continue
    }
    if spec.BlockComment && c == '/' && i + 1 < n && line[i + 1] == '*' {
      let close = line.IndexOf("*/", i + 2)
      if close >= 0 {
        literal = flushLiteral(spans, literal, base)
        let end = close + 2
        spans.Add(Span(line.Substring(i, end - i), commentStyle(base)))
        i = end
        continue
      }
    }
    if c == '"' || (spec.SingleQuote && c == '\'') || (spec.Backtick && c == '`') {
      literal = flushLiteral(spans, literal, base)
      let end = scanQuoteEnd(line, i + 1, c)
      let style = spec.JsonKeyQuotes ? quoteKeyStyle(line, end, base) : stringStyle(base)
      spans.Add(Span(line.Substring(i, end - i), style))
      i = end
      continue
    }
    if spec.DollarExpand && c == '$' && i + 1 < n && line[i + 1] == '{' {
      literal = flushLiteral(spans, literal, base)
      let close = line.IndexOf('}', i + 2)
      let end = close >= 0 ? close + 1 : n
      spans.Add(Span(line.Substring(i, end - i), typeStyle(base)))
      i = end
      continue
    }
    if spec.DollarExpand && c == '$' {
      let end = scanIdentEnd(line, i + 1)
      if end > i + 1 {
        literal = flushLiteral(spans, literal, base)
        spans.Add(Span(line.Substring(i, end - i), typeStyle(base)))
        i = end
        continue
      }
    }
    if spec.Digits && spec.NegativeNumbers && c == '-' && i + 1 < n && Char.IsDigit(line[i + 1]) {
      literal = flushLiteral(spans, literal, base)
      let end = scanNumberEnd(line, i + 1)
      spans.Add(Span(line.Substring(i, end - i), numberStyle(base)))
      i = end
      continue
    }
    if spec.Digits && Char.IsDigit(c) {
      literal = flushLiteral(spans, literal, base)
      let end = scanNumberEnd(line, i)
      spans.Add(Span(line.Substring(i, end - i), numberStyle(base)))
      i = end
      continue
    }
    if spec.Ident && (Char.IsLetter(c) || (spec.IdentUnderscoreStart && c == '_')) {
      let end = scanIdentEnd(line, i)
      let word = line.Substring(i, end - i)
      literal = flushLiteral(spans, literal, base)
      if spec.Keywords.Contains(" " + word + " ") {
        spans.Add(Span(word, keywordStyle(base)))
      } else if spec.UpperFallbackType && Char.IsUpper(c) {
        spans.Add(Span(word, typeStyle(base)))
      } else {
        spans.Add(Span(word, base))
      }
      i = end
      continue
    }
    literal = literal + line.Substring(i, 1)
    i = i + 1
  }
  literal = flushLiteral(spans, literal, base)
  return spans
}

/// A JSON quoted string is a key (typeStyle) if the first non-space
/// character after its closing quote is `:`, otherwise it is a value
/// (stringStyle).
internal func quoteKeyStyle(line string, end int32, base Style) Style {
  let n = line.Length
  var peek = end
  while peek < n && line[peek] == ' ' {
    peek = peek + 1
  }
  let isKey = peek < n && line[peek] == ':'
  return isKey ? typeStyle(base) : stringStyle(base)
}

internal func highlightCLike(line string, base Style, backtick bool, dash bool) List[Span] {
  var spec = LineScanSpec{}
  spec.CommentSlash = true
  spec.CommentDash = dash
  spec.BlockComment = true
  spec.Backtick = backtick
  spec.SingleQuote = true
  spec.Digits = true
  spec.Ident = true
  spec.IdentUnderscoreStart = true
  spec.Keywords = SyntaxData.CKeywords
  spec.UpperFallbackType = true
  return scanLine(line, base, spec, List[Span](), 0)
}

internal func highlightShell(line string, base Style) List[Span] {
  var spec = LineScanSpec{}
  spec.CommentHash = true
  spec.SingleQuote = true
  spec.DollarExpand = true
  spec.Ident = true
  spec.IdentUnderscoreStart = true
  spec.Keywords = SyntaxData.ShellKeywords
  return scanLine(line, base, spec, List[Span](), 0)
}

internal func highlightPython(line string, base Style) List[Span] {
  var spec = LineScanSpec{}
  spec.CommentHash = true
  spec.SingleQuote = true
  spec.Ident = true
  spec.IdentUnderscoreStart = true
  spec.Keywords = SyntaxData.PyKeywords
  return scanLine(line, base, spec, List[Span](), 0)
}

internal func highlightJson(line string, base Style) List[Span] {
  var spec = LineScanSpec{}
  spec.JsonKeyQuotes = true
  spec.Digits = true
  spec.NegativeNumbers = true
  spec.Ident = true
  spec.Keywords = SyntaxData.JsonKeywords
  return scanLine(line, base, spec, List[Span](), 0)
}

internal func highlightKeyed(line string, base Style) List[Span] {
  let spans = List[Span]()
  let n = line.Length
  var indent = 0
  while indent < n && line[indent] == ' ' {
    indent = indent + 1
  }
  var i = indent
  if indent > 0 {
    spans.Add(Span(line.Substring(0, indent), base))
  }

  let delim = findKeyDelim(line, indent)
  if delim > indent {
    var keyEnd = delim
    while keyEnd > indent && line[keyEnd - 1] == ' ' {
      keyEnd = keyEnd - 1
    }
    if keyEnd > indent {
      spans.Add(Span(line.Substring(indent, keyEnd - indent), typeStyle(base)))
      if keyEnd < delim {
        spans.Add(Span(line.Substring(keyEnd, delim - keyEnd), base))
      }
      i = delim
    }
  }

  var spec = LineScanSpec{}
  spec.CommentHash = true
  spec.SingleQuote = true
  return scanLine(line, base, spec, spans, i)
}

internal func findKeyDelim(line string, start int32) int32 {
  let n = line.Length
  var j = start
  while j < n {
    let c = line[j]
    if c == '#' || c == '"' || c == '\'' { return -1 }
    if c == '=' || c == ':' { return j }
    j = j + 1
  }
  return -1
}

internal func highlightDiff(line string, base Style) List[Span] {
  let spans = List[Span]()
  if line == "" { return spans }
  if line.StartsWith("@@") {
    spans.Add(Span(line, typeStyle(base)))
    return spans
  }
  if line.StartsWith("+++") || line.StartsWith("---") || line.StartsWith("diff ") || line.StartsWith("index ") {
    spans.Add(Span(line, keywordStyle(base)))
    return spans
  }
  if line[0] == '+' {
    spans.Add(Span(line, stringStyle(base)))
    return spans
  }
  if line[0] == '-' {
    spans.Add(Span(line, removedStyle(base)))
    return spans
  }
  spans.Add(Span(line, base))
  return spans
}

internal func highlightGeneric(line string, base Style) List[Span] {
  var spec = LineScanSpec{}
  spec.CommentSlash = true
  spec.CommentHash = true
  spec.SingleQuote = true
  spec.Digits = true
  return scanLine(line, base, spec, List[Span](), 0)
}


internal func scanQuoteEnd(line string, start int32, quote char) int32 {
  let n = line.Length
  var j = start
  while j < n {
    if line[j] == '\\' && j + 1 < n {
      j = j + 2
      continue
    }
    if line[j] == quote { return j + 1 }
    j = j + 1
  }
  return n
}

internal func scanNumberEnd(line string, start int32) int32 {
  let n = line.Length
  var j = start
  while j < n && (Char.IsDigit(line[j]) || line[j] == '.') {
    j = j + 1
  }
  return j
}

internal func scanIdentEnd(line string, start int32) int32 {
  let n = line.Length
  var j = start
  while j < n && (Char.IsLetterOrDigit(line[j]) || line[j] == '_') {
    j = j + 1
  }
  return j
}

internal func commentStyle(base Style) Style { return colored(base, "555C6B") }
internal func stringStyle(base Style) Style { return colored(base, "6CBC5F") }
internal func numberStyle(base Style) Style { return colored(base, "D1A047") }
internal func keywordStyle(base Style) Style { return colored(base, "B47FD1") }
internal func typeStyle(base Style) Style { return colored(base, "478AD1") }
internal func removedStyle(base Style) Style { return colored(base, "C96C6C") }

internal func colored(base Style, foreground string) Style {
  return Style{
    Foreground: Color.Rgb(foreground),
    Background: base.Background,
    Attributes: base.Attributes,
  }
}
