package SharpTui

import System.Collections.Generic

internal class SgrMouse {
  shared {
    internal func TryDecode(parameters List[uint8], final uint8, out ev UiEvent) bool {
      ev = UiEvent{}
      if final != 77 && final != 109 || parameters.Count == 0 || parameters[0] != 60 { return false }
      let button = parameter(parameters, 0, 1)
      let column = parameter(parameters, 1, 1)
      let row = parameter(parameters, 2, 1)
      if button < 0 || column <= 0 || row <= 0 { return false }

      var kind MouseKind
      if (button & 64) != 0 {
        kind = (button & 1) == 0 ? MouseKind.ScrollUp : MouseKind.ScrollDown
      } else if final == 109 {
        kind = MouseKind.Release
      } else if (button & 32) != 0 {
        kind = MouseKind.Move
      } else {
        kind = MouseKind.Press
      }
      let mouseButton = buttonIdentity(button)
      var modifiers = KeyModifiers.None
      if (button & 4) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Shift) }
      if (button & 8) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Alt) }
      if (button & 16) != 0 { modifiers = withFlag(modifiers, KeyModifiers.Ctrl) }
      ev = UiEvent{
        Kind: UiEventKind.Mouse,
        Key: Key.Unknown,
        Modifiers: modifiers,
        Mouse: kind,
        Button: (button & 64) != 0 ? MouseButton.None : mouseButton,
        Position: CellPoint{ Column: column - 1, Row: row - 1 },
      }
      return true
    }

    private func buttonIdentity(button int32) MouseButton {
      let identity = button & 3
      if identity == 0 { return MouseButton.Left }
      if identity == 1 { return MouseButton.Middle }
      if identity == 2 { return MouseButton.Right }
      return MouseButton.None
    }

    private func parameter(parameters List[uint8], index int32, start int32) int32 {
      var parameterIndex = 0
      var value = 0
      var seen = false
      var i = start
      while i < parameters.Count {
        let b = parameters[i]
        if b == 59 {
          if parameterIndex == index { return seen ? value : -1 }
          parameterIndex = parameterIndex + 1
          value = 0
          seen = false
        } else if b >= 48 && b <= 57 {
          value = value * 10 + int32(b - 48)
          seen = true
        } else {
          return -1
        }
        i = i + 1
      }
      return parameterIndex == index && seen ? value : -1
    }
  }
}
