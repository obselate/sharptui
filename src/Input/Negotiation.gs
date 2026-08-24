package SharpTui

import System.Collections.Generic

internal enum KeyboardProtocolState { Idle; Querying; Supported; Unsupported }

internal class TerminalNegotiation {
  private var state KeyboardProtocolState
  private var held [128]uint8
  private var heldCount int32
  private var candidateKind int32
  private var oscEscape bool
  private var candidateComplete bool
  private var discardCandidate bool
  private var pending List[uint8]
  private var supportChanged bool
  private var backgroundAvailable bool
  private var backgroundColor string
  private var backgroundDone bool

  internal init() {
    state = KeyboardProtocolState.Idle
    held = [128]uint8{}
    heldCount = 0
    candidateKind = 0
    oscEscape = false
    candidateComplete = false
    discardCandidate = false
    pending = List[uint8](256)
    supportChanged = false
    backgroundAvailable = false
    backgroundColor = ""
    backgroundDone = true
  }

  internal func Begin() {
    Begin(true)
  }

  internal func Begin(backgroundQuery bool) {
    state = KeyboardProtocolState.Querying
    resetCandidate()
    pending.Clear()
    supportChanged = false
    backgroundAvailable = false
    backgroundColor = ""
    backgroundDone = !backgroundQuery
  }

  internal func Expire() {
    if state != KeyboardProtocolState.Querying { return }
    if candidateKind != 2 { appendHeld() }
    state = KeyboardProtocolState.Unsupported
  }

  internal func IsQuerying() bool -> state == KeyboardProtocolState.Querying

  internal func IsSupported() bool -> state == KeyboardProtocolState.Supported

  internal func HasPendingPrefix() bool -> state != KeyboardProtocolState.Querying && backgroundDone && heldCount > 0

  internal func FlushPending(input Input) {
    if !HasPendingPrefix() { return }
    offer(input, held, 0, heldCount)
    resetCandidate()
  }

  internal func ExpireBackground() {
    if candidateKind == 2 && isBackgroundPrefix() { resetCandidate() }
    backgroundDone = true
  }

  internal func TakeSupportChange() bool {
    if !supportChanged { return false }
    supportChanged = false
    return true
  }

  internal func TakeBackground(out color string) bool {
    if !backgroundAvailable {
      color = ""
      return false
    }
    color = backgroundColor
    backgroundAvailable = false
    backgroundColor = ""
    backgroundDone = true
    return true
  }

  internal func Drain(input Input) {
    if state == KeyboardProtocolState.Querying || !backgroundDone || pending.Count == 0 { return }
    let buffered = pending.ToArray()
    pending.Clear()
    input.Feed(buffered, 0, buffered.Length)
  }

  internal func Feed(input Input, bytes []uint8, offset int32, length int32) {
    if state == KeyboardProtocolState.Querying || !backgroundDone {
      filter(input, bytes, offset, length, true)
      return
    }
    filter(input, bytes, offset, length, false)
  }

  private func filter(input Input, bytes []uint8, offset int32, length int32, quarantine bool) {
    var start = offset
    var i = offset
    let end = offset + length
    while i < end {
      let value = bytes[i]
      if heldCount == 0 {
        if value == 27 {
          offerOrBuffer(input, bytes, start, i - start, quarantine)
          held[0] = value
          heldCount = 1
          candidateKind = 0
          oscEscape = false
          candidateComplete = false
          discardCandidate = false
          start = i + 1
        }
        i = i + 1
        continue
      }
      if consumeHeld(value) {
        if candidateComplete {
          if !discardCandidate { offerOrBuffer(input, held, 0, heldCount, quarantine) }
          resetCandidate()
          start = i + 1
        }
        i = i + 1
        continue
      }
      offerOrBuffer(input, held, 0, heldCount, quarantine)
      resetCandidate()
      if value == 27 {
        held[0] = value
        heldCount = 1
        start = i + 1
      } else {
        offerOrBuffer(input, bytes, i, 1, quarantine)
        start = i + 1
      }
      i = i + 1
    }
    if heldCount == 0 { offerOrBuffer(input, bytes, start, end - start, quarantine) }
  }

  private func consumeHeld(value uint8) bool {
    if candidateKind == 0 {
      if heldCount != 1 { return false }
      if value != 91 && value != 93 { return false }
      held[heldCount] = value
      heldCount = heldCount + 1
      candidateKind = value == 91 ? 1 : 2
      return true
    }
    if candidateKind == 2 { return consumeOsc(value) }
    if heldCount == 2 {
      if value != 63 { return false }
      held[heldCount] = value
      heldCount = heldCount + 1
      return true
    }
    if (value >= 48 && value <= 57) || value == 59 {
      if heldCount == 128 { return false }
      held[heldCount] = value
      heldCount = heldCount + 1
      return true
    }
    if value != 117 { return false }
    held[heldCount] = value
    heldCount = heldCount + 1
    candidateComplete = true
    discardCandidate = true
    if state == KeyboardProtocolState.Querying {
      state = KeyboardProtocolState.Supported
      supportChanged = true
    }
    return true
  }

  private func consumeOsc(value uint8) bool {
    if heldCount == 128 {
      if !isBackgroundReply() { return false }
      discardCandidate = true
      if value == 7 || (oscEscape && value == 92) { candidateComplete = true }
      oscEscape = value == 27
      return true
    }
    held[heldCount] = value
    heldCount = heldCount + 1
    if value == 7 {
      finishOsc(1)
      return true
    }
    if oscEscape && value == 92 {
      finishOsc(2)
      return true
    }
    oscEscape = value == 27
    return true
  }

  private func finishOsc(terminatorLength int32) {
    let parsed = parseBackground(terminatorLength)
    if isBackgroundReply() { discardCandidate = true }
    if parsed != "" {
      backgroundColor = parsed
      backgroundAvailable = true
    }
    candidateComplete = true
  }

  private func isBackgroundReply() bool {
    return heldCount >= 5 && held[0] == 27 && held[1] == 93 && held[2] == 49
        && held[3] == 49 && held[4] == 59
  }

  private func isBackgroundPrefix() bool {
    if heldCount > 0 && held[0] != 27 { return false }
    if heldCount > 1 && held[1] != 93 { return false }
    if heldCount > 2 && held[2] != 49 { return false }
    if heldCount > 3 && held[3] != 49 { return false }
    if heldCount > 4 && held[4] != 59 { return false }
    return heldCount > 0
  }

  private func parseBackground(terminatorLength int32) string {
    let end = heldCount - terminatorLength
    if end <= 5 || held[0] != 27 || held[1] != 93 || held[2] != 49
        || held[3] != 49 || held[4] != 59 { return "" }
    let payloadStart = 5
    if held[payloadStart] == 114 && held[payloadStart + 1] == 103
        && held[payloadStart + 2] == 98 && held[payloadStart + 3] == 58 {
      var slashCount = 0
      var componentLength = 0
      var componentCount = 0
      var i = payloadStart + 4
      while i < end {
        let value = held[i]
        if isHex(value) {
          componentLength = componentLength + 1
          if componentLength > 4 { return "" }
        } else if value == 47 {
          if componentLength == 0 { return "" }
          slashCount = slashCount + 1
          componentCount = componentCount + 1
          componentLength = 0
        } else {
          return ""
        }
        i = i + 1
      }
      if componentLength == 0 { return "" }
      componentCount = componentCount + 1
      if slashCount != 2 || componentCount != 3 { return "" }
      return payloadText(payloadStart, end)
    }
    if held[payloadStart] != 35 { return "" }
    let length = end - payloadStart - 1
    if length != 3 && length != 6 && length != 9 && length != 12 { return "" }
    var i = payloadStart + 1
    while i < end {
      if !isHex(held[i]) { return "" }
      i = i + 1
    }
    return payloadText(payloadStart, end)
  }

  private func payloadText(start int32, end int32) string {
    let text = System.Text.StringBuilder()
    var i = start
    while i < end {
      text.Append(char(held[i]))
      i = i + 1
    }
    return text.ToString()
  }

  private func isHex(value uint8) bool {
    return (value >= 48 && value <= 57) || (value >= 65 && value <= 70)
        || (value >= 97 && value <= 102)
  }

  private func appendHeld() {
    var i = 0
    while i < heldCount {
      bufferByte(held[i])
      i = i + 1
    }
    resetCandidate()
  }

  private func resetCandidate() {
    heldCount = 0
    candidateKind = 0
    oscEscape = false
    candidateComplete = false
    discardCandidate = false
  }

  private func bufferByte(value uint8) {
    pending.Add(value)
  }

  private func offerOrBuffer(input Input, bytes []uint8, offset int32, length int32, quarantine bool) {
    if length == 0 { return }
    if quarantine {
      var i = offset
      let end = offset + length
      while i < end {
        bufferByte(bytes[i])
        i = i + 1
      }
      return
    }
    offer(input, bytes, offset, length)
  }

  private func offer(input Input, bytes []uint8, offset int32, length int32) {
    if length > 0 { input.Feed(bytes, offset, length) }
  }
}
