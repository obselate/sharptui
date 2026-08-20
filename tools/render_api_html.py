from __future__ import annotations

from html import escape
from pathlib import Path
import re

try:
    from bs4 import BeautifulSoup, Tag
    from markdown_it import MarkdownIt
    from pygments import highlight
    from pygments.formatters import HtmlFormatter
    from pygments.lexer import RegexLexer
    from pygments.lexers import BashLexer
    from pygments.token import Comment, Keyword, Name, Number, String, Text
except ModuleNotFoundError as error:
    raise SystemExit(
        "render_api_html.py requires beautifulsoup4, markdown-it-py, and pygments"
    ) from error


ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "api"
GITHUB = "https://github.com/obselate/sharptui/blob/main"

DOCUMENTS = (
    {
        "source": "README.md",
        "output": "README.html",
        "code": "STUI-00",
        "kind": "Publication index",
        "summary": "Authority, regeneration, publication register, and project boundaries for the SharpTUI public API.",
        "cycle": (("Choose", "task"), ("Open", "guide"), ("Verify", "member"), ("Build", "app")),
        "cycle_caption": "Documentation lookup route",
    },
    {
        "source": "reference.md",
        "output": "reference.html",
        "code": "STUI-REF",
        "kind": "Reference manual",
        "summary": "The generated contract for every exported SharpTUI type and declared public member.",
        "cycle": (("Find", "type"), ("Read", "contract"), ("Select", "member"), ("Call", "API")),
        "cycle_caption": "Public API lookup route",
    },
    {
        "source": "text-and-rich-content.md",
        "output": "text-and-rich-content.html",
        "code": "STUI-TXT",
        "kind": "Application guide",
        "summary": "Display text, input, document editing, rich lines, Markdown, and source highlighting.",
        "cycle": (("Choose", "surface"), ("Supply", "content"), ("Route", "editing"), ("Draw", "text")),
        "cycle_caption": "Text control operating cycle",
    },
    {
        "source": "collections.md",
        "output": "collections.html",
        "code": "STUI-COL",
        "kind": "Application guide",
        "summary": "Selection, identity, refresh, and viewport rules for list, table, tree, tab, and status controls.",
        "cycle": (("Supply", "source"), ("Present", "rows"), ("Change", "selection"), ("Refresh", "view")),
        "cycle_caption": "Collection view operating cycle",
    },
    {
        "source": "controls-and-overlays.md",
        "output": "controls-and-overlays.html",
        "code": "STUI-CTL",
        "kind": "Application guide",
        "summary": "Control state, focus, selection, overlay scope, dialogs, spinners, and splitters.",
        "cycle": (("Route", "input"), ("Change", "state"), ("Resolve", "focus"), ("Draw", "overlay")),
        "cycle_caption": "Control and overlay operating cycle",
    },
    {
        "source": "input-and-commands.md",
        "output": "input-and-commands.html",
        "code": "STUI-INP",
        "kind": "Application guide",
        "summary": "Typed input, gestures, command bindings, routing order, mouse reporting, and focus.",
        "cycle": (("Read", "event"), ("Match", "gesture"), ("Route", "phases"), ("Handle", "result")),
        "cycle_caption": "Input routing cycle",
    },
    {
        "source": "layout-and-styling.md",
        "output": "layout-and-styling.html",
        "code": "STUI-LAY",
        "kind": "Application guide",
        "summary": "Cell geometry, flow, placement, exact styles, semantic themes, and terminal text measurement.",
        "cycle": (("Measure", "cells"), ("Flow", "children"), ("Resolve", "style"), ("Draw", "frame")),
        "cycle_caption": "Layout and styling cycle",
    },
    {
        "source": "canvas-animation-and-work.md",
        "output": "canvas-animation-and-work.html",
        "code": "STUI-CAN",
        "kind": "Application guide",
        "summary": "Retained subcell drawing, indicators, animation recipes, and app-owned background work.",
        "cycle": (("Start", "work"), ("Post", "state"), ("Sample", "motion"), ("Draw", "canvas")),
        "cycle_caption": "Background work and frame cycle",
    },
)

PUBLICATIONS = (
    ("API index", "README.html"),
    ("Getting started", "getting-started.html"),
    ("Layout and styling", "layout-and-styling.html"),
    ("Input and commands", "input-and-commands.html"),
    ("Text and rich content", "text-and-rich-content.html"),
    ("Collections", "collections.html"),
    ("Controls and overlays", "controls-and-overlays.html"),
    ("Canvas, animation, and work", "canvas-animation-and-work.html"),
    ("API reference", "reference.html"),
)


class GSharpLexer(RegexLexer):
    name = "GSharp"
    aliases = ["gs", "gsharp"]
    tokens = {
        "root": [
            (r"//.*?$", Comment.Single),
            (r"/\*", Comment.Multiline, "comment"),
            (r'"(?:\\.|[^"\\])*"', String.Double),
            (r"'(?:\\.|[^'\\])*'", String.Single),
            (
                r"\b(?:package|import|class|interface|struct|enum|func|prop|init|let|var|private|public|shared|return|if|else|for|while|in|out|break|continue|true|false|nil|new|this|base)\b",
                Keyword,
            ),
            (r"\b(?:string|bool|byte|int16|int32|int64|uint16|uint32|uint64|float32|float64|char|void)\b", Keyword.Type),
            (r"\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b", Number),
            (r"\b[a-zA-Z_][A-Za-z0-9_]*(?=\s*\()", Name.Function),
            (r"\b[A-Z][A-Za-z0-9_]*\b", Name.Class),
            (r"\s+", Text.Whitespace),
            (r".", Text),
        ],
        "comment": [
            (r"[^*/]+", Comment.Multiline),
            (r"\*/", Comment.Multiline, "#pop"),
            (r"[*/]", Comment.Multiline),
        ],
    }


EXTENSION_CSS = r'''
.skip-link{
  position:fixed;
  z-index:20;
  top:0;
  left:24px;
  padding:12px 18px;
  transform:translateY(-120%);
  border:2px solid var(--blue-60);
  background:var(--paper);
  color:var(--ink);
  font-family:var(--mono);
  font-size:8pt;
  font-weight:700;
  text-transform:uppercase;
}
.skip-link:focus{transform:translateY(0)}
.manual--generated .sheet{
  height:auto;
  min-height:11in;
  overflow:visible;
}
.manual--generated .sheet--cover{height:11in;overflow:hidden}
.manual--generated .page-body{min-width:0}
.manual--generated .chapter-copy{min-width:0}
.manual--generated .chapter-copy > :first-child{margin-top:0}
.manual--generated .chapter-copy > :last-child{margin-bottom:0}
.manual--generated .chapter-copy > p,
.manual--generated .chapter-copy > ul,
.manual--generated .chapter-copy > ol,
.manual--generated .chapter-copy > blockquote{max-width:6.8in}
.manual--generated ul,
.manual--generated ol{margin:.1in 0 .16in;padding-left:.25in}
.manual--generated li{margin:.055in 0}
.manual--generated blockquote{
  margin:.14in 0;
  padding:.1in .12in;
  border-left:.045in solid var(--blue-60);
  background:var(--neutral-10);
}
.manual--generated blockquote > :last-child{margin-bottom:0}
.manual--generated .table-scroll{
  max-width:100%;
  margin:.13in 0 .16in;
  overflow-x:auto;
}
.manual--generated .table-scroll .manual-table{margin:0}
.manual--generated .manual-table{table-layout:auto}
.manual--generated .manual-table th,
.manual--generated .manual-table td{overflow-wrap:anywhere}
.manual--generated .listing pre code{font-size:inherit}
.k,.kc,.kd,.kn,.kp,.kr,.kt{color:var(--syntax-keyword);font-weight:700}
.nc,.nb,.bp{color:var(--syntax-type);font-weight:700}
.nf,.fm{color:var(--syntax-call)}
.s,.s1,.s2,.se{color:var(--syntax-string)}
.m,.mi,.mf,.mh{color:var(--syntax-number)}
.c,.c1,.cm{color:var(--neutral-60)}
.manual--generated .type-register{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  width:calc(100% - .36in);
  margin:.13in auto .32in;
  padding:0;
  border-top:1px solid var(--neutral-40);
  border-left:1px solid var(--neutral-40);
  list-style:none;
}
.type-register li:last-child:nth-child(3n+1){
  display:grid;
  grid-column:1 / -1;
  grid-template-columns:repeat(3,minmax(0,1fr));
}
.type-register li:last-child:nth-child(3n+1) a{
  grid-column:2;
  border-right:1px solid var(--neutral-40);
  border-left:1px solid var(--neutral-40);
}
.type-register li{
  min-width:0;
  margin:0;
  border-right:1px solid var(--neutral-40);
  border-bottom:1px solid var(--neutral-40);
}
.type-register a{
  display:block;
  min-height:.34in;
  padding:.07in .075in;
  font-family:var(--mono);
  font-size:7.2pt;
  line-height:1.3;
  overflow-wrap:anywhere;
  text-decoration:none;
}
.reference-tools{
  display:grid;
  grid-template-columns:.88in minmax(0,1fr);
  margin:.14in 0;
  border:1px solid var(--neutral-70);
}
.reference-tools > strong{
  padding:.09in;
  background:var(--blue-70);
  color:var(--paper);
  font-family:var(--mono);
  font-size:7.5pt;
  line-height:1.25;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.filter-panel{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:.08in;
  padding:.08in;
}
.filter-panel label{
  grid-column:1/-1;
  font-family:var(--mono);
  font-size:7pt;
  font-weight:700;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.filter-panel input{
  min-width:0;
  min-height:.36in;
  padding:.055in .075in;
  border:1px solid var(--neutral-70);
  border-radius:0;
  background:var(--paper);
  color:var(--ink);
  font:8pt/1.35 var(--mono);
}
.filter-count{
  display:flex;
  min-width:.88in;
  align-items:center;
  justify-content:center;
  padding:.055in .075in;
  background:var(--neutral-80);
  color:var(--paper);
  font:700 7pt/1.3 var(--mono);
  letter-spacing:.04em;
  text-transform:uppercase;
}
.contents-table a{text-decoration:none}
.contents-table a:hover{text-decoration:underline}
.contents-table--continued{margin-top:.12in}
.chapter-copy h3 code{font-size:.82em}
.api-type h3{
  padding-bottom:.045in;
  border-bottom:1px solid var(--neutral-40);
  color:var(--neutral-70);
  font-family:var(--mono);
  font-size:8.5pt;
  letter-spacing:.055em;
  text-transform:uppercase;
}
.api-type h3 + ul{
  width:calc(100% - .36in);
  margin:.06in auto .28in;
  padding:0;
  border-top:1px solid var(--neutral-40);
  list-style:none;
}
.api-type .chapter-copy,
.type-register-sheet .chapter-copy{padding-bottom:.24in}
.api-type h3 + ul > li{
  margin:0;
  padding:.075in;
  border-bottom:1px solid var(--neutral-40);
}
.api-type h3 + ul > li > ul{
  margin:.055in 0 0;
  padding-left:.22in;
  color:var(--neutral-70);
}
.api-type[hidden],
.type-register li[hidden],
.contents-table tr[hidden]{display:none}
@media screen and (max-width:880px){
  .manual--generated .sheet,
  .manual--generated .sheet--cover{
    width:calc(100vw - 24px);
    height:auto;
    min-height:calc((100vw - 24px) * 1.294);
    overflow:visible;
  }
}
@media screen and (max-width:560px){
  .manual--generated .table-scroll .manual-table{min-width:34rem}
  .manual--generated .type-register{width:100%;grid-template-columns:1fr}
  .type-register li:last-child:nth-child(3n+1){display:block;grid-column:auto}
  .type-register li:last-child:nth-child(3n+1) a{border-right:0;border-left:0}
  .api-type h3 + ul{width:100%}
  .reference-tools{grid-template-columns:1fr}
  .filter-panel{grid-template-columns:1fr}
  .filter-count{min-height:.34in}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{scroll-behavior:auto!important;transition-duration:0ms!important;animation-duration:0ms!important}
}
@media print{
  .skip-link,.reference-tools{display:none}
  .manual--generated .sheet{break-after:page;page-break-after:always}
  .manual--generated .sheet:last-child{break-after:auto;page-break-after:auto}
  .manual--generated .table-scroll{overflow:visible}
}
'''


REFERENCE_SCRIPT = '''<script>
const filter = document.querySelector("#api-filter")
const count = document.querySelector("#api-filter-count")
const sections = [...document.querySelectorAll(".api-type")]
const registerLinks = [...document.querySelectorAll(".type-register a, .contents-table a[href^='#sharptui']")]
const applyFilter = () => {
  const query = filter.value.trim().toLowerCase()
  let visible = 0
  sections.forEach(section => {
    const show = !query || section.dataset.search.includes(query)
    section.hidden = !show
    visible += show ? 1 : 0
  })
  registerLinks.forEach(link => {
    const target = document.querySelector(link.hash)
    const row = link.closest("li, tr")
    if (row) row.hidden = Boolean(target && target.hidden)
  })
  count.textContent = `${visible} ${visible === 1 ? "type" : "types"}`
}
filter.addEventListener("input", applyFilter)
</script>'''


def github_path(path: str, fragment: str = "") -> str:
    suffix = f"#{fragment}" if fragment else ""
    return f"{GITHUB}/{path}{suffix}"


def github_slug(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^\w\- ]", "", value)
    return value.replace(" ", "-")


def document_title(markdown: str) -> str:
    match = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    if match is None:
        raise ValueError("Document has no level-one heading")
    return match.group(1).strip()


def without_title(markdown: str) -> str:
    return re.sub(r"^#\s+.+?\n+", "", markdown, count=1, flags=re.MULTILINE)


def display_title(title: str) -> str:
    return re.sub(r"^0*\d+\s*(?:/\s*)?", "", title).strip()


def fence_renderer(tokens, index, options, env) -> str:
    token = tokens[index]
    language = token.info.strip().split()[0].lower() if token.info.strip() else "text"
    if language in {"gs", "gsharp"}:
        rendered = highlight(token.content, GSharpLexer(), HtmlFormatter(nowrap=True))
    elif language in {"sh", "shell", "bash"}:
        rendered = highlight(token.content, BashLexer(), HtmlFormatter(nowrap=True))
    else:
        rendered = escape(token.content)
    return f'<pre class="language-{escape(language)}"><code>{rendered}</code></pre>\n'


def markdown_renderer() -> MarkdownIt:
    renderer = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False})
    renderer.enable("table")
    renderer.renderer.rules["fence"] = fence_renderer
    return renderer


def reference_types() -> dict[str, str]:
    markdown = (DOCS / "reference.md").read_text(encoding="utf-8")
    result = {}
    for full_name in re.findall(r"^## (SharpTui\.[^\n]+)$", markdown, re.MULTILINE):
        simple_name = full_name.rsplit(".", 1)[-1].split("`", 1)[0]
        result[simple_name] = github_slug(full_name)
    return result


def assign_heading_ids(soup: BeautifulSoup) -> None:
    counts: dict[str, int] = {}
    for heading in soup.find_all(re.compile(r"^h[2-6]$")):
        base = github_slug(heading.get_text(" ", strip=True))
        count = counts.get(base, 0)
        counts[base] = count + 1
        heading["id"] = base if count == 0 else f"{base}-{count}"


def rewrite_links(soup: BeautifulSoup, output_names: set[str]) -> None:
    for link in soup.find_all("a", href=True):
        href = link["href"]
        if href.startswith(("https://", "http://", "#")):
            continue
        path, marker, fragment = href.partition("#")
        target = Path(path)
        if target.suffix == ".md":
            html_name = f"{target.stem}.html"
            published = html_name if html_name in output_names or target.name == "getting-started.md" else target.name
            link["href"] = github_path(f"docs/api/{published}", fragment if marker else "")
            continue
        normalized = (Path("docs/api") / target).as_posix()
        link["href"] = github_path(normalized, fragment if marker else "")


def link_api_code(soup: BeautifulSoup, types: dict[str, str], is_reference: bool) -> None:
    if is_reference:
        return
    candidates = sorted(types, key=len, reverse=True)
    for code in list(soup.find_all("code")):
        if code.find_parent(("pre", "a")) is not None:
            continue
        value = code.get_text()
        match_name = next(
            (
                name
                for name in candidates
                if re.search(rf"(?<![A-Za-z0-9_]){re.escape(name)}(?=$|[^A-Za-z0-9_])", value)
            ),
            None,
        )
        if match_name is None:
            continue
        link = soup.new_tag(
            "a",
            href=github_path("docs/api/reference.html", types[match_name]),
            attrs={"class": "api-ref"},
        )
        code.wrap(link)


def split_source(soup: BeautifulSoup) -> tuple[list, list[dict]]:
    intro = []
    chapters = []
    current = None
    for node in list(soup.contents):
        node.extract()
        if isinstance(node, Tag) and node.name == "h2":
            current = {"heading": node, "nodes": []}
            chapters.append(current)
        elif current is None:
            intro.append(node)
        else:
            current["nodes"].append(node)
    return intro, chapters


def transform_tables(soup: BeautifulSoup, container: Tag) -> None:
    for table in list(container.find_all("table")):
        heading = table.find_previous(["h2", "h3"])
        if heading is not None:
            table["aria-label"] = heading.get_text(" ", strip=True)
        table["class"] = ["manual-table"]
        wrapper = soup.new_tag("div")
        wrapper["class"] = ["table-scroll"]
        table.wrap(wrapper)


def transform_listings(
    soup: BeautifulSoup,
    container: Tag,
    chapter_number: int,
    chapter_title: str,
) -> list[dict[str, str]]:
    records = []
    for listing_number, pre in enumerate(list(container.find_all("pre")), start=1):
        local_heading = pre.find_previous("h3")
        caption_title = local_heading.get_text(" ", strip=True) if local_heading is not None else chapter_title
        figure = soup.new_tag("figure")
        figure["class"] = ["listing"]
        caption = soup.new_tag("figcaption")
        caption["class"] = ["listing-head"]
        number = soup.new_tag("span")
        number.string = f"Listing {chapter_number}-{listing_number}"
        description = soup.new_tag("span")
        description.string = caption_title
        caption.extend((number, description))
        pre.wrap(figure)
        figure.insert(0, caption)
        records.append(
            {
                "kind": "Listing",
                "number": f"{chapter_number}-{listing_number}",
                "title": caption_title,
                "page": f"{chapter_number}-1",
            }
        )
    return records


def reference_search(type_count: int) -> str:
    return f'''<div class="reference-tools" role="search">
  <strong>Filter</strong>
  <div class="filter-panel">
    <label for="api-filter">Public types and members</label>
    <input id="api-filter" type="search" autocomplete="off" spellcheck="false" placeholder="App, TextInput, StartWorker">
    <output class="filter-count" id="api-filter-count" for="api-filter" aria-live="polite">{type_count} types</output>
  </div>
</div>'''


def prepare_chapters(
    soup: BeautifulSoup,
    source_chapters: list[dict],
    is_reference: bool,
) -> tuple[list[dict], list[dict[str, str]]]:
    chapters = []
    listing_records = []
    type_count = sum(
        1 for source in source_chapters if source["heading"].get_text(" ", strip=True).startswith("SharpTui.")
    )
    for chapter_number, source in enumerate(source_chapters, start=1):
        heading = source["heading"]
        source_title = heading.get_text(" ", strip=True)
        title = display_title(source_title)
        heading.clear()
        heading.string = title
        container = soup.new_tag("div")
        container["class"] = ["chapter-copy"]
        for node in source["nodes"]:
            container.append(node)
        transform_tables(soup, container)
        records = transform_listings(soup, container, chapter_number, title)
        listing_records.extend(records)
        classes = ["sheet"]
        search_text = ""
        if is_reference and source_title == "Types":
            classes.append("type-register-sheet")
            register = container.find("ul")
            if register is not None:
                register["class"] = ["type-register"]
                register.insert_before(BeautifulSoup(reference_search(type_count), "html.parser"))
        if is_reference and source_title.startswith("SharpTui."):
            classes.append("api-type")
            search_text = f'{source_title} {container.get_text(" ", strip=True)}'.lower()
        body_html = "".join(str(node) for node in container.contents).strip()
        chapters.append(
            {
                "number": chapter_number,
                "title": title,
                "source_title": source_title,
                "heading": str(heading),
                "heading_id": heading["id"],
                "body": body_html,
                "classes": " ".join(classes),
                "search": search_text,
            }
        )
    return chapters, listing_records


def roman(number: int) -> str:
    values = ((10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"))
    result = []
    remaining = number
    for value, symbol in values:
        while remaining >= value:
            result.append(symbol)
            remaining -= value
    return "".join(result)


def contents_table(chapters: list[dict], continued: bool = False) -> str:
    rows = "".join(
        f'<tr><td>{chapter["number"]}</td><td><a href="#{escape(chapter["heading_id"])}">{escape(chapter["title"])}</a></td><td>{chapter["number"]}-1</td></tr>'
        for chapter in chapters
    )
    extra = " contents-table--continued" if continued else ""
    return f'''<table class="contents-table{extra}" aria-label="Table of contents">
  <thead><tr><th>Chapter</th><th>Subject</th><th>Page</th></tr></thead>
  <tbody>{rows}</tbody>
</table>'''


def register_table(records: list[dict[str, str]]) -> str:
    rows = "".join(
        f'<tr><td>{escape(record["kind"])}</td><td>{escape(record["number"])}</td><td>{escape(record["title"])}</td><td>{escape(record["page"])}</td></tr>'
        for record in records
    )
    return f'''<table class="contents-table register-table" aria-label="Illustration and listing register">
  <thead><tr><th>Kind</th><th>No.</th><th>Title</th><th>Page</th></tr></thead>
  <tbody>{rows}</tbody>
</table>'''


def running_head(title: str, code: str) -> str:
    return f'''<header class="running-head">
  <span>{escape(title)}</span>
  <span>{escape(code)} / Revision A</span>
</header>'''


def folio(label: str, page: str) -> str:
    return f'''<footer class="folio">
  <span>{escape(label)}</span>
  <span>{escape(page)}</span>
</footer>'''


def cover(metadata: dict[str, str], title: str) -> str:
    cycle_cells = []
    for index, (first, second) in enumerate(metadata["cycle"]):
        if index:
            cycle_cells.append('<td class="signal" aria-hidden="true">&#8594;</td>')
        active = ' class="active"' if index == 0 else ""
        cycle_cells.append(f'<td{active}>{escape(first)}<br>{escape(second)}</td>')
    cycle = "\n          ".join(cycle_cells)
    return f'''<section class="sheet sheet--cover" aria-labelledby="manual-title">
  <div class="registration">
    <span class="registration-mark" aria-hidden="true"></span>
    <span>SharpTUI Technical Publications</span>
  </div>
  <div class="cover-rule" aria-hidden="true"></div>
  <div class="cover-register">
    <div>Manual no. {escape(metadata["code"])}<br>Supersedes: initial issue</div>
    <div>Revision A<br>August 2026</div>
  </div>
  <div class="cover-main">
    <div>
      <p class="cover-class">{escape(metadata["kind"])}</p>
      <h1 id="manual-title">{escape(title)}</h1>
      <p class="cover-subtitle">{escape(metadata["summary"])}</p>
      <table class="system-figure" aria-label="{escape(metadata["cycle_caption"])}">
        <tbody><tr>
          {cycle}
        </tr></tbody>
      </table>
      <p class="figure-caption">Figure 0-1. {escape(metadata["cycle_caption"])}</p>
    </div>
    <div>
      <div class="cover-data">
        <div><b>Subject</b><span>Public API</span></div>
        <div><b>Applies to</b><span>Application authors</span></div>
        <div><b>Language</b><span>G# / .NET 10</span></div>
      </div>
      <div class="distribution">
        <b>Distribution</b>
        <span>For application authors, maintainers, and test operators. Keep with the current API reference.</span>
      </div>
    </div>
  </div>
</section>'''


def intro_html(intro: list, fallback: str) -> str:
    rendered = "".join(str(node) for node in intro).strip()
    return rendered if rendered else f'<p class="front-note">{escape(fallback)}</p>'


def front_matter(
    metadata: dict[str, str],
    title: str,
    intro: str,
    chapters: list[dict],
    records: list[dict[str, str]],
) -> str:
    separate_contents = len(chapters) > 30
    figure_records = [
        {"kind": "Figure", "number": "0-1", "title": metadata["cycle_caption"], "page": "Cover"}
    ]
    all_records = figure_records + records
    contents = ""
    if separate_contents:
        contents = '''<section class="manual-block" aria-labelledby="contents-control-title">
      <h3 class="block-title" id="contents-control-title">Contents control</h3>
      <p class="front-note">The complete table of contents begins on page iii and continues without interruption.</p>
    </section>'''
    else:
        contents = f'''<section class="manual-block" aria-labelledby="contents-title">
      <h3 class="block-title" id="contents-title">Table of contents</h3>
      {contents_table(chapters)}
    </section>'''
    manual_body = f'''<div class="front-grid">
  <div>
    <section class="manual-block" aria-labelledby="scope-title">
      <h3 class="block-title" id="scope-title">Scope</h3>
      <div class="front-note">{intro}</div>
    </section>
    <section class="manual-block" aria-labelledby="revision-title">
      <h3 class="block-title" id="revision-title">Revision record</h3>
      <table class="revision-table">
        <thead><tr><th>Rev.</th><th>Date</th><th>Description</th></tr></thead>
        <tbody><tr><td>A</td><td>2026-08</td><td>Initial issue</td></tr></tbody>
      </table>
    </section>
    <section class="manual-block" aria-labelledby="notation-title">
      <h3 class="block-title" id="notation-title">Reading notation</h3>
      <dl class="symbol-key">
        <dt>LISTING</dt><dd>Executable or illustrative source code.</dd>
        <dt>FIGURE</dt><dd>Operating or publication sequence.</dd>
        <dt><code>API</code></dt><dd>Public symbol from the current Release assembly.</dd>
      </dl>
    </section>
  </div>
  <div>
    {contents}
    <section class="manual-block" aria-labelledby="register-title">
      <h3 class="block-title" id="register-title">Illustration and listing register</h3>
      {register_table(all_records)}
    </section>
    <div class="instruction">
      <strong>Reference</strong>
      <p>For every public member, use the current <a href="{github_path("docs/api/reference.html")}">API reference</a>.</p>
    </div>
  </div>
</div>'''
    pages = [f'''<section class="sheet" aria-labelledby="manual-control">
  {running_head(title, metadata["code"])}
  <div class="page-body">
    <div class="chapter-mark">
      <div class="chapter-number">0</div>
      <div>
        <p class="chapter-label">Front matter</p>
        <h2 id="manual-control">Manual control</h2>
      </div>
    </div>
    {manual_body}
  </div>
  {folio("Front matter", "ii")}
</section>''']
    if separate_contents:
        chunks = [chapters[index:index + 24] for index in range(0, len(chapters), 24)]
        for index, chunk in enumerate(chunks):
            heading_id = f"contents-{index + 1}"
            block_title = "Table of contents" if index == 0 else "Table of contents continued"
            folio_label = "Table of contents" if index == 0 else "Contents continued"
            pages.append(f'''<section class="sheet" aria-labelledby="{heading_id}">
  {running_head(title, metadata["code"])}
  <div class="page-body">
    <div class="chapter-mark">
      <div class="chapter-number">0</div>
      <div>
        <p class="chapter-label">Front matter continued</p>
        <h2 id="{heading_id}">Table of contents</h2>
      </div>
    </div>
    <section class="manual-block" aria-labelledby="{heading_id}-title">
      <h3 class="block-title" id="{heading_id}-title">{block_title}</h3>
      {contents_table(chunk, True)}
    </section>
  </div>
  {folio(folio_label, roman(index + 3))}
</section>''')
    return "\n\n".join(pages)


def chapter_sheet(metadata: dict[str, str], title: str, chapter: dict) -> str:
    search = f' data-search="{escape(chapter["search"], quote=True)}"' if chapter["search"] else ""
    return f'''<section class="{chapter["classes"]}" aria-labelledby="{escape(chapter["heading_id"])}"{search}>
  {running_head(title, metadata["code"])}
  <div class="page-body">
    <div class="chapter-mark">
      <div class="chapter-number">{chapter["number"]}</div>
      <div>
        <p class="chapter-label">Chapter {chapter["number"]}</p>
        {chapter["heading"]}
      </div>
    </div>
    <div class="chapter-copy">
      {chapter["body"]}
    </div>
  </div>
  {folio(chapter["title"], f'{chapter["number"]}-1')}
</section>'''


def publication_register(current: str) -> str:
    entries = []
    for label, filename in PUBLICATIONS:
        marker = " Current publication." if filename == current else ""
        entries.append(
            f'<dt>{escape(label)}</dt><dd><a href="{github_path(f"docs/api/{filename}")}">{escape(filename)}</a>{marker}</dd>'
        )
    return "".join(entries)


def appendix(metadata: dict[str, str], title: str) -> str:
    source_link = github_path(f'docs/api/{metadata["source"]}')
    return f'''<section class="sheet" aria-labelledby="appendix-title">
  {running_head(title, metadata["code"])}
  <div class="page-body">
    <div class="chapter-mark">
      <div class="chapter-number">A</div>
      <div>
        <p class="chapter-label">Appendix A</p>
        <h2 id="appendix-title">Publication register</h2>
      </div>
    </div>
    <section class="manual-block" aria-labelledby="related-title">
      <h3 class="block-title" id="related-title">Related publications</h3>
      <dl class="related-list">{publication_register(metadata["output"])}</dl>
    </section>
    <section class="manual-block" aria-labelledby="source-title">
      <h3 class="block-title" id="source-title">Source issue</h3>
      <p class="small-print">The editable source for this publication is <a href="{source_link}">{escape(metadata["source"])}</a>. When code or behavior changes, update the source guide, this manual issue, and the API reference in the same review.</p>
    </section>
    <div class="distribution">
      <b>End of manual</b>
      <span>SharpTUI Technical Publications / {escape(metadata["code"])} / Revision A</span>
    </div>
  </div>
  {folio("Publication register", "A-1")}
</section>'''


def stylesheet() -> str:
    html = (DOCS / "getting-started.html").read_text(encoding="utf-8")
    match = re.search(r"<style>\s*(.*?)\s*</style>", html, re.DOTALL)
    if match is None:
        raise ValueError("getting-started.html has no embedded stylesheet")
    return f"{match.group(1).rstrip()}\n{EXTENSION_CSS.strip()}\n"


def render_document(metadata: dict[str, str], renderer: MarkdownIt, types: dict[str, str], outputs: set[str]) -> str:
    markdown = (DOCS / metadata["source"]).read_text(encoding="utf-8")
    title = document_title(markdown)
    is_reference = metadata["output"] == "reference.html"
    body = without_title(markdown)
    if is_reference:
        body = re.sub(r"^Public-symbol SHA-256: `[^`]+`\.\n", "", body, flags=re.MULTILINE)
    soup = BeautifulSoup(renderer.render(body), "html.parser")
    assign_heading_ids(soup)
    rewrite_links(soup, outputs)
    link_api_code(soup, types, is_reference)
    intro_nodes, source_chapters = split_source(soup)
    chapters, records = prepare_chapters(soup, source_chapters, is_reference)
    pages = [
        cover(metadata, title),
        front_matter(metadata, title, intro_html(intro_nodes, metadata["summary"]), chapters, records),
        *(chapter_sheet(metadata, title, chapter) for chapter in chapters),
        appendix(metadata, title),
    ]
    script = REFERENCE_SCRIPT if is_reference else ""
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{escape(metadata["summary"])}">
<link rel="canonical" href="{github_path(f'docs/api/{metadata["output"]}')}">
<link rel="stylesheet" href="publication.css">
<title>{escape(title)} / {escape(metadata["code"])}</title>
</head>
<body>
<a class="skip-link" href="#manual-control">Skip to manual control</a>
<main class="manual manual--generated">
  {chr(10).join(pages)}
</main>
{script}
</body>
</html>
'''


def main() -> None:
    renderer = markdown_renderer()
    types = reference_types()
    outputs = {metadata["output"] for metadata in DOCUMENTS}
    (DOCS / "publication.css").write_text(stylesheet(), encoding="utf-8", newline="\n")
    print("wrote docs/api/publication.css")
    for metadata in DOCUMENTS:
        rendered = render_document(metadata, renderer, types, outputs)
        (DOCS / metadata["output"]).write_text(rendered, encoding="utf-8", newline="\n")
        print(f'wrote docs/api/{metadata["output"]}')


if __name__ == "__main__":
    main()
