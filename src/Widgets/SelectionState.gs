package SharpTui

/// The selected index and pending SelectionChange plumbing shared by the
/// selection widgets (ListView, TableView, TreeView, Select, Tabs).
internal class SelectionState {
  internal var Index int32
  internal var Change SelectionChange?

  public init() {
    Index = 0
    Change = nil
  }

  /// Moves the selection. A user move emits a pending change; a programmatic
  /// move clears any pending one, even when the index is unchanged.
  internal func Set(value int32, emit bool) bool {
    if Index == value {
      if !emit { Change = nil }
      return false
    }
    let previous = Index
    Index = value
    Change = emit ? SelectionChange(previous, value) : nil
    return true
  }

  /// Returns and clears the pending change.
  internal func Consume() SelectionChange? {
    let pending = Change
    Change = nil
    return pending
  }
}
