package SharpTui

import System
import System.Collections.Generic

/// A key label and command description in a KeyHintBar.
public class KeyHint {
  private var keyText string
  private var text string
  internal var KeyWidth int32
  internal var TextWidth int32

  /// Key text shown before the description.
  public prop KeyText string {
    get -> keyText
    set {
      if keyText == value { return }
      keyText = value
      KeyWidth = Glyph.WidthOf(value)
    }
  }
  /// Description shown after the key text.
  public prop Text string {
    get -> text
    set {
      if text == value { return }
      text = value
      TextWidth = Glyph.WidthOf(value)
    }
  }
  /// Higher values are included first when space is limited. Ties keep item order.
  public prop Priority int32 { get; set; }
  /// Whether the command can run. Disabled hints remain visible.
  public prop IsEnabled bool { get; set; }
  /// Style merged over the bar styles for key text and description. DisabledStyle takes precedence.
  public prop Style Style { get; set; }
  /// Command to run on a left click. Assign the same command used by the key binding.
  public prop OnClick Action? { get; set; }

  /// Creates an enabled hint with empty text and no command.
  public init() {
    keyText = ""
    text = ""
    IsEnabled = true
    Style = SharpTui.Style()
  }
}

internal struct KeyHintLayout {
  public var Item KeyHint
  public var TextOffset int32
  public var Width int32
  public var Start int32
}

/// A one-row command guide that omits whole hints when space is limited.
public open class KeyHintBar : Box {
  private let layout List[KeyHintLayout]
  private let order List[int32]
  private var naturalWidth int32

  /// Hints in display order. Higher priorities get space first, without changing display order.
  public prop Items List[KeyHint] { get; set; }
  /// Style merged over enabled key text. Defaults to bold for NoColor output.
  public prop KeyStyle Style { get; set; }
  /// Style merged over disabled hints. Defaults to dim.
  public prop DisabledStyle Style { get; set; }

  /// Creates an empty bar with a two-cell Gap.
  public init() {
    Items = List[KeyHint]()
    layout = List[KeyHintLayout]()
    order = List[int32]()
    KeyStyle = Style{ Attributes: TextAttributes.Bold }
    DisabledStyle = Style{ Attributes: TextAttributes.Dim }
    Gap = 2
    CanReceiveMouse = true
  }

  /// Always true so the bar measures its complete one-row content.
  protected override prop MeasuresIntrinsic bool -> true

  /// Updates retained widths and priority order after item changes.
  protected override func PrepareLayout() {
    layout.Clear()
    order.Clear()
    var width = 0
    var i = 0
    while i < Items.Count {
      let item = Items[i]
      let keyWidth = item.KeyWidth
      let textWidth = item.TextWidth
      let textOffset = keyWidth + (keyWidth > 0 && textWidth > 0 ? 1 : 0)
      let itemWidth = textOffset + textWidth
      layout.Add(KeyHintLayout{ Item: item, TextOffset: textOffset, Width: itemWidth, Start: -1 })
      var at = order.Count
      while at > 0 && Items[order[at - 1]].Priority < item.Priority { at = at - 1 }
      order.Insert(at, i)
      if i > 0 { width = width + Math.Max(0, Gap) }
      width = width + itemWidth
      i = i + 1
    }
    if naturalWidth != width {
      naturalWidth = width
      MarkMeasureDirty()
    }
  }

  /// Measures all hints without omission.
  /// @param availableWidth Available width in cells, or nil when unconstrained.
  /// @param availableHeight Available height in rows, or nil when unconstrained.
  /// @returns The complete hint width and one row.
  protected override func MeasureIntrinsic(availableWidth int32?, availableHeight int32?) CellSize -> CellSize{ WidthCells: naturalWidth, HeightRows: 1 }

  /// Draws only complete hints, keeping their original order.
  /// @param screen The screen to paint into.
  /// @param bounds The content rectangle.
  /// @param ink The inherited style.
  protected override func Render(screen Screen, bounds CellRect, ink Style) {
    var used = 0
    let gap = Math.Max(0, Gap)
    var rank = 0
    while rank < order.Count {
      let i = order[rank]
      var entry = layout[i]
      entry.Start = -1
      let needed = entry.Width + (used > 0 ? gap : 0)
      if bounds.HeightRows > 0 && entry.Width > 0 && needed <= bounds.WidthCells - used {
        entry.Start = 0
        used = used + needed
      }
      layout[i] = entry
      rank = rank + 1
    }
    var x = 0
    var i = 0
    while i < layout.Count {
      var entry = layout[i]
      i = i + 1
      if entry.Start < 0 { continue }
      if x > 0 { x = x + gap }
      entry.Start = x
      layout[i - 1] = entry
      let item = entry.Item
      var labelStyle = item.Style.MergedOver(ink)
      var keyStyle = item.Style.MergedOver(KeyStyle.MergedOver(ink))
      if !item.IsEnabled {
        labelStyle = DisabledStyle.MergedOver(labelStyle)
        keyStyle = DisabledStyle.MergedOver(keyStyle)
      }
      screen.WriteClipped(bounds, x, 0, item.KeyText, keyStyle)
      screen.WriteClipped(bounds, x + entry.TextOffset, 0, item.Text, labelStyle)
      x = x + entry.Width
    }
  }

  /// Runs enabled commands on left press within the last drawn hint, not its surrounding gap.
  /// @param ev The input event to handle.
  /// @returns Handled when a command runs, otherwise Continue.
  protected override func Accept(ev UiEvent) EventResult {
    let bounds = ContentBounds
    if ev.Kind != UiEventKind.Mouse || ev.Mouse != MouseKind.Press || ev.Button != MouseButton.Left
        || ev.Position.Row != bounds.Row || !bounds.Contains(ev.Position) { return EventResult.Continue }
    let x = ev.Position.Column - bounds.Column
    var i = 0
    while i < layout.Count {
      let entry = layout[i]
      i = i + 1
      if entry.Start < 0 || x < entry.Start || x >= entry.Start + entry.Width || !entry.Item.IsEnabled { continue }
      if let command = entry.Item.OnClick {
        command()
        return EventResult.Handled
      }
    }
    return EventResult.Continue
  }
}
