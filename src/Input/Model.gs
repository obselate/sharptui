package SharpTui

import System

/// Logical key identity, independent of layout. `Character` covers printable text, whose grapheme is carried in the event's Text field.
public enum Key {
  Unknown = 0;
  Character = 1;
  Enter = 2;
  Tab = 3;
  BackTab = 4;
  Backspace = 5;
  Escape = 6;
  Up = 7;
  Down = 8;
  Left = 9;
  Right = 10;
  Home = 11;
  End = 12;
  PageUp = 13;
  PageDown = 14;
  Delete = 15;
  Insert = 16;
  F1 = 17;
  F2 = 18;
  F3 = 19;
  F4 = 20;
  F5 = 21;
  F6 = 22;
  F7 = 23;
  F8 = 24;
  F9 = 25;
  F10 = 26;
  F11 = 27;
  F12 = 28;
}

/// Modifier keys held during a key or mouse event, combined as bit flags. `CapsLock` and `NumLock` report lock state rather than a held key, and are stripped before shortcut matching.
@Flags
public enum KeyModifiers {
  None = 0;
  Shift = 1;
  Alt = 2;
  Ctrl = 4;
  Super = 8;
  Hyper = 16;
  Meta = 32;
  CapsLock = 64;
  NumLock = 128;
}

/// Stage of a key press, reported by the Kitty keyboard protocol. `Repeat` is an auto-repeat of a held key and `Release` fires only when the terminal reports key-up events. Gestures only match `Press`.
public enum KeyPhase { Press; Repeat; Release }

/// Which variant of input an UiEvent carries; determines which of its other fields are meaningful.
public enum UiEventKind { Key; TextInput; Paste; Mouse; Tick; Unknown }

/// Terminal mouse reporting selected when an App enters the terminal.
public enum MouseTracking { Disabled; Click; Drag; AllMotion }

/// Which physical mouse button a Mouse event reports, when known.
public enum MouseButton { None; Left; Middle; Right }

/// A single decoded input event: a keystroke, pasted text, a mouse action, or a timer tick. Fields that do not apply to Kind are left at their default.
public struct UiEvent {
  private var kind UiEventKind
  private var key Key
  private var keyCode int32
  private var shiftedKeyCode int32
  private var baseLayoutKeyCode int32
  private var text string
  private var modifiers KeyModifiers
  private var phase KeyPhase
  private var mouse MouseKind
  private var button MouseButton
  private var position CellPoint

  /// Which variant of input this event represents.
  public prop Kind UiEventKind { get { return kind } init { kind = value } }
  /// The logical key for a Key event; Character for text input, Unknown when not applicable.
  public prop Key Key { get { return key } init { key = value } }
  /// The Kitty keyboard protocol codepoint for the key, including private-use codes for named keys without a Unicode codepoint.
  public prop KeyCode int32 { get { return keyCode } init { keyCode = value } }
  /// The codepoint this key would produce with Shift applied, from Kitty's alternate-key reporting; zero when not reported.
  public prop ShiftedKeyCode int32 { get { return shiftedKeyCode } init { shiftedKeyCode = value } }
  /// The codepoint this key would produce under the standard PC-101 layout, from Kitty's alternate-key reporting; zero when not reported.
  public prop BaseLayoutKeyCode int32 { get { return baseLayoutKeyCode } init { baseLayoutKeyCode = value } }
  /// The grapheme or pasted text carried by this event; empty when none applies.
  public prop Text string { get { return text } init { text = value } }
  /// Modifier keys held when this event occurred.
  public prop Modifiers KeyModifiers { get { return modifiers } init { modifiers = value } }
  /// Press, repeat, or release stage of a Key event; always Press for other kinds.
  public prop Phase KeyPhase { get { return phase } init { phase = value } }
  /// The mouse action for a Mouse event; None for other kinds.
  public prop Mouse MouseKind { get { return mouse } init { mouse = value } }
  /// The mouse button involved in a Mouse event; None when not applicable.
  public prop Button MouseButton { get { return button } init { button = value } }
  /// The terminal cell a Mouse event occurred at.
  public prop Position CellPoint { get { return position } init { position = value } }
}

/// A key combination to match against incoming events, such as a shortcut. Compares Key and shortcut-relevant modifiers, and for character gestures, Text case-insensitively.
public struct KeyGesture {
  private var key Key
  private var text string
  private var modifiers KeyModifiers

  /// The key this gesture matches.
  public prop Key Key { get { return key } init { key = value } }
  /// For a Character gesture, the single grapheme to match case-insensitively; unused otherwise.
  public prop Text string { get { return text } init { text = value } }
  /// The modifiers this gesture requires; lock flags are ignored during matching.
  public prop Modifiers KeyModifiers { get { return modifiers } init { modifiers = value } }

  shared {
    /// Builds a gesture that matches a single printable grapheme with no modifiers.
    /// @param text The single grapheme to match.
    /// @returns The built gesture.
    public func Character(text string) KeyGesture {
      return characterGesture(text, KeyModifiers.None)
    }

    /// Builds a gesture that matches a single printable grapheme held with Ctrl.
    /// @param text The single grapheme to match.
    /// @returns The built gesture.
    public func Ctrl(text string) KeyGesture {
      return characterGesture(text, KeyModifiers.Ctrl)
    }
  }

  /// Reports whether ev is a Key or TextInput Press with this gesture's key and matching shortcut modifiers (lock flags ignored), and for Character gestures, matching Text case-insensitively.
  /// @param ev The event to test.
  /// @returns True when the event matches this gesture.
  public func Matches(ev UiEvent) bool {
    if ev.Kind != UiEventKind.Key && ev.Kind != UiEventKind.TextInput { return false }
    if ev.Phase != KeyPhase.Press { return false }
    if Key != ev.Key || inputShortcutModifiers(Modifiers) != inputShortcutModifiers(ev.Modifiers) {
      return false
    }
    if Key != Key.Character { return true }
    return String.Equals(Text, ev.Text, StringComparison.OrdinalIgnoreCase)
  }
}

/// The mouse action a Mouse event reports. `None` marks an event with no mouse action, such as a key or tick.
public enum MouseKind { Press, Release, Move, ScrollUp, ScrollDown, None }

private func characterGesture(text string, modifiers KeyModifiers) KeyGesture {
  if CellText.Graphemes(text).Count != 1 {
    throw ArgumentException("A key gesture character must be exactly one grapheme.", "text")
  }
  return KeyGesture{ Key: Key.Character, Text: text, Modifiers: modifiers }
}

internal func inputKey(value Key, code int32, modifiers KeyModifiers) UiEvent {
  return UiEvent{
    Kind: UiEventKind.Key,
    Key: value,
    KeyCode: code == 0 ? inputKeyCode(value) : code,
    Modifiers: modifiers,
    Phase: KeyPhase.Press,
    Mouse: MouseKind.None,
  }
}

internal func inputShortcutModifiers(modifiers KeyModifiers) KeyModifiers {
  let locks = int32(KeyModifiers.CapsLock) | int32(KeyModifiers.NumLock)
  return KeyModifiers(int32(modifiers) & (int32(0x7fffffff) ^ locks))
}

internal func inputKeyCode(key Key) int32 {
  if key == Key.Escape { return 57344 }
  if key == Key.Enter { return 57345 }
  if key == Key.Tab { return 57346 }
  if key == Key.BackTab { return 57346 }
  if key == Key.Backspace { return 57347 }
  if key == Key.Insert { return 57348 }
  if key == Key.Delete { return 57349 }
  if key == Key.Left { return 57350 }
  if key == Key.Right { return 57351 }
  if key == Key.Up { return 57352 }
  if key == Key.Down { return 57353 }
  if key == Key.PageUp { return 57354 }
  if key == Key.PageDown { return 57355 }
  if key == Key.Home { return 57356 }
  if key == Key.End { return 57357 }
  if key == Key.F1 { return 57364 }
  if key == Key.F2 { return 57365 }
  if key == Key.F3 { return 57366 }
  if key == Key.F4 { return 57367 }
  if key == Key.F5 { return 57368 }
  if key == Key.F6 { return 57369 }
  if key == Key.F7 { return 57370 }
  if key == Key.F8 { return 57371 }
  if key == Key.F9 { return 57372 }
  if key == Key.F10 { return 57373 }
  if key == Key.F11 { return 57374 }
  if key == Key.F12 { return 57375 }
  return 0
}

internal func inputWithModifiers(ev UiEvent, modifiers KeyModifiers) UiEvent {
  return UiEvent{
    Kind: ev.Kind,
    Key: ev.Key,
    KeyCode: ev.KeyCode,
    ShiftedKeyCode: ev.ShiftedKeyCode,
    BaseLayoutKeyCode: ev.BaseLayoutKeyCode,
    Text: ev.Text,
    Modifiers: modifiers,
    Phase: ev.Phase,
    Mouse: ev.Mouse,
    Button: ev.Button,
    Position: ev.Position,
  }
}

internal func inputIsRelease(ev UiEvent) bool {
  return ev.Kind == UiEventKind.Key && ev.Phase == KeyPhase.Release
}

/// Maps a handled flag to the matching EventResult, shared by widget Accept overrides.
internal func result(handled bool) EventResult {
  return handled ? EventResult.Handled : EventResult.Continue
}
