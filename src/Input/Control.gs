package SharpTui

internal class ControlInput {
  shared {
    internal func TryDecode(value uint8, out ev UiEvent) bool {
      ev = UiEvent{}
      var code = 0
      if value == 0 { code = 32 }
      if value >= 1 && value <= 26 { code = int32(value + 96) }
      if value >= 28 && value <= 31 { code = int32(value + 64) }
      if code == 0 { return false }
      ev = UiEvent{
        Kind: UiEventKind.Key,
        Key: Key.Character,
        KeyCode: code,
        Text: InputText.Ascii[code],
        Modifiers: KeyModifiers.Ctrl,
        Phase: KeyPhase.Press,
        Mouse: MouseKind.None,
      }
      return true
    }
  }
}
