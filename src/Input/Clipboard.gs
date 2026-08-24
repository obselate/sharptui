package SharpTui

import System

/// Reads and writes plain text for editable controls.
public interface Clipboard {
  /// Returns the current plain-text clipboard content.
  /// @returns The current content.
  func GetText() string;
  /// Replaces the current plain-text clipboard content.
  /// @param text The content to store.
  func SetText(text string);
}

/// A process-local clipboard suitable for tests and applications without terminal clipboard access.
public class MemoryClipboard : Clipboard {
  private var text string

  shared {
    private let shared MemoryClipboard = MemoryClipboard()
    /// The process-wide default memory clipboard.
    public prop Shared MemoryClipboard -> shared
  }

  /// Creates an empty independent memory clipboard.
  public init() {
    text = ""
  }

  /// Returns the stored text.
  /// @returns The stored content.
  public func GetText() string -> text

  /// Replaces the stored text.
  /// @param value The content to store.
  public func SetText(value string) {
    text = value ?? ""
  }
}

internal class AppClipboard : Clipboard {
  private var terminal Terminal
  private var memory MemoryClipboard

  internal init(terminal Terminal) {
    this.terminal = terminal
    memory = MemoryClipboard()
  }

  public func GetText() string -> memory.GetText()

  public func SetText(text string) {
    memory.SetText(text)
    terminal.CopyToClipboard(memory.GetText())
  }
}
