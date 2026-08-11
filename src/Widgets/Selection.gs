package SharpTui

/// Shared index/scroll clamp math reused by the selection-list widgets (ListView, TableView,
/// TreeView, Select, Tabs, and the line-viewport widgets). Internal only, not public API.
internal class Selection {
  shared {
    /// Clamps index into [0, count - 1], or 0 when count is zero.
    public func ClampIndex(count int32, index int32) int32 {
      if count == 0 { return 0 }
      if index < 0 { return 0 }
      if index >= count { return count - 1 }
      return index
    }

    /// Clamps a scroll offset so height rows never overrun count items.
    public func ClampScroll(count int32, scroll int32, height int32) int32 {
      var max = count - height
      if max < 0 { max = 0 }
      if scroll > max { return max }
      if scroll < 0 { return 0 }
      return scroll
    }

    /// Scrolls the minimum amount to bring index back inside the viewport.
    public func ScrollIntoView(count int32, index int32, scroll int32, height int32) int32 {
      var s = scroll
      if index < s { s = index }
      if index >= s + height { s = index - height + 1 }
      var max = count - height
      if max < 0 { max = 0 }
      if s > max { return max }
      if s < 0 { return 0 }
      return s
    }

    /// The walk direction toward want from the current selection.
    public func DirectionFor(want int32, current int32) int32 {
      return want < current ? -1 : 1
    }
  }
}
