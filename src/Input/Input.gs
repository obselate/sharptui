package SharpTui

import System.Threading

internal class Input {
  private var wake AutoResetEvent
  private var decoder InputDecoder
  private var gate Object

  internal init(wakeup AutoResetEvent) {
    wake = wakeup
    decoder = InputDecoder()
    gate = Object()
  }

  internal func ConfigureTerminfo(sequences []TerminfoKeySequence) {
    lock gate { decoder.ConfigureTerminfo(sequences) }
  }

  internal func Feed(bytes []uint8) {
    Feed(bytes, 0, bytes.Length)
  }

  internal func Feed(bytes []uint8, offset int32, length int32) {
    var notify = false
    lock gate {
      let empty = !decoder.HasEvents()
      decoder.Feed(bytes, offset, length)
      notify = empty && decoder.HasEvents()
    }
    if notify { wake.Set() }
  }

  internal func Finish() {
    var notify = false
    lock gate {
      let empty = !decoder.HasEvents()
      decoder.Finish()
      notify = empty && decoder.HasEvents()
    }
    if notify { wake.Set() }
  }

  internal func FlushPending() {
    var notify = false
    lock gate {
      let empty = !decoder.HasEvents()
      decoder.FlushPending()
      notify = empty && decoder.HasEvents()
    }
    if notify { wake.Set() }
  }

  internal func HasPendingPrefix() bool {
    lock gate { return decoder.HasPendingPrefix() }
  }

  internal func TryDequeue(out ev UiEvent) bool {
    lock gate { return decoder.TryDequeue(out ev) }
  }
}
