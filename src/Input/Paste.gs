package SharpTui

import System.Text

internal class BracketedPaste {
  private var bytes TerminalBuffer
  private var marker [6]uint8
  private var matched int32

  internal init() {
    bytes = TerminalBuffer(1024)
    marker = [6]uint8{ 27, 91, 50, 48, 49, 126 }
    matched = 0
  }

  internal func Begin() {
    bytes.Reset()
    matched = 0
  }

  internal func Feed(value uint8) bool {
    if value == marker[matched] {
      matched = matched + 1
      return matched == 6
    }
    var i = 0
    while i < matched {
      bytes.AppendByte(marker[i])
      i = i + 1
    }
    matched = 0
    if value == 27 { matched = 1 } else { bytes.AppendByte(value) }
    return false
  }

  internal func Text() string {
    return bytes.Text()
  }
}
