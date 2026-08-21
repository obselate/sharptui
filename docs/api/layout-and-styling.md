# Layout and styling

## Principle

Layout uses terminal cells. A width is a cell count. A height is a row count. The layout engine has no pixels to recover an arbitrary value from.

Do not use negative sizes or padding. Do not place a fixed overlay without checking the terminal rectangle that contains it.

For every member, see [reference.md](reference.md).

## 01 / Measure in cells

| Type | Value | Bound |
| --- | --- | --- |
| `CellLength` | `Auto` or `Cells(count)` | `count` is 0 or more. |
| `CellInsets` | Four edge insets or `All(cells)` | Every edge is 0 or more. |
| `CellPoint` | `Column`, `Row` | Both are 0 or more. |
| `CellSize` | `WidthCells`, `HeightRows` | Both are 0 or more. |
| `CellRect` | Origin plus width and height | Width and height are 0 or more. |

`CellRect.Contains` tests a point against its half-open rectangle. `CellRect.Inset` clamps a consumed width or height to 0. It does not return a negative rectangle.

```gs
let panel = Box{
  Width: CellLength.Cells(36),
  Height: CellLength.Cells(10),
  Padding: CellInsets{ LeftCells: 1, TopRows: 1, RightCells: 1, BottomRows: 1 },
  ShowBorder: true,
}

let cursor = CellPoint{ Column: 4, Row: 2 }
let size = CellSize{ WidthCells: 36, HeightRows: 10 }
let frame = CellRect{ Column: 0, Row: 0, WidthCells: 36, HeightRows: 10 }
let inside = frame.Contains(cursor)
```

`CellRect` permits a signed origin. Its width and height remain non-negative. `CellPoint` is for a non-negative terminal position.

## 02 / Flow before overlay

`Placement.InFlow` is the default. `Row` and `Column` lay in-flow children on their axis. `Placement.Centered` and `Placement.At(point)` remove a child from that flow.

| Placement | Layout effect | Bound |
| --- | --- | --- |
| `InFlow` | Sibling flex layout owns the position. | Default. |
| `Centered` | Centers outside the flow. | A fixed child can extend beyond its parent. |
| `At(point)` | Uses the exact terminal cell. | `point` uses non-negative coordinates. |

```gs
let dialog = Box{
  Width: CellLength.Cells(32),
  Height: CellLength.Cells(7),
  Placement: Placement.Centered,
  ShowBorder: true,
  Title: "confirm",
}
```

Use `Centered` for a bounded overlay. Use `At` only when the coordinates come from a checked cell position. A centered box does not shrink itself to fit a small terminal.

## 03 / Set a style

`Style()` inherits foreground, background, and attributes. `Color.Inherit` means the same thing for one color channel. `Color.TerminalDefault` uses the terminal-configured foreground or background.

| Type | Role | Exact rule |
| --- | --- | --- |
| `Color` | RGB or inherited color | `Rgb(hex)` accepts exactly 6 hexadecimal digits, without `#`. |
| `Style` | Foreground, background, attributes | Explicit colors override inherited colors. Attributes combine. |
| `TextAttributes` | Terminal appearance bits | `Bold`, `Dim`, `Italic`, `Underline`, `Reverse`, `Strikethrough`. |
| `HorizontalAlignment` | Label position | `Left`, `Center`, or `Right`. |

`Color.Rgb(red, green, blue)` accepts each channel from 0 through 255. No other channel values are valid.

```gs
let ink = Style{
  Foreground: Color.Rgb("E6EDF3"),
  Background: Color.Rgb(14, 17, 23),
  Attributes: TextAttributes.Bold,
}

let title = Label{
  Text: "SharpTUI",
  Alignment: HorizontalAlignment.Center,
  Style: ink,
}
```

Focus must remain visible. Give a focusable control a `FocusedStyle` that differs from its normal `Style`. Do not use color as the only selection cue. A prefix, marker, border, or text change gives the same state to terminals with limited color support.

## 04 / Define application tokens

SharpTUI does not define a theme type. A palette is ordinary application data, so define the exact token names and value types your application needs.

```gs
class AppPalette {
  public var MainText Color
  public var Panel Style

  init() {
    MainText = Color.Rgb("E6EDF3")
    Panel = Style{ Background: Color.Rgb("0E1117") }
  }
}

let palette = AppPalette()

let title = Label{
  Text: "SharpTUI",
  Style: Style{ Foreground: palette.MainText, Background: palette.Panel.Background },
}
```

Palette classes can contain any number of `Color`, `Style`, glyph, spacing, or application-specific values. SharpTUI widgets consume those values through their normal public properties. Controls keep explicit state styles such as `FocusedStyle` and `SelectedStyle`.

## 05 / Fit terminal text

`CellText` measures display cells, not UTF-16 code units. It keeps grapheme clusters intact.

| Method | Result | Width rule |
| --- | --- | --- |
| `MeasureWidth(text)` | Display-cell width | Wide clusters occupy their terminal width. |
| `Graphemes(text)` | User-perceived clusters | One list item per grapheme. |
| `Clip(text, widthCells)` | Longest fitting prefix | Width 0 or less returns `""`. |
| `Wrap(text, widthCells)` | Fitting lines | Width 0 or less returns no lines. |

```gs
let clipped = CellText.Clip("東京 SharpTUI", 8)
let lines = CellText.Wrap("one retained tree", 10)
```

Do not use `string.Length` to lay out terminal text. It can split a grapheme or mismeasure a double-width cluster.

## Don't

- Don't pass a negative `CellLength`, inset, point, size, width, or height.
- Don't use `Placement.Centered` as a small-terminal constraint.
- Don't pass `#RRGGBB` to `Color.Rgb`. Pass 6 digits only.
- Don't remove the focus distinction when applying a palette.
- Don't clip terminal text by code-unit count.
