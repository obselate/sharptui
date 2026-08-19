# SharpTUI public API

Generated from `SharpTui.Framework.dll` plus compiler-emitted and supplemental XML documentation by the API-surface tool.
Public-symbol SHA-256: `9f3f8c17a528d5a23a9cf53c157492a521a8bfc7f7259168293b0c544ad851c5`.

Inherited members are documented on their declaring type. Types and members absent from this document are not part of the exported API.

## Types

- [SharpTui.Animation](#sharptuianimation)
- [SharpTui.AnimationController](#sharptuianimationcontroller)
- [SharpTui.AnimationHandle](#sharptuianimationhandle)
- [SharpTui.AnimationState](#sharptuianimationstate)
- [SharpTui.App](#sharptuiapp)
- [SharpTui.Badge](#sharptuibadge)
- [SharpTui.Bind](#sharptuibind)
- [SharpTui.BindingPhase](#sharptuibindingphase)
- [SharpTui.Box](#sharptuibox)
- [SharpTui.Button](#sharptuibutton)
- [SharpTui.CanvasMode](#sharptuicanvasmode)
- [SharpTui.CanvasSurface](#sharptuicanvassurface)
- [SharpTui.CanvasView](#sharptuicanvasview)
- [SharpTui.CellInsets](#sharptuicellinsets)
- [SharpTui.CellLength](#sharptuicelllength)
- [SharpTui.CellPoint](#sharptuicellpoint)
- [SharpTui.CellRect](#sharptuicellrect)
- [SharpTui.CellSize](#sharptuicellsize)
- [SharpTui.CellText](#sharptuicelltext)
- [SharpTui.Color](#sharptuicolor)
- [SharpTui.Column](#sharptuicolumn)
- [SharpTui.ColumnWidth](#sharptuicolumnwidth)
- [SharpTui.Command](#sharptuicommand)
- [SharpTui.ControlState](#sharptuicontrolstate)
- [SharpTui.Dialog](#sharptuidialog)
- [SharpTui.DialogAction](#sharptuidialogaction)
- [SharpTui.Easing](#sharptuieasing)
- [SharpTui.EventResult](#sharptuieventresult)
- [SharpTui.HorizontalAlignment](#sharptuihorizontalalignment)
- [SharpTui.Key](#sharptuikey)
- [SharpTui.KeyGesture](#sharptuikeygesture)
- [SharpTui.KeyModifiers](#sharptuikeymodifiers)
- [SharpTui.KeyPhase](#sharptuikeyphase)
- [SharpTui.KeyedSource`2](#sharptuikeyedsource2)
- [SharpTui.Keymap](#sharptuikeymap)
- [SharpTui.Label](#sharptuilabel)
- [SharpTui.ListItem](#sharptuilistitem)
- [SharpTui.ListView](#sharptuilistview)
- [SharpTui.MarkdownTheme](#sharptuimarkdowntheme)
- [SharpTui.MarkdownView](#sharptuimarkdownview)
- [SharpTui.MouseButton](#sharptuimousebutton)
- [SharpTui.MouseKind](#sharptuimousekind)
- [SharpTui.MouseTracking](#sharptuimousetracking)
- [SharpTui.NumericRange](#sharptuinumericrange)
- [SharpTui.Overlay](#sharptuioverlay)
- [SharpTui.Placement](#sharptuiplacement)
- [SharpTui.ProgressBar](#sharptuiprogressbar)
- [SharpTui.RadioGroup](#sharptuiradiogroup)
- [SharpTui.RichLineSource](#sharptuirichlinesource)
- [SharpTui.RichTextBlock](#sharptuirichtextblock)
- [SharpTui.RichTextLine](#sharptuirichtextline)
- [SharpTui.Row](#sharptuirow)
- [SharpTui.Screen](#sharptuiscreen)
- [SharpTui.SearchDirection](#sharptuisearchdirection)
- [SharpTui.Select](#sharptuiselect)
- [SharpTui.SelectionChange](#sharptuiselectionchange)
- [SharpTui.Separator](#sharptuiseparator)
- [SharpTui.SeparatorOrientation](#sharptuiseparatororientation)
- [SharpTui.Sparkline](#sharptuisparkline)
- [SharpTui.Spinner](#sharptuispinner)
- [SharpTui.Splitter](#sharptuisplitter)
- [SharpTui.SplitterAxis](#sharptuisplitteraxis)
- [SharpTui.StatusBar](#sharptuistatusbar)
- [SharpTui.Style](#sharptuistyle)
- [SharpTui.SyntaxHighlighter](#sharptuisyntaxhighlighter)
- [SharpTui.TableCell](#sharptuitablecell)
- [SharpTui.TableColumn](#sharptuitablecolumn)
- [SharpTui.TableRow](#sharptuitablerow)
- [SharpTui.TableView](#sharptuitableview)
- [SharpTui.Tabs](#sharptuitabs)
- [SharpTui.TestDriver](#sharptuitestdriver)
- [SharpTui.TextArea](#sharptuitextarea)
- [SharpTui.TextAttributes](#sharptuitextattributes)
- [SharpTui.TextBlock](#sharptuitextblock)
- [SharpTui.TextInput](#sharptuitextinput)
- [SharpTui.TextPosition](#sharptuitextposition)
- [SharpTui.TextRun](#sharptuitextrun)
- [SharpTui.TextSelection](#sharptuitextselection)
- [SharpTui.TextWrapping](#sharptuitextwrapping)
- [SharpTui.Theme](#sharptuitheme)
- [SharpTui.ThemeRole](#sharptuithemerole)
- [SharpTui.Toggle](#sharptuitoggle)
- [SharpTui.TreeNode](#sharptuitreenode)
- [SharpTui.TreeRow](#sharptuitreerow)
- [SharpTui.TreeSource](#sharptuitreesource)
- [SharpTui.TreeView](#sharptuitreeview)
- [SharpTui.UiEvent](#sharptuiuievent)
- [SharpTui.UiEventKind](#sharptuiuieventkind)
- [SharpTui.View](#sharptuiview)
- [SharpTui.WorkerState](#sharptuiworkerstate)
- [SharpTui.Worker`1](#sharptuiworker1)

## SharpTui.Animation

Describes a composable time-based animation.

G# kind: `class`.

### Methods

- `shared func Lerp(from CellPoint, to CellPoint, progress float64) CellPoint` — Interpolates two terminal cell points at a normalized progress.
  - `from`: The starting point.
  - `to`: The ending point.
  - `progress`: The normalized interpolation progress, clamped to [0,1].
  - Returns: The interpolated cell point.
- `shared func Lerp(from Color, to Color, progress float64) Color` — Interpolates two RGB colors at a normalized progress.
  - `from`: The starting RGB color.
  - `to`: The ending RGB color.
  - `progress`: The normalized interpolation progress, clamped to [0,1].
  - Returns: The interpolated RGB color.
- `shared func Lerp(from float64, to float64, progress float64) float64` — Interpolates two scalar values at a normalized progress.
  - `from`: The starting value.
  - `to`: The ending value.
  - `progress`: The normalized interpolation progress, clamped to [0,1].
  - Returns: The interpolated scalar.
- `shared func Lerp(from int32, to int32, progress float64) int32` — Interpolates two integer values at a normalized progress.
  - `from`: The starting value.
  - `to`: The ending value.
  - `progress`: The normalized interpolation progress, clamped to [0,1].
  - Returns: The interpolated integer.
- `shared func Parallel(animations []Animation) Animation` — Runs animations at the same time.
  - `animations`: The child animations to run in parallel.
  - Returns: A parallel animation.
- `shared func Repeat(animation Animation) Animation` — Runs an animation repeatedly until its handle is cancelled or finished.
  - `animation`: The child animation to repeat.
  - Returns: An indefinitely repeating animation.
- `shared func Repeat(animation Animation, count int32) Animation` — Runs an animation a fixed number of times.
  - `animation`: The child animation to repeat.
  - `count`: The total number of executions, which must be positive.
  - Returns: A repeated animation.
- `shared func Sequence(animations []Animation) Animation` — Runs animations one after another.
  - `animations`: The child animations in execution order.
  - Returns: A sequence animation.
- `shared func Tween(duration TimeSpan, update Action[float64], easing Easing) Animation` — Creates a tween that invokes update with eased progress over its duration.
  - `duration`: The time over which the tween runs.
  - `update`: The UI-thread callback receiving the current progress.
  - `easing`: The interpolation curve.
  - Returns: A tween animation.
- `shared func Wait(duration TimeSpan) Animation` — Creates an animation that occupies time without changing state.
  - `duration`: The time over which the wait runs.
  - Returns: A wait animation.

## SharpTui.AnimationController

Controls animations owned by an application.

G# kind: `class`.

### Properties

- `prop MotionScale float64 { get; set; }` — Scales animation time. Zero completes active animations on the next app turn.

### Methods

- `func Play(animation Animation) AnimationHandle` — Starts an animation and returns its lifetime handle.
  - `animation`: The reusable animation recipe to run.
  - Returns: A handle that can cancel or finish the animation.

## SharpTui.AnimationHandle

Controls one running animation.

G# kind: `class`.

### Properties

- `prop State AnimationState { get; }` — Reports whether the animation is running, completed, or cancelled.

### Methods

- `func Cancel()` — Requests cancellation without applying another sample.
- `func Finish()` — Requests application of the exact terminal state and completion.

## SharpTui.AnimationState

Reports the lifetime state of an animation handle.

G# kind: `enum`.

### Values

- `Running` — The animation remains active.
- `Completed` — The final animation state was applied.
- `Cancelled` — The animation stopped without another sample.

## SharpTui.App

Owns the terminal session and drives the paint and input loop for a View or Box tree.

G# kind: `class`.

### Constructors

- `init()` — Creates an app with terminal-default colors, no ticking, drag mouse tracking, and Escape/Ctrl+C as quit gestures.

### Properties

- `prop Animations AnimationController { get; }` — Owns animations and their shared frame deadline.
- `prop DefaultStyle Style { get; set; }` — The style used for unstyled drawing in the application.
- `prop Keys Keymap { get; set; }` — Application bindings offered before and after View event handling.
- `prop MouseTracking MouseTracking { get; set; }` — Terminal mouse reporting selected when Run enters the terminal.
- `prop QuitGestures List[KeyGesture] { get; }` — Fallback quit gestures. Views receive each event before these are tested.
- `prop TickInterval TimeSpan { get; set; }` — The interval between tick events. TimeSpan.Zero disables ticks.

### Methods

- `func Post(work Action)` — Posts no-argument UI work for execution on the application loop. Repeated pending posts share one wakeup and one repaint.
  - `work`: The callback to run on the loop thread.
- `func RequestDraw()` — Wakes the app for one repaint. Repeated pending calls coalesce.
- `func Run(root Box)` — Runs a bare tree. Escape and Ctrl+C quit.
  - `root`: The root box of the tree to run.
- `func Run(view View)` — Runs an advanced custom View.
  - `view`: The view to run as the application.
- `func StartWorker(work Func[CancellationToken, T]) Worker[T]` — Starts one app-owned background operation.
  - `work`: The operation to run with a cooperative cancellation token.
  - Returns: A running handle for cancellation and terminal observation.

## SharpTui.Badge

A filled text pill, drawn with the ink flipped.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty badge.

### Properties

- `prop Text string { get; set; }` — The label centred within the badge.

## SharpTui.Bind

One project-wide key binding.

G# kind: `class`.

### Properties

- `prop Gesture KeyGesture { get; }` — The gesture that triggers this binding.
- `prop IsPending bool { get; }` — True when the gesture has matched and Consume has not yet reported it.
- `prop Phase BindingPhase { get; }` — Which routing phase this binding is offered during.

### Methods

- `func Consume() bool` — Reports and clears a pending activation.
  - Returns: True when a pending activation was consumed.

## SharpTui.BindingPhase

Controls whether a binding runs before or after the application view handles an event.

G# kind: `enum`.

### Values

- `BeforeWidgets` — Offers the binding before the application view handles the event.
- `AfterWidgets` — Offers the binding after the application view declines the event.

## SharpTui.Box

The base element. Everything drawable is a Box, so everything nests.

G# kind: `class`.

### Constructors

- `init()` — Creates an empty, visible box with column layout, no border, and default style; auto-sized and detached from any parent.

### Properties

- `prop Bounds CellRect { get; }` — The box's rectangle in screen cells after the last layout pass. Zero-valued when not visible.
- `prop Children List[Box] { get; set; }` — The direct children, in paint and layout order. Replacing the list detaches boxes that are no longer present and resynchronizes mouse capture.
- `prop ContentBounds CellRect { get; }` — The box's bounds after border, padding, scrollbar gutter, and title row are subtracted, in that order. What Render and children draw into.
- `prop FocusedElement Box { get; }` — The visible focusable descendant that currently holds focus, or nil if none.
- `prop FocusedStyle Style { get; set; }` — The style merged over Style while this exact box is focused. Focus held by a descendant does not activate an ancestor's FocusedStyle; use FocusedElement to observe descendant focus when pane chrome must reflect which nested control is active. Foreground and background marked IsInherited fall back to the unfocused resolved style.
- `prop GapCells int32 { get; set; }` — Cells of gap inserted between children along the layout axis. Must be non-negative; defaults to 0.
- `prop GrowWeight int32 { get; set; }` — Flex-grow weight used by the immediate in-flow parent to distribute leftover space among siblings. It does not make this box's ancestors grow: each auto-sized ancestor on a path that should receive spare width or height needs its own GrowWeight (or an explicit size). Must be non-negative; defaults to 0.
- `prop Height CellLength { get; set; }` — The box's height. CellLength.Auto sizes it from content; defaults to Auto.
- `prop IsFocused bool { get; }` — Whether this box currently holds keyboard focus.
- `prop IsVisible bool { get; set; }` — Whether this box and descendants participate in layout, drawing, input, and scrollbars.
- `prop Padding CellInsets { get; set; }` — Inner spacing between the border or edge and content on each side. Defaults to CellInsets.None.
- `prop Placement Placement { get; set; }` — Whether this box lays out in flow with siblings or is positioned absolutely. Defaults to Placement.InFlow.
- `prop ShowBorder bool { get; set; }` — Whether a one-cell border is drawn around the box, consuming one cell of padding on each side. Defaults to false.
- `prop ShowScrollbar bool { get; set; }` — Whether a vertical scrollbar is drawn against overflowing content. Reserves a column of padding on the right edge when ShowBorder is false. Defaults to false.
- `prop Style Style { get; set; }` — The style used for this box's own fill, border, and title when unfocused. Foreground and background marked IsInherited fall back to the parent's resolved style.
- `prop Title string { get; set; }` — Text drawn along the top edge, inside the border if ShowBorder is set or on its own row otherwise. Empty string draws nothing.
- `prop Width CellLength { get; set; }` — The box's width. CellLength.Auto sizes it from content; defaults to Auto.

### Methods

- `func Draw(screen Screen)` — Lays out and draws the whole tree.
  - `screen`: The screen to paint into.
- `func FocusNext() bool` — Moves focus to the next focusable box in tree order, wrapping around. Returns false if no box can take focus.
  - Returns: True when a focusable box was found.
- `func FocusPrevious() bool` — Moves focus to the previous focusable box in tree order, wrapping around. Returns false if no box can take focus.
  - Returns: True when a focusable box was found.
- `func Focus(target Box)` — Moves focus directly to the given box, clearing focus everywhere else in the tree.
  - `target`: The box to give focus to.
- `func Handle(ev UiEvent) EventResult` — Routes one event through the tree. Call this on the root.
  - `ev`: The event to route.
  - Returns: Handled when a box consumed the event, Exit to quit, otherwise Continue.

## SharpTui.Button

A push button: " Text " centred, flips ink when focused.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty, focusable button.

### Properties

- `prop IsPressed bool { get; }` — True when the button was activated since the last ConsumePress.
- `prop Text string { get; set; }` — The label centred within the button.

### Methods

- `func ConsumePress() bool` — Returns and clears whether the button was pressed since the last call.
  - Returns: True when the button had a pending press.

## SharpTui.CanvasMode

Selects the subcell packing used by a CanvasSurface.

G# kind: `enum`.

### Values

- `Braille` — Packs a two-by-four Braille grid into each terminal cell.
- `Quadrant` — Packs a two-by-two quadrant grid into each terminal cell.
- `HalfBlock` — Packs two vertical half blocks into each terminal cell.
- `Cell` — Uses one drawable point per terminal cell.

## SharpTui.CanvasSurface

A retained, packed drawing surface whose styles are stored per terminal cell.

G# kind: `class`.

### Constructors

- `init(width int32, height int32, mode CanvasMode)` — Creates a surface with the given terminal-cell dimensions and packing mode.
  - `width`: The number of terminal cells across the surface.
  - `height`: The number of terminal rows in the surface.
  - `mode`: The subcell packing mode.

### Properties

- `prop HeightRows int32 { get; }` — The number of terminal rows in the surface.
- `prop Mode CanvasMode { get; }` — The packing mode used by the surface.
- `prop SubcellHeight int32 { get; }` — The vertical subcell count.
- `prop SubcellWidth int32 { get; }` — The horizontal subcell count.
- `prop WidthCells int32 { get; }` — The number of terminal cells across the surface.

### Methods

- `func Circle(cx int32, cy int32, radius int32)` — Draws a clipped midpoint circle in subcell coordinates.
  - `cx`: The circle center's horizontal subcell coordinate.
  - `cy`: The circle center's vertical subcell coordinate.
  - `radius`: The circle radius in subcells.
- `func Circle(cx int32, cy int32, radius int32, style Style)` — Draws a clipped midpoint circle in subcell coordinates.
  - `cx`: The circle center's horizontal subcell coordinate.
  - `cy`: The circle center's vertical subcell coordinate.
  - `radius`: The circle radius in subcells.
  - `style`: The style stored for the affected terminal cells.
- `func Clear()` — Clears every packed subcell and resets its cell style to inherited.
- `func Clear(style Style)` — Clears every packed subcell and sets the retained cell style used by later points.
  - `style`: The style retained for cells written after the clear.
- `func FillCircle(cx int32, cy int32, radius int32)` — Draws a filled clipped circle in subcell coordinates.
  - `cx`: The circle center's horizontal subcell coordinate.
  - `cy`: The circle center's vertical subcell coordinate.
  - `radius`: The circle radius in subcells.
- `func FillCircle(cx int32, cy int32, radius int32, style Style)` — Draws a filled clipped circle in subcell coordinates.
  - `cx`: The circle center's horizontal subcell coordinate.
  - `cy`: The circle center's vertical subcell coordinate.
  - `radius`: The circle radius in subcells.
  - `style`: The style stored for the affected terminal cells.
- `func Fill(x int32, y int32, width int32, height int32)` — Fills a clipped rectangle in subcell coordinates.
  - `x`: The left subcell coordinate.
  - `y`: The top subcell coordinate.
  - `width`: The rectangle width in subcells.
  - `height`: The rectangle height in subcells.
- `func Fill(x int32, y int32, width int32, height int32, style Style)` — Fills a clipped rectangle in subcell coordinates.
  - `x`: The left subcell coordinate.
  - `y`: The top subcell coordinate.
  - `width`: The rectangle width in subcells.
  - `height`: The rectangle height in subcells.
  - `style`: The style stored for the affected terminal cells.
- `func Line(x0 int32, y0 int32, x1 int32, y1 int32)` — Draws a clipped Bresenham line in subcell coordinates.
  - `x0`: The starting horizontal subcell coordinate.
  - `y0`: The starting vertical subcell coordinate.
  - `x1`: The ending horizontal subcell coordinate.
  - `y1`: The ending vertical subcell coordinate.
- `func Line(x0 int32, y0 int32, x1 int32, y1 int32, style Style)` — Draws a clipped Bresenham line in subcell coordinates.
  - `x0`: The starting horizontal subcell coordinate.
  - `y0`: The starting vertical subcell coordinate.
  - `x1`: The ending horizontal subcell coordinate.
  - `y1`: The ending vertical subcell coordinate.
  - `style`: The style stored for the affected terminal cells.
- `func Point(x int32, y int32)` — Sets one subcell using inherited style.
  - `x`: The horizontal subcell coordinate.
  - `y`: The vertical subcell coordinate.
- `func Point(x int32, y int32, style Style)` — Sets one subcell and retains its terminal-cell style.
  - `x`: The horizontal subcell coordinate.
  - `y`: The vertical subcell coordinate.
  - `style`: The style stored for the affected terminal cell.
- `func Polyline(points List[CellPoint], style Style)` — Draws connected clipped line segments through the given subcell points.
  - `points`: The ordered vertices of the polyline.
  - `style`: The style stored for the affected terminal cells.
- `func Rect(x int32, y int32, width int32, height int32)` — Draws a clipped rectangle outline in subcell coordinates.
  - `x`: The left subcell coordinate.
  - `y`: The top subcell coordinate.
  - `width`: The rectangle width in subcells.
  - `height`: The rectangle height in subcells.
- `func Rect(x int32, y int32, width int32, height int32, style Style)` — Draws a clipped rectangle outline in subcell coordinates.
  - `x`: The left subcell coordinate.
  - `y`: The top subcell coordinate.
  - `width`: The rectangle width in subcells.
  - `height`: The rectangle height in subcells.
  - `style`: The style stored for the affected terminal cells.
- `func Resize(width int32, height int32)` — Changes the terminal-cell dimensions and clears the surface.
  - `width`: The new number of terminal cells across the surface.
  - `height`: The new number of terminal rows in the surface.

## SharpTui.CanvasView

Displays a retained CanvasSurface as ordinary terminal cells.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates a one-cell cell-mode canvas.
- `init(surface CanvasSurface)` — Creates a view for the given retained surface.
  - `surface`: The retained surface to display.
- `init(width int32, height int32, mode CanvasMode)` — Creates a view with an internally owned surface.
  - `width`: The number of terminal cells across the surface.
  - `height`: The number of terminal rows in the surface.
  - `mode`: The subcell packing mode.

### Properties

- `prop Surface CanvasSurface { get; set; }` — The retained surface painted by this view.

## SharpTui.CellInsets

Padding measured in terminal cells and rows.

G# kind: `struct`.

### Properties

- `prop BottomRows int32 { get; init; }` — The bottom padding in rows. Must be non-negative.
- `prop LeftCells int32 { get; init; }` — The left padding in cells. Must be non-negative.
- `shared prop None CellInsets { get; }` — Insets with no padding on any side.
- `prop RightCells int32 { get; init; }` — The right padding in cells. Must be non-negative.
- `prop TopRows int32 { get; init; }` — The top padding in rows. Must be non-negative.

### Methods

- `shared func All(cells int32) CellInsets` — Creates equal padding on all four sides.
  - `cells`: The padding to apply to each side. Must be non-negative.
  - Returns: Insets with the given padding on all four sides.

## SharpTui.CellLength

A requested size in terminal cells.

G# kind: `struct`.

### Properties

- `shared prop Auto CellLength { get; }` — A length that auto-sizes rather than using a fixed cell count.
- `prop CellCount int32 { get; }` — The requested cell count, meaningful only when IsAuto is false.
- `prop IsAuto bool { get; }` — Reports whether this length auto-sizes instead of using a fixed cell count.

### Methods

- `shared func Cells(count int32) CellLength` — Creates a fixed length of the given non-negative cell count.
  - `count`: The fixed cell count. Must be non-negative.
  - Returns: A cell length with the given fixed count.

## SharpTui.CellPoint

A terminal cell coordinate.

G# kind: `struct`.

### Properties

- `prop Column int32 { get; init; }` — The column coordinate. Must be non-negative.
- `prop Row int32 { get; init; }` — The row coordinate. Must be non-negative.

## SharpTui.CellRect

A rectangle in terminal cell coordinates.

G# kind: `struct`.

### Properties

- `prop Column int32 { get; init; }` — The column of the rectangle's top-left corner.
- `prop HeightRows int32 { get; init; }` — The height in rows. Must be non-negative.
- `prop Row int32 { get; init; }` — The row of the rectangle's top-left corner.
- `prop WidthCells int32 { get; init; }` — The width in cells. Must be non-negative.

### Methods

- `func Contains(column int32, row int32) bool` — Tests whether a column and row fall within this rectangle.
  - `column`: The zero-based column to test.
  - `row`: The zero-based row to test.
  - Returns: True when the column and row fall within this rectangle.
- `func Contains(point CellPoint) bool` — Tests whether a point falls within this rectangle.
  - `point`: The point to test.
  - Returns: True when the point falls within this rectangle.
- `func Inset(insets CellInsets) CellRect` — Returns this rectangle shrunk by the given padding, clamped to zero width or height rather than going negative.
  - `insets`: The padding to shrink by on each side.
  - Returns: A new rectangle inset by the given padding.

## SharpTui.CellSize

A terminal cell width and row height.

G# kind: `struct`.

### Properties

- `prop HeightRows int32 { get; init; }` — The height in rows. Must be non-negative.
- `prop WidthCells int32 { get; init; }` — The width in cells. Must be non-negative.

## SharpTui.CellText

Cell-aware text operations for terminal rendering and layout.

G# kind: `class`.

### Constructors

- `init()` — Creates a cell-text utility instance. All operations are shared, so callers normally use the type directly.

### Methods

- `shared func Clip(text string, widthCells int32) string` — Truncates text by display width without splitting a grapheme cluster.
  - `text`: The text to truncate.
  - `widthCells`: The maximum display width in terminal cells.
  - Returns: The longest prefix of text that fits within widthCells.
- `shared func Graphemes(text string) List[string]` — Splits text into user-perceived grapheme clusters.
  - `text`: The text to split.
  - Returns: The grapheme clusters in order.
- `shared func MeasureWidth(text string) int32` — Measures text in terminal display cells.
  - `text`: The text to measure.
  - Returns: The display width in terminal cells.
- `shared func Wrap(text string, widthCells int32) List[string]` — Splits text into lines that fit the requested terminal-cell width.
  - `text`: The text to wrap.
  - `widthCells`: The maximum line width in terminal cells.
  - Returns: The wrapped lines in order.

## SharpTui.Color

Specifies an RGB color or a named style-resolution state.

G# kind: `struct`.

### Properties

- `shared prop Inherit Color { get; }` — Uses the parent style's corresponding color.
- `prop IsInherited bool { get; }` — Reports whether this color inherits from its parent style.
- `prop IsTerminalDefault bool { get; }` — Reports whether this color uses the terminal-configured default.
- `shared prop TerminalDefault Color { get; }` — Uses the terminal-configured default foreground or background.

### Methods

- `func Equals(other Color) bool` — Tests whether another color has the same RGB or style-resolution value.
  - `other`: The color to compare against.
  - Returns: True when both colors have the same packed value.
- `shared func Rgb(hex string) Color` — Creates an RGB color from exactly six hexadecimal digits.
  - `hex`: Six hexadecimal digits, no leading # or prefix.
  - Returns: The RGB color packed from the parsed digits.
- `shared func Rgb(red int32, green int32, blue int32) Color` — Creates an RGB color from three channel values.
  - `red`: The red channel, from 0 to 255.
  - `green`: The green channel, from 0 to 255.
  - `blue`: The blue channel, from 0 to 255.
  - Returns: The RGB color packed from the three channels.
- `func (left Color) operator ==(right Color) bool` — Tests two colors for equality.
  - `left`: The first color to compare.
  - `right`: The second color to compare.
  - Returns: True when both colors have the same packed value.
- `func (left Color) operator !=(right Color) bool` — Tests two colors for inequality.
  - `left`: The first color to compare.
  - `right`: The second color to compare.
  - Returns: True when the colors have different packed values.

## SharpTui.Column

A box that lays its children out top to bottom.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Sets the layout axis to top-to-bottom (Column).

## SharpTui.ColumnWidth

A table column's fixed cell width or its weighted share of remaining space.

G# kind: `struct`.

### Methods

- `shared func Cells(count int32) ColumnWidth` — A column width fixed at count cells.
  - `count`: The fixed number of cells.
  - Returns: A column width using that fixed cell count.
- `func Equals(other ColumnWidth) bool` — Tests whether another width uses the same policy and amount.
  - `other`: The width to compare against.
  - Returns: True when other has the same policy and amount as this width.
- `shared func Share(weight int32) ColumnWidth` — A column width that takes weight parts of the space remaining after fixed-width columns and gutters.
  - `weight`: The share weight relative to other weighted columns.
  - Returns: A column width using that share weight.
- `func (left ColumnWidth) operator ==(right ColumnWidth) bool` — Tests two column widths for equality.
  - `left`: The first column width.
  - `right`: The second column width.
  - Returns: True when left and right have the same policy and amount.
- `func (left ColumnWidth) operator !=(right ColumnWidth) bool` — Tests two column widths for inequality.
  - `left`: The first column width.
  - `right`: The second column width.
  - Returns: True when left and right differ in policy or amount.

## SharpTui.Command

A shared, consumable activation model for commands exposed by UI surfaces.

G# kind: `class`.

### Constructors

- `init(id string, label string, gesture KeyGesture)` — Creates an enabled command with a gesture.
  - `id`: The stable command identity.
  - `label`: The text shown by a command surface.
  - `gesture`: The key gesture that activates the command.

### Properties

- `prop Gesture KeyGesture { get; }` — The key gesture that can activate this command through a Keymap.
- `prop Id string { get; }` — Stable command identity.
- `prop IsEnabled bool { get; set; }` — Whether this command accepts activation.
- `prop IsPending bool { get; }` — True when an activation is waiting to be consumed.
- `prop Label string { get; }` — Text shown by a command surface.

### Methods

- `func Activate() bool` — Activates the command when it is enabled.
  - Returns: True when the command accepted the activation.
- `func Consume() bool` — Reports and clears one pending activation.
  - Returns: True when an activation was consumed.

## SharpTui.ControlState

Contains visual state flags applied while resolving a theme role.

G# kind: `enum`.

### Values

- `None` — Applies no visual state overlay.
- `Focused` — Applies the focused state.
- `Selected` — Applies the selected state.
- `Disabled` — Applies the disabled state.

## SharpTui.Dialog

A centered, dimmed modal overlay showing a message and a row of action buttons.

G# kind: `class`.
Inherits `Overlay`; see that type for inherited members.

### Constructors

- `init()` — Creates a centered, dimmed, bordered dialog with no message or actions.

### Properties

- `prop Actions List[DialogAction] { get; set; }` — The actions offered as buttons, in display order. Setting it rebuilds the dialog's children.
- `prop Message string { get; set; }` — The wrapped body text. Setting it rebuilds the dialog's children.
- `prop Result DialogAction { get; }` — The action whose button was most recently pressed, or nil. Reading it does not clear the pending press; use ConsumeResult for that.

### Methods

- `func ConsumeResult() DialogAction` — Returns and clears the most recently pressed action, or nil when no button has been pressed.
  - Returns: The most recently pressed action, or nil when none is pending.

## SharpTui.DialogAction

One choice offered by a Dialog, rendered as a button.

G# kind: `class`.

### Constructors

- `init()` — Creates a non-cancel action with an empty label.

### Properties

- `prop IsCancel bool { get; set; }` — When true, this action is the one activated by Escape.
- `prop Text string { get; set; }` — The label shown on the action's button.

## SharpTui.Easing

Selects the interpolation curve used by a tween.

G# kind: `enum`.

### Values

- `Linear` — Leaves progress unchanged.
- `SineIn` — Starts with sinusoidal acceleration.
- `SineOut` — Ends with sinusoidal deceleration.
- `SineInOut` — Uses sinusoidal acceleration and deceleration.
- `CubicIn` — Starts with cubic acceleration.
- `CubicOut` — Ends with cubic deceleration.
- `CubicInOut` — Uses cubic acceleration and deceleration.
- `BackIn` — Overshoots before accelerating from the start.
- `BackOut` — Overshoots after decelerating into the end.
- `BackInOut` — Overshoots at both ends.
- `BounceIn` — Bounces into the start.
- `BounceOut` — Bounces into the end.
- `BounceInOut` — Bounces at both ends.
- `ElasticIn` — Springs into the start.
- `ElasticOut` — Springs into the end.
- `ElasticInOut` — Springs at both ends.

## SharpTui.EventResult

Controls how an event affects application routing and lifetime.

G# kind: `enum`.

### Values

- `Continue` — Leaves the event unconsumed so later routing stages may handle it.
- `Handled` — Marks the event consumed and stops later routing stages.
- `Exit` — Requests that the application event loop stop.

## SharpTui.HorizontalAlignment

Controls horizontal placement of content within its box.

G# kind: `enum`.

### Values

- `Left` — Places content against the left edge.
- `Center` — Centers content between the left and right edges.
- `Right` — Places content against the right edge.

## SharpTui.Key

Identifies a logical key independently of the active keyboard layout.

G# kind: `enum`.

### Values

- `Unknown` — Indicates that no recognized logical key was decoded.
- `Character` — Represents printable text whose grapheme is carried by UiEvent.Text.
- `Enter` — Represents the Enter or Return key.
- `Tab` — Represents forward Tab.
- `BackTab` — Represents reverse Tab, commonly produced by Shift+Tab.
- `Backspace` — Represents the Backspace key.
- `Escape` — Represents the Escape key.
- `Up` — Represents the Up arrow key.
- `Down` — Represents the Down arrow key.
- `Left` — Represents the Left arrow key.
- `Right` — Represents the Right arrow key.
- `Home` — Represents the Home key.
- `End` — Represents the End key.
- `PageUp` — Represents the Page Up key.
- `PageDown` — Represents the Page Down key.
- `Delete` — Represents the Delete key.
- `Insert` — Represents the Insert key.
- `F1` — Represents function key F1.
- `F2` — Represents function key F2.
- `F3` — Represents function key F3.
- `F4` — Represents function key F4.
- `F5` — Represents function key F5.
- `F6` — Represents function key F6.
- `F7` — Represents function key F7.
- `F8` — Represents function key F8.
- `F9` — Represents function key F9.
- `F10` — Represents function key F10.
- `F11` — Represents function key F11.
- `F12` — Represents function key F12.

## SharpTui.KeyGesture

A key combination to match against incoming events, such as a shortcut. Compares Key and shortcut-relevant modifiers, and for character gestures, Text case-insensitively.

G# kind: `struct`.

### Properties

- `prop Key Key { get; init; }` — The key this gesture matches.
- `prop Modifiers KeyModifiers { get; init; }` — The modifiers this gesture requires; lock flags are ignored during matching.
- `prop Text string { get; init; }` — For a Character gesture, the single grapheme to match case-insensitively; unused otherwise.

### Methods

- `shared func Character(text string) KeyGesture` — Builds a gesture that matches a single printable grapheme with no modifiers.
  - `text`: The single grapheme to match.
  - Returns: The built gesture.
- `shared func Ctrl(text string) KeyGesture` — Builds a gesture that matches a single printable grapheme held with Ctrl.
  - `text`: The single grapheme to match.
  - Returns: The built gesture.
- `func Matches(ev UiEvent) bool` — Reports whether ev is a Key or TextInput Press with this gesture's key and matching shortcut modifiers (lock flags ignored), and for Character gestures, matching Text case-insensitively.
  - `ev`: The event to test.
  - Returns: True when the event matches this gesture.

## SharpTui.KeyModifiers

Contains combinable modifier and lock-state flags reported with input events.

G# kind: `enum`.

### Values

- `None` — Indicates that no modifiers or lock-state flags are set.
- `Shift` — Indicates that Shift is held.
- `Alt` — Indicates that Alt is held.
- `Ctrl` — Indicates that Control is held.
- `Super` — Indicates that the Super modifier is held.
- `Hyper` — Indicates that the Hyper modifier is held.
- `Meta` — Indicates that the Meta modifier is held.
- `CapsLock` — Indicates that Caps Lock is active; shortcut matching ignores this flag.
- `NumLock` — Indicates that Num Lock is active; shortcut matching ignores this flag.

## SharpTui.KeyPhase

Identifies the press, repeat, or release phase of a key event.

G# kind: `enum`.

### Values

- `Press` — Indicates the initial key-down event.
- `Repeat` — Indicates an automatic repeat while the key remains held.
- `Release` — Indicates key release when the terminal reports key-up events.

## SharpTui.KeyedSource`2

Supplies indexed values with source-owned stable-key lookup.

G# kind: `interface`.

### Methods

- `func Count() int32` — Returns the number of values currently available.
  - Returns: The value count.
- `func IndexOfKey(key TKey) int32` — Returns the index of a stable key, or negative one when absent.
  - `key`: The stable key to find.
  - Returns: The current zero-based index, or negative one.
- `func ItemAt(index int32) T` — Returns one value by zero-based index.
  - `index`: The zero-based value index.
  - Returns: The value at index.

## SharpTui.Keymap

Project-wide bindings layered around focused-widget event handling.

G# kind: `class`.

### Constructors

- `init()` — Creates an empty keymap.

### Properties

- `prop Bindings List[Bind] { get; }` — All bindings registered on this keymap, in registration order.

### Methods

- `func Add(gesture KeyGesture, phase BindingPhase) Bind` — Adds a typed binding and returns it for Consume.
  - `gesture`: The key combination that triggers the binding.
  - `phase`: The routing phase the binding is offered during.
  - Returns: The registered binding.
- `func Add(command Command, phase BindingPhase)` — Registers a command binding.
  - `command`: The command activated by the matching gesture.
  - `phase`: The routing phase the binding is offered during.
- `func Offer(ev UiEvent, phase BindingPhase) bool` — Offers an event to one routing phase.
  - `ev`: The event to offer.
  - `phase`: The routing phase to test bindings against.
  - Returns: True when a matching binding consumed the event.

## SharpTui.Label

A single line of text, clipped to its box.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty, left-aligned label.

### Properties

- `prop Alignment HorizontalAlignment { get; set; }` — How Text is positioned within the box when the box is wider than the text.
- `prop Text string { get; set; }` — The text to display. Setting it rebuilds the grapheme cluster cache when the value changes.

## SharpTui.ListItem

A single row in a ListView, carrying its text, optional styled runs, and selection eligibility.

G# kind: `class`.

### Constructors

- `init()` — Creates an item with a freshly generated Id, empty text, and selectable by default.

### Properties

- `prop Id string { get; set; }` — Caller-supplied Id values must be unique for selection restoration across Items replacement.
- `prop IsSelectable bool { get; set; }` — When false, this item is skipped by keyboard and mouse selection but still rendered.
- `prop Runs List[TextRun] { get; set; }` — Styled text segments drawn instead of Text; when non-empty, Runs takes precedence over Text.
- `prop Style Style { get; set; }` — Style applied to this item's row, merged over the list's inherited style.
- `prop Text string { get; set; }` — Plain text drawn for this item when Runs is empty.

## SharpTui.ListView

A scrolling, keyboard- and mouse-navigable list of ListItem rows with a single selection.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty list with a "> " selection marker and CanFocus enabled.

### Properties

- `prop FirstVisibleItemIndex int32 { get; set; }` — Index of the first item visible in the viewport.
- `prop FollowTail bool { get; set; }` — When true the list pins to its tail: every render selects the last selectable item and scrolls the viewport to the end, so appended items are always in view. Navigating or scrolling away from the tail (Up, PageUp, Home, wheel-up, or a click) turns it off; it never re-engages on its own.
- `prop Items List[ListItem] { get; set; }` — The rows shown by this list; setting it replaces all items and re-resolves the selection via Refresh.
- `prop SelectedId string { get; }` — Id of the currently selected item, or empty when nothing is selected.
- `prop SelectedIndex int32 { get; set; }` — Index of the selected item. Setting it selects programmatically and does not emit a SelectionChange.
- `prop SelectedItem ListItem { get; }` — The currently selected item, or nil when SelectedIndex is out of range or the active source is empty.
- `prop SelectedStyle Style { get; set; }` — Style merged over the selected row's own style and the inherited style.
- `prop SelectionMarker string { get; set; }` — Marker text drawn before the selected row; unselected rows reserve the same width with blanks.
- `prop Source KeyedSource[ListItem, string] { get; set; }` — An optional indexed item source. When set, the source supplies rows instead of Items.

### Methods

- `func Add(text string) ListItem` — Appends a new item with the given text and returns it.
  - `text`: The text for the new item.
  - Returns: The newly appended item.
- `func ConsumeSelectionChange() SelectionChange?` — Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  - Returns: The pending selection change, or nil when none is pending.
- `func Refresh()` — Re-resolves selection after direct mutation of the active Items or Source data, restoring the previous Id when possible.

## SharpTui.MarkdownTheme

The styles a markdown view uses when it parses source.

G# kind: `class`.

### Constructors

- `init()` — Creates a theme with every style defaulted to Style().

### Properties

- `prop Body Style { get; set; }` — Style applied to plain paragraph and list-item text.
- `prop Code Style { get; set; }` — Style applied to inline code spans and fenced code blocks; syntax highlighting layers token colors on top of it.
- `prop Heading Style { get; set; }` — Style applied to headings; parsing adds bold on top of it.
- `prop Link Style { get; set; }` — Style applied to link text and image alt text; parsing adds underline.
- `prop Marker Style { get; set; }` — Style associated with list bullets, numbers, and table markers.
- `prop Quote Style { get; set; }` — Style applied to blockquote text.

## SharpTui.MarkdownView

A scrolling markdown view that owns parsing and layout.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty, focusable markdown view with the default theme.

### Properties

- `prop FirstVisibleLine int32 { get; }` — The index of the topmost visible wrapped line. Negative values clamp to zero.
- `prop MaximumLineWidth CellLength { get; set; }` — The maximum width a wrapped line may occupy before centering; Auto uses the full available width.
- `prop Source string { get; set; }` — The raw markdown text. Setting it invalidates the parsed and laid-out cache.
- `prop Theme MarkdownTheme { get; set; }` — The styles applied to parsed markdown elements. Setting it invalidates the cache.

### Methods

- `func LineCount() int32` — Wrapped line count at the last painted width.
  - Returns: The wrapped line count.
- `func ScrollToLine(line int32)` — Scrolls so that the given wrapped line index becomes the topmost visible line.
  - `line`: The wrapped line index to scroll to.

## SharpTui.MouseButton

Identifies the physical mouse button associated with a mouse event.

G# kind: `enum`.

### Values

- `None` — Indicates that no mouse button applies or the button is unknown.
- `Left` — Identifies the left mouse button.
- `Middle` — Identifies the middle mouse button.
- `Right` — Identifies the right mouse button.

## SharpTui.MouseKind

Identifies the action carried by a mouse event.

G# kind: `enum`.

### Values

- `Press` — Indicates that a mouse button was pressed.
- `Release` — Indicates that a mouse button was released.
- `Move` — Indicates pointer movement, with or without a held button.
- `ScrollUp` — Indicates an upward mouse-wheel step.
- `ScrollDown` — Indicates a downward mouse-wheel step.
- `None` — Indicates that the event carries no mouse action.

## SharpTui.MouseTracking

Controls which terminal mouse events an application requests.

G# kind: `enum`.

### Values

- `Disabled` — Disables terminal mouse reporting.
- `Click` — Reports button presses and releases, but not pointer motion.
- `Drag` — Reports button events and pointer motion while a button is held.
- `AllMotion` — Reports button events and all pointer motion.

## SharpTui.NumericRange

An automatic or fixed numeric scale.

G# kind: `struct`.

### Properties

- `shared prop Auto NumericRange { get; }` — A range that is recomputed from the minimum and maximum of the plotted values on each render.
- `prop IsAuto bool { get; }` — True when the range is computed automatically from the plotted values rather than fixed.
- `prop Maximum float64 { get; }` — The fixed upper bound; meaningless when IsAuto is true.
- `prop Minimum float64 { get; }` — The fixed lower bound; meaningless when IsAuto is true.

### Methods

- `shared func Fixed(minimum float64, maximum float64) NumericRange` — Creates a fixed range. Throws when either bound is NaN or infinite, or when maximum does not exceed minimum.
  - `minimum`: The fixed lower bound.
  - `maximum`: The fixed upper bound.
  - Returns: A range using those fixed bounds.

## SharpTui.Overlay

A centered content host that paints above normal siblings and traps input.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates a centered overlay with background dimming off and no default or cancel action set.

### Properties

- `prop CancelAction Box { get; set; }` — The descendant offered Enter after Escape reaches the scope.
- `prop Content Box { get; set; }` — The overlay's single child. Setting replaces any existing content; getting returns nil when the overlay is empty.
- `prop DefaultAction Box { get; set; }` — The descendant offered Enter after focused content declines it.
- `prop DimBackground bool { get; set; }` — Whether Render dims everything outside the overlay's bounds while it is open. Defaults to false.

## SharpTui.Placement

Controls whether an element participates in flex layout or is positioned over it.

G# kind: `struct`.

### Properties

- `shared prop Centered Placement { get; }` — Positioned centered over the layout, outside the flex flow. Centering does not shrink a fixed-size element to its parent, so an element larger than the viewport can extend beyond the available rectangle.
- `shared prop InFlow Placement { get; }` — Participates in flex layout alongside its siblings.
- `prop IsCentered bool { get; }` — Reports whether this element is centered over the layout rather than flowed.
- `prop IsInFlow bool { get; }` — Reports whether this element participates in flex layout alongside its siblings.
- `prop Point CellPoint { get; }` — The fixed position to place at, meaningful only when placed by At.

### Methods

- `shared func At(point CellPoint) Placement` — Positions an element at a fixed point, outside the flex flow.
  - `point`: The fixed position to place at.
  - Returns: A placement fixed at the given point.

## SharpTui.ProgressBar

A single-row progress bar, optionally labelled.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty progress bar with default block glyphs and a maximum of 1.0.

### Properties

- `prop EmptyGlyph string { get; set; }` — The glyph drawn for unfilled cells.
- `prop FillStyle Style { get; set; }` — The style applied to filled cells.
- `prop FilledGlyph string { get; set; }` — The glyph drawn for filled cells.
- `prop Maximum float64 { get; set; }` — The value that corresponds to a fully filled bar.
- `prop OverlayText string { get; set; }` — Text centered over the bar, such as a percentage.
- `prop Value float64 { get; set; }` — The current fill amount, relative to Maximum.

## SharpTui.RadioGroup

Owns Toggle children and keeps at most one checked at a time, radio-button style.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty radio group with no selection.

### Properties

- `prop SelectedToggle Toggle { get; }` — The currently selected toggle, or nil when none is selected.

### Methods

- `func Add(toggle Toggle)` — Adds a toggle as a child and attaches it to this group. Throws if the toggle already belongs to another group.
  - `toggle`: The toggle to add.
- `func ClearSelection()` — Deselects every toggle in the group.
- `func Select(toggle Toggle)` — Selects toggle, deselecting every other toggle in the group. Throws if toggle does not belong to this group.
  - `toggle`: The toggle to select.

## SharpTui.RichLineSource

Supplies immutable physical lines to a RichTextBlock on demand.

G# kind: `interface`.

### Methods

- `func Count() int32` — Returns the number of available physical lines.
  - Returns: The physical line count.
- `func ItemAt(index int32) RichTextLine` — Returns one stable physical line. A block may request nearby lines for prefetching.
  - `index`: The zero-based physical line index.
  - Returns: The requested styled line.
- `func MaximumLineWidth() int32` — Returns the greatest display width of any physical line.
  - Returns: The maximum line width in terminal cells.

## SharpTui.RichTextBlock

Styled, wrapped text with an explicit line viewport.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty, focusable rich text block.

### Properties

- `prop FirstVisibleLine int32 { get; }` — The index of the topmost visible line. Negative values clamp to zero.
- `prop GutterStyle Style { get; set; }` — The style applied to the line-number gutter in unwrapped mode.
- `prop HorizontalCellOffset int32 { get; set; }` — The number of content cells skipped from the left edge in unwrapped mode. Negative values clamp to zero.
- `prop LineSource RichLineSource { get; set; }` — An optional immutable physical-line source. Setting it selects unwrapped mode and clears Runs.
- `prop Runs List[TextRun] { get; set; }` — The styled runs to display. Setting it invalidates the display cache. Mutating the returned list in place does not invalidate the cache. Reassign Runs or use AppendRuns, PrependRuns, RemoveHeadRuns, RemoveTailRuns, or ClearRuns.
- `prop ShowLineNumbers bool { get; set; }` — Whether unwrapped physical lines display a right-aligned line-number gutter.
- `prop Wrapping TextWrapping { get; set; }` — Whether rich text wraps at word boundaries or preserves physical lines.

### Methods

- `func AppendRuns(added List[TextRun])` — Appends runs to the current content.
  - `added`: The runs to append.
- `func ClearRuns()` — Removes all runs from the current content.
- `func LineCount() int32` — Returns the number of active wrapped or physical lines.
  - Returns: The number of active lines.
- `func PrependRuns(added List[TextRun])` — Inserts runs before the current content and keeps the same old line visible.
  - `added`: The runs to insert before the current content.
- `func RemoveHeadRuns(count int32)` — Removes runs from the start of a cached newline-delimited prepend.
  - `count`: The number of head runs to remove.
- `func RemoveTailRuns(count int32)` — Removes a number of runs from the end of the current content.
  - `count`: The number of tail runs to remove.
- `func ScrollToEnd()` — Keeps the viewport pinned to the final line across later updates.
- `func ScrollToLine(line int32)` — Scrolls so that the given line index becomes the topmost visible line.
  - `line`: The line index to scroll to.

## SharpTui.RichTextLine

One immutable physical line supplied to a RichTextBlock.

G# kind: `class`.

### Constructors

- `init(runs List[TextRun])` — Creates a physical line and caches its run widths.
  - `runs`: The styled runs, without newline characters.

### Properties

- `prop Runs IReadOnlyList[TextRun] { get; }` — The styled runs in this line.
- `prop WidthCells int32 { get; }` — The total display width of the line.

## SharpTui.Row

A box that lays its children out left to right.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Sets the layout axis to left-to-right (Row).

## SharpTui.Screen

A double-buffered terminal cell grid; draw calls stage into the back buffer and Flush emits only the cells that changed since the front buffer.

G# kind: `class`.

### Constructors

- `init(width int32, height int32)` — Creates a screen of the given size in cells, with the terminal-configured default style.
  - `width`: The screen width in terminal cells.
  - `height`: The screen height in terminal rows.

### Properties

- `prop DefaultStyle Style { get; set; }` — The style used by draw calls that do not receive an explicit style.
- `prop Size CellSize { get; }` — The screen dimensions measured in terminal cells and rows.

### Methods

- `func Clear()` — Fills the whole screen with blank cells in the default style.
- `func Clear(s Style)` — Fills the whole screen with blank cells in the given style.
  - `s`: The style whose background and attributes are applied to every cell.
- `func DrawBorder(r CellRect, s Style)` — Draws a border around a cell rectangle.
  - `r`: The cell rectangle to draw the border around.
  - `s`: The style to apply to the border.
- `func Fill(r CellRect, s Style)` — Fills a cell rectangle with a background color.
  - `r`: The cell rectangle to fill.
  - `s`: The style whose background color is applied.
- `func WriteCell(x int32, y int32, text string)` — Writes one grapheme cluster at a cell in the default style. Out-of-bounds coordinates are ignored.
  - `x`: The zero-based column of the cell.
  - `y`: The zero-based row of the cell.
  - `text`: The grapheme cluster to write.
- `func WriteCell(x int32, y int32, text string, s Style)` — Writes one grapheme cluster at a cell in the given style. Out-of-bounds coordinates are ignored.
  - `x`: The zero-based column of the cell.
  - `y`: The zero-based row of the cell.
  - `text`: The grapheme cluster to write.
  - `s`: The style to apply to the cell.
- `func WriteClipped(r CellRect, dx int32, dy int32, text string)` — Draws text inside a cell rectangle and clips it at the right edge.
  - `r`: The cell rectangle to draw within.
  - `dx`: The column offset from the rectangle's left edge.
  - `dy`: The row offset from the rectangle's top edge.
  - `text`: The text to draw.
- `func WriteClipped(r CellRect, dx int32, dy int32, text string, s Style)` — Draws text inside a cell rectangle in the given style and clips it at the right edge.
  - `r`: The cell rectangle to draw within.
  - `dx`: The column offset from the rectangle's left edge.
  - `dy`: The row offset from the rectangle's top edge.
  - `text`: The text to draw.
  - `s`: The style to apply to the text.
- `func Write(x int32, y int32, text string) int32` — Draws a string starting at x, advancing by display width.
  - `x`: The zero-based starting column.
  - `y`: The zero-based row.
  - `text`: The text to draw.
  - Returns: The column just past the last cell written.
- `func Write(x int32, y int32, text string, s Style) int32` — Returns the column just past the last cell written.
  - `x`: The zero-based starting column.
  - `y`: The zero-based row.
  - `text`: The text to draw.
  - `s`: The style to apply.
  - Returns: The column just past the last cell written.

## SharpTui.SearchDirection

Controls the direction in which TextArea.Find searches from the caret.

G# kind: `enum`.

### Values

- `Forward` — Searches forward through the document.
- `Backward` — Searches backward through the document.

## SharpTui.Select

A dropdown select. Opens a floating option list below itself. Add a Select late among its siblings so the open list paints over them.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates a closed select with no options and the placeholder "select".

### Properties

- `prop IsOpen bool { get; }` — Whether the floating option list is currently shown.
- `prop Options List[string] { get; set; }` — Selectable option strings; setting it replaces all options and re-resolves the selection via Refresh.
- `prop Placeholder string { get; set; }` — Text shown in the closed control when Options is empty.
- `prop SelectedIndex int32 { get; set; }` — Index of the selected option, clamped to the current Options range. Setting it selects programmatically and does not emit a SelectionChange.
- `prop SelectedStyle Style { get; set; }` — Style merged over the highlighted option's inherited style in the open list.

### Methods

- `func ConsumeSelectionChange() SelectionChange?` — Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  - Returns: The pending selection change, or nil when none is pending.
- `func Refresh()` — Re-resolves selection after direct Options mutation.

## SharpTui.SelectionChange

A snapshot of a selection transition, produced by user navigation and retrieved with ConsumeSelectionChange.

G# kind: `struct`.

### Constructors

- `init(previousIndex int32, selectedIndex int32)` — Creates a change record from the previous index to the newly selected index.
  - `previousIndex`: Index that was selected before this change.
  - `selectedIndex`: Index selected after this change.

### Properties

- `prop PreviousIndex int32 { get; init; }` — Index that was selected before this change.
- `prop SelectedIndex int32 { get; init; }` — Index selected after this change.

## SharpTui.Separator

A divider line with an explicit orientation.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates a horizontal separator using the default glyph.

### Properties

- `prop Glyph string { get; set; }` — The glyph repeated along the line; empty selects a default box-drawing character for the current Orientation.
- `prop Orientation SeparatorOrientation { get; set; }` — Whether the line is drawn horizontally or vertically.

## SharpTui.SeparatorOrientation

Controls whether a Separator draws across a row or down a column.

G# kind: `enum`.

### Values

- `Horizontal` — Draws the separator across a row.
- `Vertical` — Draws the separator down a column.

## SharpTui.Sparkline

A one-row series chart drawn with block glyphs.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty sparkline with an automatic value range.

### Properties

- `prop ValueRange NumericRange { get; set; }` — The scale used to map values to glyph levels.
- `prop Values List[float64] { get; set; }` — The series to plot, one glyph per value, oldest first.

## SharpTui.Spinner

An animated frame that advances only when the app calls Advance.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates a spinner with the default braille frame set and no text.

### Properties

- `prop FrameIndex int32 { get; }` — The index into Frames currently shown, derived from the number of Advance calls.
- `prop Frames List[string] { get; set; }` — The sequence of glyphs cycled through as the spinner advances.
- `prop Text string { get; set; }` — Text drawn after the frame glyph, separated by one space.

### Methods

- `func Advance()` — Advances to the next frame, wrapping back to the first frame once the internal step counter would overflow.

## SharpTui.Splitter

A one-cell divider that resizes a preceding target box by mouse drag.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init(target Box, axis SplitterAxis)` — Creates a one-cell splitter that resizes target along axis. Throws if target is nil or axis is not a valid SplitterAxis.
  - `target`: The box this splitter resizes.
  - `axis`: The dimension this splitter resizes.

### Properties

- `prop MaximumCells int32 { get; set; }` — The largest size, in cells, the target may be resized to. Throws if set below MinimumCells.
- `prop MinimumCells int32 { get; set; }` — The smallest size, in cells, the target may be resized to. Throws if set negative or above MaximumCells.

### Methods

- `func ResizeBy(delta int32) bool` — Resizes the target by a relative number of terminal cells.
  - `delta`: The number of cells to grow (positive) or shrink (negative) the target by.
  - Returns: True when the target's size changed.

## SharpTui.SplitterAxis

Identifies the target dimension resized by a Splitter.

G# kind: `enum`.

### Values

- `Columns` — Resizes the target width in columns through horizontal dragging.
- `Rows` — Resizes the target height in rows through vertical dragging.

## SharpTui.StatusBar

A one row bar with a left, centred, and right segment.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates a bar with empty left, center, and right text.

### Properties

- `prop CenterText string { get; set; }` — Text drawn centered in the bar when there is room for it and the flanking text.
- `prop LeftText string { get; set; }` — Text drawn at the left edge of the bar.
- `prop RightText string { get; set; }` — Text drawn at the right edge of the bar when there is room.

## SharpTui.Style

A foreground color, background color, and text attributes.

G# kind: `struct`.

### Constructors

- `init()` — Creates a style that inherits its foreground, background, and attributes from its parent.

### Properties

- `prop Attributes TextAttributes { get; init; }` — The bold, dim, italic, underline, reverse, and strikethrough bits applied to the text.
- `prop Background Color { get; init; }` — The fill color behind the text.
- `prop Foreground Color { get; init; }` — The text color.

### Methods

- `func Inverted() Style` — Returns this style with foreground and background swapped.
  - Returns: A new style with foreground and background exchanged.
- `func WithAttributes(bits TextAttributes) Style` — Returns this style with additional text attributes.
  - `bits`: The attribute bits to add, combined with the existing attributes.
  - Returns: A new style with the combined attributes.
- `func WithBackground(color Color) Style` — Returns this style with a different background color.
  - `color`: The new background color.
  - Returns: A new style with the given background color.
- `func WithForeground(color Color) Style` — Returns this style with a different foreground color.
  - `color`: The new foreground color.
  - Returns: A new style with the given foreground color.

## SharpTui.SyntaxHighlighter

Provides syntax highlighting for source lines.

G# kind: `class`.

### Constructors

- `init()` — Creates a syntax highlighter.

### Methods

- `shared func CreateLineSource(lines List[string], language string, baseStyle Style) RichLineSource` — Creates an immutable line source that highlights lines only when requested. Unsupported languages are returned in the base style.
  - `lines`: The source lines to expose.
  - `language`: The language name or fence info string.
  - `baseStyle`: The base style used for unstyled text.
  - Returns: A lazy physical-line source.
- `shared func HighlightLines(lines List[string], language string, baseStyle Style) List[TextRun]` — Highlights source lines and returns styled text runs with line breaks.
  - `lines`: The source lines to highlight.
  - `language`: The language name or fence info string.
  - `baseStyle`: The base style used for unstyled text.
  - Returns: Styled text runs with one newline run between source lines.
- `shared func Supports(language string) bool` — Returns true when the language has an explicit syntax highlighter.
  - `language`: The language name or fence info string.
  - Returns: True when the language has an explicit highlighter.

## SharpTui.TableCell

One table cell containing either plain text or styled text runs.

G# kind: `struct`.

### Constructors

- `init()` — Creates an empty plain-text cell inheriting its row's style.
- `init(text string)` — Creates a plain-text cell inheriting its row's style.
  - `text`: The text displayed in the cell.

### Properties

- `prop Runs List[TextRun] { get; init; }` — Styled text segments drawn instead of Text when the list is non-empty.
- `prop Style Style { get; init; }` — Style merged over the row style before this cell is drawn.
- `prop Text string { get; init; }` — Plain text drawn when Runs is nil or empty.

## SharpTui.TableColumn

A named table column, its width policy, and its text alignment.

G# kind: `class`.

### Constructors

- `init()` — Creates a column with an empty header, an equal share width, and left alignment.

### Properties

- `prop Alignment HorizontalAlignment { get; set; }` — Horizontal alignment of text within this column's cells.
- `prop ColumnWidth ColumnWidth { get; set; }` — Width policy for this column, either a fixed cell count or a weighted share.
- `prop Header string { get; set; }` — Text drawn in the header row for this column.
- `prop HeaderAlignment HorizontalAlignment { get; set; }` — Horizontal alignment of the header text, independent of body cells.

## SharpTui.TableRow

One table row with stable identity, cells, style, and selection eligibility.

G# kind: `class`.

### Constructors

- `init()` — Creates a selectable row with a generated Id and no cells.

### Properties

- `prop Cells List[TableCell] { get; set; }` — Cells displayed in column order.
- `prop Id string { get; set; }` — Caller-supplied Id values must be unique for selection restoration across Rows replacement.
- `prop IsSelectable bool { get; set; }` — When false, the row is skipped by keyboard and mouse selection but remains visible.
- `prop Style Style { get; set; }` — Style merged over the table's inherited style before cells are drawn.

## SharpTui.TableView

A scrolling table with a header row and selectable data rows.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty table with a one-cell column gap and CanFocus enabled.

### Properties

- `prop ColumnGapCells int32 { get; set; }` — Cells inserted between displayed columns.
- `prop ColumnSeparator string { get; set; }` — Text drawn at the start of each inter-column gap; empty leaves the gap blank.
- `prop ColumnSeparatorStyle Style { get; set; }` — Style merged over the current header or row style for column separators.
- `prop Columns List[TableColumn] { get; set; }` — Column definitions in display order.
- `prop FirstVisibleColumnIndex int32 { get; set; }` — Index of the first visible column in the horizontal viewport.
- `prop FirstVisibleRowIndex int32 { get; set; }` — Index of the first data row visible in the viewport.
- `prop HeaderStyle Style { get; set; }` — Style applied to the header row.
- `prop Rows List[TableRow] { get; set; }` — Data rows shown by this table; setting it replaces all rows and re-resolves the selection via Refresh.
- `prop SelectedRowId string { get; }` — Id of the selected row, or empty when no row is selected.
- `prop SelectedRowIndex int32 { get; set; }` — Index of the selected row. Setting it selects programmatically and does not emit a SelectionChange.
- `prop SelectedRowStyle Style { get; set; }` — Style merged over the selected row's inherited style.
- `prop Source KeyedSource[TableRow, string] { get; set; }` — An optional indexed row source. When set, the source supplies rows instead of Rows.

### Methods

- `func ConsumeSelectionChange() SelectionChange?` — Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedRowIndex does not produce one.
  - Returns: The pending SelectionChange, or nil when none is pending.
- `func Refresh()` — Re-resolves selection after direct mutation of the active Rows or Source data, restoring the previous Id when possible.

## SharpTui.Tabs

A horizontal strip of titles; arrow keys or a click switch the active one.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty tab strip with a two-cell title gap and CanFocus enabled.

### Properties

- `prop SelectedIndex int32 { get; set; }` — Index of the active tab. Setting it selects programmatically and does not emit a SelectionChange; the value must not be negative.
- `prop SelectedStyle Style { get; set; }` — Style merged over the active tab's inherited style.
- `prop Titles List[string] { get; set; }` — Tab titles in display order; setting it replaces all titles and re-resolves the selection via Refresh.

### Methods

- `func ConsumeSelectionChange() SelectionChange?` — Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  - Returns: The pending SelectionChange, or nil when none is pending.
- `func Refresh()` — Re-resolves selection after direct Titles mutation.

## SharpTui.TestDriver

Drives a SharpTUI view without entering a terminal or reading a clock.

G# kind: `class`.

### Constructors

- `init(root Box, width int32, height int32)` — Creates a driver for a retained Box tree.
  - `root`: The root box to route and draw.
  - `width`: The screen width in cells.
  - `height`: The screen height in rows.
- `init(view View, width int32, height int32)` — Creates a driver for a custom View.
  - `view`: The view to route and draw.
  - `width`: The screen width in cells.
  - `height`: The screen height in rows.

### Properties

- `prop App App { get; }` — The application used for routing, posted work, and animations.
- `prop FocusedElement Box { get; }` — The focused descendant when the driven view is a Box tree.
- `prop NowMilliseconds int64 { get; }` — The current caller-controlled absolute time in milliseconds.
- `prop Screen Screen { get; }` — The test screen used for drawing and frame capture.

### Methods

- `func Advance(elapsed TimeSpan)` — Advances absolute time and pumps posted work and animations.
  - `elapsed`: The non-negative amount of time to advance.
- `func Draw() string` — Draws the view and returns the ANSI diff emitted by the screen.
  - Returns: The captured ANSI diff for this frame.
- `func Pump()` — Runs all currently posted work and samples animations at NowMilliseconds.
- `func Resize(width int32, height int32)` — Resizes the deterministic screen in terminal cells.
  - `width`: The new screen width in cells.
  - `height`: The new screen height in rows.
- `func Send(ev UiEvent) EventResult` — Routes one event through the normal application pipeline.
  - `ev`: The event to route.
  - Returns: The routing result.

## SharpTui.TextArea

A multi-line plain text editor, cluster indexed like Entry.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty, focusable, unwrapped text area with a single blank line.

### Properties

- `prop Caret TextPosition { get; set; }` — The caret position as a line and grapheme index. Setting it moves the caret and scrolls it into view.
- `prop FirstVisibleRowIndex int32 { get; set; }` — The index of the topmost visible visual row. Negative values clamp to zero.
- `prop GutterStyle Style { get; set; }` — The style applied to the line-number gutter.
- `prop HasSelection bool { get; }` — True when a selection is currently marked.
- `prop HorizontalCellOffset int32 { get; set; }` — The horizontal scroll offset in cells, used when Wrapping is None. Negative values clamp to zero.
- `prop IsModified bool { get; }` — True once the text has changed since it was last loaded via the Text setter.
- `prop SelectedText string { get; }` — The text within the current selection, or an empty string when nothing is marked.
- `prop SelectedTextStyle Style { get; set; }` — The style applied to the highlighted selection background.
- `prop Selection TextSelection? { get; }` — The current selection range, or nil when nothing is marked.
- `prop Text string { get; set; }` — The full text content, joined with '\n'. Setting it replaces all lines, resets the caret, and clears undo history.
- `prop Wrapping TextWrapping { get; set; }` — The line wrapping mode; None preserves lines and pans horizontally, Word wraps at the content width.

### Methods

- `func Find(needle string, direction SearchDirection) bool` — Searches for needle from the caret in the given direction, wrapping around the document, and selects the first match found. Returns false when needle is empty or not found.
  - `needle`: The text to search for.
  - `direction`: The direction to search in.
  - Returns: True when a match was found and selected.
- `func Redo() bool` — Redoes one undone edit.
  - Returns: True when an edit was redone.
- `func ReplaceSelection(text string) bool` — Replaces the current selection with text as one undo step. Returns false when nothing is selected.
  - `text`: The replacement text.
  - Returns: True when the selection was replaced.
- `func Undo() bool` — Undoes one edit. False when there is nothing left to undo.
  - Returns: True when an edit was undone.

## SharpTui.TextAttributes

Contains combinable terminal text-appearance flags used by Style.

G# kind: `enum`.

### Values

- `None` — Applies no additional text attributes.
- `Bold` — Requests bold or increased-intensity text.
- `Dim` — Requests faint or decreased-intensity text.
- `Italic` — Requests italic text.
- `Underline` — Requests underlined text.
- `Reverse` — Requests reversed foreground and background presentation.
- `Strikethrough` — Requests struck-through text.

## SharpTui.TextBlock

A block of wrapped text with an explicit line viewport.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty, focusable text block with word wrapping enabled.

### Properties

- `prop FirstVisibleLine int32 { get; }` — The index of the topmost visible wrapped line. Negative values clamp to zero.
- `prop Text string { get; set; }` — The text content rendered by this block. Setting it invalidates the wrap cache.
- `prop Wrapping TextWrapping { get; set; }` — The wrapping mode applied to Text. Setting it invalidates the wrap cache.

### Methods

- `func ScrollToLine(line int32)` — Scrolls so that the given wrapped line index becomes the topmost visible line.
  - `line`: The wrapped line index to scroll to.

## SharpTui.TextInput

A single-line text input, indexed by grapheme cluster throughout.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty, focusable single-line text input.

### Properties

- `prop CaretGraphemeIndex int32 { get; set; }` — The caret position as a grapheme-cluster index. Setting it clamps to the text bounds.
- `prop IsPassword bool { get; set; }` — When true, characters render as bullets instead of the underlying text.
- `prop Placeholder string { get; set; }` — Text shown in place of an empty, unfocused field.
- `prop PlaceholderStyle Style { get; set; }` — The style applied to Placeholder text.
- `prop Text string { get; set; }` — The current text content. Setting it rebuilds the grapheme index and clamps the caret.

### Methods

- `func MoveCaretToEnd() bool` — Moves the caret to the end of the text. Returns false when it was already there.
  - Returns: True when the caret moved.
- `func MoveCaretToStart() bool` — Moves the caret to the beginning of the text. Returns false when it was already there.
  - Returns: True when the caret moved.

## SharpTui.TextPosition

An immutable line and grapheme-cluster index within a TextArea. Both indices must be non-negative.

G# kind: `struct`.

### Properties

- `prop GraphemeIndex int32 { get; init; }` — The zero-based grapheme-cluster index within the line.
- `prop LineIndex int32 { get; init; }` — The zero-based line index.

## SharpTui.TextRun

A run of text with one style. Rich text is a list of these.

G# kind: `struct`.

### Constructors

- `init(text string, style Style)` — Creates a text run with the given text and style.
  - `text`: The run's text content.
  - `style`: The style applied to the run's text.

### Properties

- `prop Style Style { get; init; }` — The style applied to this run's text.
- `prop Text string { get; init; }` — The run's text content.

## SharpTui.TextSelection

A start/end range of TextPosition values marking a selection in a TextArea.

G# kind: `struct`.

### Properties

- `prop End TextPosition { get; init; }` — The position where the selection ends.
- `prop Start TextPosition { get; init; }` — The position where the selection begins.

## SharpTui.TextWrapping

Controls whether text remains unbroken or wraps at word boundaries.

G# kind: `enum`.

### Values

- `None` — Preserves explicit lines without automatic wrapping.
- `Word` — Wraps content at word boundaries within the available width.

## SharpTui.Theme

Compact semantic styles for application surfaces.

G# kind: `class`.

### Constructors

- `init()` — Creates a theme whose roles and overlays inherit their surrounding style.

### Properties

- `prop Accent Style { get; set; }` — The base accent style.
- `prop Body Style { get; set; }` — The base body style.
- `prop Disabled Style { get; set; }` — The style overlay for disabled controls.
- `prop Error Style { get; set; }` — The base error style.
- `prop Focused Style { get; set; }` — The style overlay for focused controls.
- `prop Muted Style { get; set; }` — The base muted style.
- `prop Selected Style { get; set; }` — The style overlay for selected controls.
- `prop Success Style { get; set; }` — The base success style.
- `prop Warning Style { get; set; }` — The base warning style.

### Methods

- `func Resolve(role ThemeRole, state ControlState) Style` — Resolves a role and applies focused, selected, then disabled overlays.
  - `role`: The semantic base role to resolve.
  - `state`: The control states to apply.
  - Returns: The merged style for the role and states.

## SharpTui.ThemeRole

Identifies a semantic style role shared by controls and application surfaces.

G# kind: `enum`.

### Values

- `Body` — Uses the normal content style.
- `Accent` — Uses the emphasized application style.
- `Muted` — Uses the secondary content style.
- `Success` — Uses the successful outcome style.
- `Warning` — Uses the cautionary outcome style.
- `Error` — Uses the failed outcome style.

## SharpTui.Toggle

A checkbox that flips its checked state on Enter, space, or a click. A Toggle added to a RadioGroup behaves as a radio button: selecting it deselects the group's other toggles, and activating the already-checked one leaves it checked.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an unchecked, focusable toggle with default bracket glyphs.

### Properties

- `prop CheckedGlyph string { get; set; }` — The glyph drawn when IsChecked is true.
- `prop IsChecked bool { get; set; }` — The checked state, flipped by activation.
- `prop Text string { get; set; }` — The label drawn after the checkbox glyph.
- `prop UncheckedGlyph string { get; set; }` — The glyph drawn when IsChecked is false.

## SharpTui.TreeNode

A single node in a tree, with its own text, expansion state, and children.

G# kind: `class`.

### Constructors

- `init()` — Creates a collapsed node with a generated Id, no children, and empty text and value.

### Properties

- `prop Children List[TreeNode] { get; set; }` — This node's child nodes. Setting it advances the shared structure revision, forcing every TreeView to rebuild its visible rows.
- `prop Id string { get; set; }` — Caller-supplied Id values must be unique and stable for selection restoration.
- `prop IsExpanded bool { get; set; }` — Whether this node's children are shown. Changing it advances the shared structure revision, forcing every TreeView to rebuild its visible rows.
- `prop IsLeaf bool { get; }` — True when this node has no children.
- `prop Text string { get; set; }` — Text drawn for this node.
- `prop Value string { get; set; }` — Application-defined string value, such as a filesystem path.

## SharpTui.TreeRow

Describes one visible row supplied to a TreeView.

G# kind: `struct`.

### Properties

- `prop ChildCount int32 { get; set; }` — The number of direct children available for expansion.
- `prop Depth int32 { get; set; }` — The row's zero-based nesting depth.
- `prop Node TreeNode { get; set; }` — The node displayed by this row.
- `prop ParentIndex int32 { get; set; }` — The visible index of the parent row, or negative one for a root.

## SharpTui.TreeSource

Supplies flattened visible tree rows with stable-node lookup.

G# kind: `interface`.

### Methods

- `func Count() int32` — Returns the number of currently visible rows.
  - Returns: The visible row count.
- `func IndexOfKey(key string) int32` — Returns the visible index of a stable node Id, or negative one when absent.
  - `key`: The stable TreeNode Id to find.
  - Returns: The current zero-based index, or negative one.
- `func ItemAt(index int32) TreeRow` — Returns one visible row by zero-based index.
  - `index`: The zero-based visible row index.
  - Returns: The row at index.
- `func Toggle(index int32)` — Toggles one expandable row and updates the flattened index.
  - `index`: The zero-based visible row index.

## SharpTui.TreeView

A collapsible tree view, flattened to the expanded rows for each render.

G# kind: `class`.
Inherits `Box`; see that type for inherited members.

### Constructors

- `init()` — Creates an empty tree with CanFocus enabled.

### Properties

- `prop FirstVisibleNodeIndex int32 { get; set; }` — Index of the first visible tree node.
- `prop NodeMarkerStyle Style { get; set; }` — Style applied to the expand/collapse marker on unselected rows.
- `prop Roots List[TreeNode] { get; set; }` — Top-level nodes of the tree; setting it replaces the roots and calls Refresh.
- `prop SelectedIndex int32 { get; set; }` — Index of the selected row among the currently visible (expanded) nodes. Setting it selects programmatically and does not emit a SelectionChange.
- `prop SelectedNode TreeNode { get; }` — The currently selected node among visible rows, or nil when there are none.
- `prop SelectedNodeStyle Style { get; set; }` — Style merged over the selected row's inherited style.
- `prop Source TreeSource { get; set; }` — An optional indexed visible-row source. When set, the source supplies rows instead of Roots.

### Methods

- `func ConsumeSelectionChange() SelectionChange?` — Returns and clears the pending SelectionChange from user navigation; programmatic selection via SelectedIndex does not produce one.
  - Returns: The pending selection change, or nil when none is pending.
- `func Refresh()` — Rebuilds visible rows after direct mutation of the active Roots or Source data.

## SharpTui.UiEvent

A single decoded input event: a keystroke, pasted text, a mouse action, or a timer tick. Fields that do not apply to Kind are left at their default.

G# kind: `struct`.

### Properties

- `prop BaseLayoutKeyCode int32 { get; init; }` — The codepoint this key would produce under the standard PC-101 layout, from Kitty's alternate-key reporting; zero when not reported.
- `prop Button MouseButton { get; init; }` — The mouse button involved in a Mouse event; None when not applicable.
- `prop Key Key { get; init; }` — The logical key for a Key event; Character for text input, Unknown when not applicable.
- `prop KeyCode int32 { get; init; }` — The Kitty keyboard protocol codepoint for the key, including private-use codes for named keys without a Unicode codepoint.
- `prop Kind UiEventKind { get; init; }` — Which variant of input this event represents.
- `prop Modifiers KeyModifiers { get; init; }` — Modifier keys held when this event occurred.
- `prop Mouse MouseKind { get; init; }` — The mouse action for a Mouse event; None for other kinds.
- `prop Phase KeyPhase { get; init; }` — Press, repeat, or release stage of a Key event; always Press for other kinds.
- `prop Position CellPoint { get; init; }` — The terminal cell a Mouse event occurred at.
- `prop ShiftedKeyCode int32 { get; init; }` — The codepoint this key would produce with Shift applied, from Kitty's alternate-key reporting; zero when not reported.
- `prop Text string { get; init; }` — The grapheme or pasted text carried by this event; empty when none applies.

## SharpTui.UiEventKind

Identifies which input variant a UiEvent carries.

G# kind: `enum`.

### Values

- `Key` — Carries a named key event, usually with modifiers and a key phase.
- `TextInput` — Carries printable text intended for text entry.
- `Paste` — Carries a bracketed-paste text payload.
- `Mouse` — Carries a mouse action, button, and terminal-cell position.
- `Tick` — Signals an application timer tick.
- `Unknown` — Indicates that no recognized event variant is present.

## SharpTui.View

Defines a drawable application surface with typed event handling.

G# kind: `interface`.

### Methods

- `func Draw(screen Screen)` — Paints one frame after a batch of events.
  - `screen`: The screen to paint into.
- `func Handle(ev UiEvent) EventResult` — Handles one typed user-interface event.
  - `ev`: The event to handle.
  - Returns: Handled when the view consumed the event, Exit to stop the app, otherwise Continue.

## SharpTui.WorkerState

Reports the lifecycle state of one background worker.

G# kind: `enum`.

### Values

- `Running` — The operation is running on a background thread.
- `Completed` — The operation completed and has a result to consume.
- `Failed` — The operation failed and has an exception to consume.
- `Cancelled` — The operation exited after cancellation was requested.

## SharpTui.Worker`1

Runs one typed background operation and marshals its terminal state onto an App.

G# kind: `class`.

### Properties

- `prop State WorkerState { get; }` — Reports the current worker lifecycle state.

### Methods

- `func Cancel()` — Requests cooperative cancellation. State remains Running until the operation exits.
- `func ConsumeError() Exception` — Consumes the failure exception once.
  - Returns: The exception, or nil when no unconsumed failure exists.
- `func ConsumeResult(out value T) bool` — Consumes the completed result once.
  - `value`: Receives the result when available.
  - Returns: True when a result was consumed.
