package SharpTui

import System
import System.Collections.Generic

internal class HyperlinkCache {
  private var byTarget Dictionary[string, int32]
  private var targets List[string]

  internal init() {
    byTarget = Dictionary[string, int32](StringComparer.Ordinal)
    targets = List[string]()
  }

  internal func Resolve(target string) int32 {
    if target == nil || target.Length == 0 { return 0 }
    validate(target)
    var id = 0
    if byTarget.TryGetValue(target, &id) { return id }
    id = targets.Count + 1
    targets.Add(target)
    byTarget.Add(target, id)
    return id
  }

  internal func Target(id int32) string -> id <= 0 ? "" : targets[id - 1]

  private func validate(target string) {
    for value in target {
      if value < char(32) || (value >= char(127) && value <= char(159)) {
        throw ArgumentException("Hyperlink targets cannot contain control characters.", "target")
      }
    }
  }
}
