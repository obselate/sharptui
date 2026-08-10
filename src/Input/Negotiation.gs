package SharpTui

import System.Collections.Generic

internal enum KeyboardProtocolState { Idle; Querying; Supported; Unsupported }

/// Holds probe-era input until Kitty support is known and removes its replies.
internal class TerminalNegotiation {
  private var state KeyboardProtocolState
  private var held [64]uint8
  private var heldCount int32
  private var pending List[uint8]
  private var supportChanged bool

  internal init() {
    state = KeyboardProtocolState.Idle
    held = [64]uint8{}
    heldCount = 0
    pending = List[uint8](256)
    supportChanged = false
  }

  internal func Begin() {
    state = KeyboardProtocolState.Querying
    heldCount = 0
    pending.Clear()
    supportChanged = false
  }

  internal func Expire() {
    if state != KeyboardProtocolState.Querying { return }
    appendHeld()
    state = KeyboardProtocolState.Unsupported
  }

  internal func IsQuerying() bool {
    return state == KeyboardProtocolState.Querying
  }

  internal func IsSupported() bool {
    return state == KeyboardProtocolState.Supported
  }

  internal func HasPendingPrefix() bool {
    return state == KeyboardProtocolState.Unsupported && heldCount > 0
  }

  internal func FlushPending(input Input) {
    if !HasPendingPrefix() { return }
    offer(input, held, 0, heldCount)
    heldCount = 0
  }

  internal func TakeSupportChange() bool {
    if !supportChanged { return false }
    supportChanged = false
    return true
  }

  internal func Drain(input Input) {
    if pending.Count == 0 { return }
    let buffered = pending.ToArray()
    pending.Clear()
    input.Feed(buffered, 0, buffered.Length)
  }

  internal func Feed(input Input, bytes []uint8, offset int32, length int32) {
    if state == KeyboardProtocolState.Supported {
      input.Feed(bytes, offset, length)
      return
    }
    if state == KeyboardProtocolState.Querying {
      capture(bytes, offset, length)
      return
    }
    filterUnsupported(input, bytes, offset, length)
  }

  private func capture(bytes []uint8, offset int32, length int32) {
    var i = offset
    let end = offset + length
    while i < end {
      let value = bytes[i]
      if heldCount == 0 {
        if value == 27 {
          held[0] = value
          heldCount = 1
        } else {
          bufferByte(value)
        }
        i = i + 1
        continue
      }
      if consumeHeld(value) {
        i = i + 1
        continue
      }
      appendHeld()
      if value == 27 {
        held[0] = value
        heldCount = 1
      } else {
        bufferByte(value)
      }
      i = i + 1
    }
  }

  private func filterUnsupported(input Input, bytes []uint8, offset int32, length int32) {
    var start = offset
    var i = offset
    let end = offset + length
    while i < end {
      let value = bytes[i]
      if heldCount == 0 {
        if value == 27 {
          offer(input, bytes, start, i - start)
          held[0] = value
          heldCount = 1
          start = i + 1
        }
        i = i + 1
        continue
      }
      if consumeHeld(value) {
        start = i + 1
        i = i + 1
        continue
      }
      offer(input, held, 0, heldCount)
      heldCount = 0
      if value == 27 {
        held[0] = value
        heldCount = 1
        start = i + 1
      } else {
        start = i
      }
      i = i + 1
    }
    if heldCount == 0 { offer(input, bytes, start, end - start) }
  }

  private func consumeHeld(value uint8) bool {
    if heldCount == 1 {
      if value != 91 { return false }
      held[heldCount] = value
      heldCount = heldCount + 1
      return true
    }
    if heldCount == 2 {
      if value != 63 { return false }
      held[heldCount] = value
      heldCount = heldCount + 1
      return true
    }
    if (value >= 48 && value <= 57) || value == 59 {
      if heldCount == 64 { return false }
      held[heldCount] = value
      heldCount = heldCount + 1
      return true
    }
    if value != 117 { return false }
    heldCount = 0
    if state == KeyboardProtocolState.Querying {
      state = KeyboardProtocolState.Supported
      supportChanged = true
    }
    return true
  }

  private func appendHeld() {
    var i = 0
    while i < heldCount {
      bufferByte(held[i])
      i = i + 1
    }
    heldCount = 0
  }

  private func bufferByte(value uint8) {
    pending.Add(value)
  }

  private func offer(input Input, bytes []uint8, offset int32, length int32) {
    if length > 0 { input.Feed(bytes, offset, length) }
  }
}
