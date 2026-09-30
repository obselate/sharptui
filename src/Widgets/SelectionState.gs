package SharpTui

import System

/// Selection state shared by the selection widgets.
internal class SelectionState {
  internal var Index int32
  internal var Change SelectionChange?
  internal var OnChange Action[SelectionChange]?

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

  internal func Notify() {
    let pending = Change
    Change = nil
    if let change = pending {
      if let callback = OnChange { callback(change) }
    }
  }
}
