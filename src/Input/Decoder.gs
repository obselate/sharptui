package SharpTui

import System
import System.Collections.Generic
import System.Text

internal enum InputState { Ground; Escape; Csi; Ss3; Paste }

internal class InputText {
  shared {
    internal let Ascii List[string] = List[string]()

    init {
      for i in 0 ... 128 { Ascii.Add(char(i).ToString()) }
    }
  }
}

internal class InputDecoder {
  private var state InputState
  private var utf8 [4]uint8
  private var utf8Count int32
  private var utf8Need int32
  private var utf8Modifiers KeyModifiers
  private var csi List[uint8]
  private var events List[UiEvent]
  private var eventHead int32
  private var kitty KittyKeyboard
  private var paste BracketedPaste
  private var terminfo TerminfoKeyDecoder

  internal init() {
    state = InputState.Ground
    utf8 = [4]uint8{}
    utf8Count = 0
    utf8Need = 0
    utf8Modifiers = KeyModifiers.None
    csi = List[uint8](32)
    events = List[UiEvent](8)
    eventHead = 0
    kitty = KittyKeyboard()
    paste = BracketedPaste()
    terminfo = TerminfoKeyDecoder()
  }

  internal func ConfigureTerminfo(sequences []TerminfoKeySequence) {
    terminfo.Configure(sequences)
  }

  internal func Feed(bytes []uint8) {
    Feed(bytes, 0, bytes.Length)
  }

  internal func Feed(bytes []uint8, offset int32, length int32) {
    var i = offset
    let end = offset + length
    while i < end {
      if state == InputState.Paste {
        consume(bytes[i])
      } else if terminfo.Enabled {
        terminfo.Feed(bytes[i])
        drainTerminfo()
      } else {
        consume(bytes[i])
      }
      i = i + 1
    }
  }

  internal func Finish() {
    terminfo.Flush()
    drainTerminfo()
    if utf8Need > 0 { invalidUtf8() }
    state = InputState.Ground
    csi.Clear()
    paste.Begin()
  }

  internal func FlushPending() {
    terminfo.Flush()
    drainTerminfo()
    if state == InputState.Escape {
      state = InputState.Ground
      emit(inputKey(Key.Escape, 57344, KeyModifiers.None))
      return
    }
    if state != InputState.Ground {
      state = InputState.Ground
      csi.Clear()
    }
  }

  internal func HasEvents() bool {
    return eventHead < events.Count
  }

  internal func HasPendingPrefix() bool {
    return terminfo.HasPendingPrefix || state == InputState.Escape || state == InputState.Csi
      || state == InputState.Ss3
  }

  internal func TryDequeue(out ev UiEvent) bool {
    if eventHead >= events.Count {
      ev = UiEvent{}
      return false
    }
    ev = events[eventHead]
    eventHead = eventHead + 1
    if eventHead == events.Count {
      events.Clear()
      eventHead = 0
    }
    return true
  }

  private func drainTerminfo() {
    var output = TerminfoOutput{}
    while terminfo.TryDequeue(out output) {
      if output.Kind == TerminfoOutputKind.Key { emit(output.Event) }
      if output.Kind == TerminfoOutputKind.Byte { consume(output.Byte) }
    }
  }

  private func consume(value uint8) {
    if state == InputState.Paste {
      if paste.Feed(value) {
        state = InputState.Ground
        emit(UiEvent{ Kind: UiEventKind.Paste, Key: Key.Character, Text: paste.Text(), Mouse: MouseKind.None })
      }
      return
    }
    if utf8Need > 0 {
      if isContinuation(value) && validUtf8Continuation(value) {
        utf8[utf8Count] = value
        utf8Count = utf8Count + 1
        if utf8Count == utf8Need { completeUtf8() }
        return
      }
      invalidUtf8()
    }
    if state == InputState.Escape {
      escapeByte(value)
      return
    }
    if state == InputState.Csi {
      csiByte(value)
      return
    }
    if state == InputState.Ss3 {
      ss3Byte(value)
      return
    }
    groundByte(value, KeyModifiers.None)
  }

  private func groundByte(value uint8, modifiers KeyModifiers) {
    if value == 27 {
      state = InputState.Escape
      return
    }
    if value == 13 || value == 10 {
      emit(inputKey(Key.Enter, 13, modifiers))
      return
    }
    if value == 9 {
      emit(inputKey(Key.Tab, 9, modifiers))
      return
    }
    if value == 127 || value == 8 {
      emit(inputKey(Key.Backspace, int32(value), modifiers))
      return
    }
    if value < 32 {
      var control = UiEvent{}
      if ControlInput.TryDecode(value, out control) {
        emit(inputWithModifiers(control, KeyModifiers(int32(control.Modifiers) | int32(modifiers))))
      }
      return
    }
    beginUtf8(value, modifiers)
  }

  private func escapeByte(value uint8) {
    state = InputState.Ground
    if value == 91 {
      csi.Clear()
      state = InputState.Csi
      return
    }
    if value == 79 {
      csi.Clear()
      state = InputState.Ss3
      return
    }
    groundByte(value, KeyModifiers.Alt)
  }

  private func ss3Byte(value uint8) {
    state = InputState.Ground
    var ev = UiEvent{}
    if kitty.TryDecode(csi, value, out ev) { emit(ev) }
  }

  private func csiByte(value uint8) {
    if value >= 64 && value <= 126 {
      state = InputState.Ground
      completeCsi(value)
      return
    }
    if value >= 32 && value <= 63 && csi.Count < 128 {
      csi.Add(value)
      return
    }
    state = InputState.Ground
    csi.Clear()
  }

  private func completeCsi(final uint8) {
    if final == 126 && literal(50, 48, 48) {
      state = InputState.Paste
      paste.Begin()
      csi.Clear()
      return
    }
    var ev = UiEvent{}
    if SgrMouse.TryDecode(csi, final, out ev) {
      emit(ev)
      csi.Clear()
      return
    }
    if kitty.TryDecode(csi, final, out ev) { emit(ev) }
    csi.Clear()
  }

  private func literal(first uint8, second uint8, third uint8) bool {
    return csi.Count == 3 && csi[0] == first && csi[1] == second && csi[2] == third
  }

  private func beginUtf8(value uint8, modifiers KeyModifiers) {
    if value < 128 {
      emitText(int32(value), InputText.Ascii[int32(value)], modifiers)
      return
    }
    if value >= 194 && value <= 223 { utf8Need = 2 }
    if value >= 224 && value <= 239 { utf8Need = 3 }
    if value >= 240 && value <= 244 { utf8Need = 4 }
    if utf8Need == 0 {
      emitReplacement()
      return
    }
    utf8[0] = value
    utf8Count = 1
    utf8Modifiers = modifiers
  }

  private func isContinuation(value uint8) bool {
    return value >= 128 && value <= 191
  }

  private func validUtf8Continuation(value uint8) bool {
    if utf8Count != 1 { return true }
    let lead = utf8[0]
    if lead == 224 { return value >= 160 }
    if lead == 237 { return value <= 159 }
    if lead == 240 { return value >= 144 }
    if lead == 244 { return value <= 143 }
    return true
  }

  private func completeUtf8() {
    let text = Encoding.UTF8.GetString(utf8, 0, utf8Count)
    emitText(utf8Codepoint(), text, utf8Modifiers)
    utf8Count = 0
    utf8Need = 0
    utf8Modifiers = KeyModifiers.None
  }

  private func utf8Codepoint() int32 {
    if utf8Count == 2 {
      return (int32(utf8[0] & 31) << 6) | int32(utf8[1] & 63)
    }
    if utf8Count == 3 {
      return (int32(utf8[0] & 15) << 12) | (int32(utf8[1] & 63) << 6) | int32(utf8[2] & 63)
    }
    return (int32(utf8[0] & 7) << 18) | (int32(utf8[1] & 63) << 12)
      | (int32(utf8[2] & 63) << 6) | int32(utf8[3] & 63)
  }

  private func invalidUtf8() {
    utf8Count = 0
    utf8Need = 0
    utf8Modifiers = KeyModifiers.None
    emitReplacement()
  }

  private func emitReplacement() {
    emit(UiEvent{
      Kind: UiEventKind.TextInput,
      Key: Key.Character,
      KeyCode: 0xfffd,
      Text: char.ConvertFromUtf32(0xfffd),
      Phase: KeyPhase.Press,
      Mouse: MouseKind.None,
    })
  }

  private func emitText(code int32, text string, modifiers KeyModifiers) {
    emit(UiEvent{
      Kind: modifiers == KeyModifiers.None ? UiEventKind.TextInput : UiEventKind.Key,
      Key: Key.Character,
      KeyCode: code,
      Text: text,
      Modifiers: modifiers,
      Phase: KeyPhase.Press,
      Mouse: MouseKind.None,
    })
  }

  private func emit(ev UiEvent) {
    if ev.Kind != UiEventKind.Unknown { events.Add(ev) }
  }
}
