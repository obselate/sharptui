package SharpTui

internal class SelectionProbe {
  private var pending SelectionChange?

  internal func Record(change SelectionChange) { pending = change }

  internal func Clear() { pending = nil }

  internal func Take() SelectionChange? {
    let change = pending
    pending = nil
    return change
  }
}
