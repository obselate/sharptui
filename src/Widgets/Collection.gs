package SharpTui

import System
import System.Collections.Generic

/// A snapshot of a selection transition, produced by user navigation and retrieved with ConsumeSelectionChange.
public struct SelectionChange {
  private var previousIndex int32
  private var selectedIndex int32

  /// Index that was selected before this change.
  public prop PreviousIndex int32 {
    get { return previousIndex }
    init { previousIndex = value }
  }

  /// Index selected after this change.
  public prop SelectedIndex int32 {
    get { return selectedIndex }
    init { selectedIndex = value }
  }

  /// Creates a change record from the previous index to the newly selected index.
  /// @param previousIndex Index that was selected before this change.
  /// @param selectedIndex Index selected after this change.
  public init(previousIndex int32, selectedIndex int32) {
    this.previousIndex = previousIndex
    this.selectedIndex = selectedIndex
  }
}

/// A single row in a ListView, carrying its text, optional styled runs, and selection eligibility.
public class ListItem {
  /// Caller-supplied Id values must be unique for selection restoration across Items replacement.
  public prop Id string { get; set; }
  /// Plain text drawn for this item when Runs is empty.
  public prop Text string { get; set; }
  /// Styled text segments drawn instead of Text; when non-empty, Runs takes precedence over Text.
  public prop Runs List[TextRun] { get; set; }
  /// Style applied to this item's row, merged over the list's inherited style.
  public prop Style Style { get; set; }
  /// When false, this item is skipped by keyboard and mouse selection but still rendered.
  public prop IsSelectable bool { get; set; }

  /// Creates an item with a freshly generated Id, empty text, and selectable by default.
  public init() {
    Id = Guid.NewGuid().ToString("N")
    Text = ""
    Runs = List[TextRun]()
    Style = Style()
    IsSelectable = true
  }
}
