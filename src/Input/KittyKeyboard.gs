package SharpTui

import System
import System.Collections.Generic
import System.Text

internal class KittyKeyboard {
  internal func TryDecode(parameters List[uint8], final uint8, out ev UiEvent) bool {
    if final == 117 { return csiU(parameters, out ev) }
    return canonical(parameters, final, out ev)
  }

  private func csiU(parameters List[uint8], out ev UiEvent) bool {
    var main = 0
    if !fieldValue(parameters, 0, 0, out main) || !validKeyCode(main) {
      ev = UiEvent{}
      return false
    }

    var modifiers = KeyModifiers.None
    var phase = KeyPhase.Press
    if !readModifiers(parameters, out modifiers, out phase) {
      ev = UiEvent{}
      return false
    }

    var shifted = 0
    var base = 0
    if !readAlternates(parameters, out shifted, out base) {
      ev = UiEvent{}
      return false
    }
    var text = textFromCode(main)
    if hasField(parameters, 2) {
      if !associatedText(parameters, out text) {
        ev = UiEvent{}
        return false
      }
    }

    var key = keyFromCode(main)
    if key == Key.Tab && (int32(modifiers) & int32(KeyModifiers.Shift)) != 0 {
      key = Key.BackTab
    }
    ev = UiEvent{
      Kind: UiEventKind.Key,
      Key: key,
      KeyCode: main,
      ShiftedKeyCode: shifted,
      BaseLayoutKeyCode: base,
      Text: text,
      Modifiers: modifiers,
      Phase: phase,
      Mouse: MouseKind.None,
    }
    return true
  }

  private func canonical(parameters List[uint8], final uint8, out ev UiEvent) bool {
    var key Key
    var code = 0
    if final == 126 {
      var number = 0
      if !fieldValue(parameters, 0, 0, out number) {
        ev = UiEvent{}
        return false
      }
      key = tildeKey(number)
      code = inputKeyCode(key)
    } else {
      key = letterKey(final)
      code = inputKeyCode(key)
    }
    if key == Key.Unknown {
      ev = UiEvent{}
      return false
    }

    var modifiers = KeyModifiers.None
    var phase = KeyPhase.Press
    if !readModifiers(parameters, out modifiers, out phase) {
      ev = UiEvent{}
      return false
    }
    if key == Key.BackTab && (int32(modifiers) & int32(KeyModifiers.Shift)) == 0 {
      modifiers = withFlag(modifiers, KeyModifiers.Shift)
    }
    ev = UiEvent{
      Kind: UiEventKind.Key,
      Key: key,
      KeyCode: code,
      Modifiers: modifiers,
      Phase: phase,
      Mouse: MouseKind.None,
    }
    return true
  }

  private func readModifiers(parameters List[uint8], out modifiers KeyModifiers, out phase KeyPhase) bool {
    modifiers = KeyModifiers.None
    phase = KeyPhase.Press
    if !hasField(parameters, 1) { return true }

    var encoded = 0
    if !fieldValue(parameters, 1, 0, out encoded) {
      return !fieldHasDigits(parameters, 1, 0)
    }
    if encoded < 1 { return false }
    let bits = encoded - 1
    if (bits & 1) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Shift) }
    if (bits & 2) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Alt) }
    if (bits & 4) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Ctrl) }
    if (bits & 8) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Super) }
    if (bits & 16) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Hyper) }
    if (bits & 32) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Meta) }
    if (bits & 64) != 0 { modifiers = withFlag(modifiers, KeyModifiers.CapsLock) }
    if (bits & 128) != 0 { modifiers = withFlag(modifiers, KeyModifiers.NumLock) }

    if !hasSubfield(parameters, 1, 1) { return true }
    var encodedPhase = 0
    if !fieldValue(parameters, 1, 1, out encodedPhase) { return false }
    if encodedPhase == 1 { return true }
    if encodedPhase == 2 {
      phase = KeyPhase.Repeat
      return true
    }
    if encodedPhase == 3 {
      phase = KeyPhase.Release
      return true
    }
    return false
  }

  private func readAlternates(parameters List[uint8], out shifted int32, out base int32) bool {
    shifted = 0
    base = 0
    if hasSubfield(parameters, 0, 1) && !fieldValue(parameters, 0, 1, out shifted) {
      if fieldHasDigits(parameters, 0, 1) { return false }
    }
    if shifted != 0 && !validKeyCode(shifted) { return false }
    if hasSubfield(parameters, 0, 2) && !fieldValue(parameters, 0, 2, out base) {
      if fieldHasDigits(parameters, 0, 2) { return false }
    }
    return base == 0 || validKeyCode(base)
  }

  private func associatedText(parameters List[uint8], out text string) bool {
    let builder = StringBuilder()
    var subfield = 0
    while hasSubfield(parameters, 2, subfield) {
      var code = 0
      if !fieldValue(parameters, 2, subfield, out code) || !validTextCode(code) {
        text = ""
        return false
      }
      builder.Append(char.ConvertFromUtf32(code))
      subfield = subfield + 1
    }
    text = builder.ToString()
    return true
  }

  private func textFromCode(code int32) string {
    if code < 32 || !validTextCode(code) || code >= 57344 && code <= 63743 { return "" }
    if code < 128 { return InputText.Ascii[code] }
    return char.ConvertFromUtf32(code)
  }

  private func validKeyCode(value int32) bool {
    return value >= 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
  }

  private func validTextCode(value int32) bool {
    return validKeyCode(value) && value >= 32 && (value < 127 || value > 159)
  }

  private func fieldValue(parameters List[uint8], field int32, subfield int32, out value int32) bool {
    value = 0
    var currentField = 0
    var currentSubfield = 0
    var seen = false
    for b in parameters {
      if b == 59 {
        if currentField == field && currentSubfield == subfield { return seen }
        currentField = currentField + 1
        currentSubfield = 0
        value = 0
        seen = false
        continue
      }
      if b == 58 {
        if currentField == field && currentSubfield == subfield { return seen }
        currentSubfield = currentSubfield + 1
        value = 0
        seen = false
        continue
      }
      if b < 48 || b > 57 { return false }
      if currentField == field && currentSubfield == subfield {
        if value > 214748364 { return false }
        value = value * 10 + int32(b - 48)
        seen = true
      }
    }
    return currentField == field && currentSubfield == subfield && seen
  }

  private func hasField(parameters List[uint8], wanted int32) bool {
    var field = 0
    for b in parameters {
      if b == 59 { field = field + 1 }
    }
    return field >= wanted
  }

  private func hasSubfield(parameters List[uint8], wantedField int32, wantedSubfield int32) bool {
    var field = 0
    var subfield = 0
    for b in parameters {
      if b == 59 {
        if field == wantedField { return subfield >= wantedSubfield }
        if field > wantedField { return false }
        field = field + 1
        subfield = 0
      } else if b == 58 && field == wantedField {
        subfield = subfield + 1
      }
    }
    return field == wantedField && subfield >= wantedSubfield
  }

  private func fieldHasDigits(parameters List[uint8], wantedField int32, wantedSubfield int32) bool {
    var field = 0
    var subfield = 0
    var seen = false
    for b in parameters {
      if b == 59 {
        if field == wantedField && subfield == wantedSubfield { return seen }
        if field > wantedField { return false }
        field = field + 1
        subfield = 0
        seen = false
        continue
      }
      if b == 58 {
        if field == wantedField && subfield == wantedSubfield { return seen }
        if field == wantedField { subfield = subfield + 1 }
        seen = false
        continue
      }
      if field == wantedField && subfield == wantedSubfield && b >= 48 && b <= 57 {
        seen = true
      }
    }
    return field == wantedField && subfield == wantedSubfield && seen
  }

  private func tildeKey(value int32) Key {
    if value == 2 { return Key.Insert }
    if value == 3 { return Key.Delete }
    if value == 5 { return Key.PageUp }
    if value == 6 { return Key.PageDown }
    if value == 7 { return Key.Home }
    if value == 8 { return Key.End }
    if value == 11 { return Key.F1 }
    if value == 12 { return Key.F2 }
    if value == 13 { return Key.F3 }
    if value == 14 { return Key.F4 }
    if value == 15 { return Key.F5 }
    if value == 17 { return Key.F6 }
    if value == 18 { return Key.F7 }
    if value == 19 { return Key.F8 }
    if value == 20 { return Key.F9 }
    if value == 21 { return Key.F10 }
    if value == 23 { return Key.F11 }
    if value == 24 { return Key.F12 }
    return Key.Unknown
  }

  private func letterKey(value uint8) Key {
    if value == 65 { return Key.Up }
    if value == 66 { return Key.Down }
    if value == 67 { return Key.Right }
    if value == 68 { return Key.Left }
    if value == 72 { return Key.Home }
    if value == 70 { return Key.End }
    if value == 80 { return Key.F1 }
    if value == 81 { return Key.F2 }
    if value == 82 { return Key.F3 }
    if value == 83 { return Key.F4 }
    if value == 90 { return Key.BackTab }
    return Key.Unknown
  }

  private func keyFromCode(code int32) Key {
    if code == 0 { return Key.Character }
    if code == 9 { return Key.Tab }
    if code == 13 { return Key.Enter }
    if code == 27 { return Key.Escape }
    if code == 127 { return Key.Backspace }
    if code == 57344 { return Key.Escape }
    if code == 57345 { return Key.Enter }
    if code == 57346 { return Key.Tab }
    if code == 57347 { return Key.Backspace }
    if code == 57348 { return Key.Insert }
    if code == 57349 { return Key.Delete }
    if code == 57350 { return Key.Left }
    if code == 57351 { return Key.Right }
    if code == 57352 { return Key.Up }
    if code == 57353 { return Key.Down }
    if code == 57354 { return Key.PageUp }
    if code == 57355 { return Key.PageDown }
    if code == 57356 { return Key.Home }
    if code == 57357 { return Key.End }
    if code == 57364 { return Key.F1 }
    if code == 57365 { return Key.F2 }
    if code == 57366 { return Key.F3 }
    if code == 57367 { return Key.F4 }
    if code == 57368 { return Key.F5 }
    if code == 57369 { return Key.F6 }
    if code == 57370 { return Key.F7 }
    if code == 57371 { return Key.F8 }
    if code == 57372 { return Key.F9 }
    if code == 57373 { return Key.F10 }
    if code == 57374 { return Key.F11 }
    if code == 57375 { return Key.F12 }
    if code >= 57344 && code <= 63743 { return Key.Unknown }
    return Key.Character
  }

}

internal func withFlag(modifiers KeyModifiers, flag KeyModifiers) KeyModifiers {
  return KeyModifiers(int32(modifiers) | int32(flag))
}
