package SharpTui

/// Semantic style roles shared by controls and application surfaces.
public enum ThemeRole {
  /// The normal content style.
  Body;
  /// The emphasized application style.
  Accent;
  /// The secondary content style.
  Muted;
  /// The successful outcome style.
  Success;
  /// The cautionary outcome style.
  Warning;
  /// The failed outcome style.
  Error;
}

/// Visual state overlays applied while resolving a theme role.
@Flags
public enum ControlState {
  /// No visual state overlay.
  None = 0;
  /// The control currently has focus.
  Focused = 1;
  /// The control is selected.
  Selected = 2;
  /// The control is disabled.
  Disabled = 4;
}

/// Compact semantic styles for application surfaces.
public class Theme {
  private var body Style
  private var accent Style
  private var muted Style
  private var success Style
  private var warning Style
  private var error Style
  private var focused Style
  private var selected Style
  private var disabled Style

  /// The base body style.
  public prop Body Style {
    get { return body }
    set { body = value }
  }

  /// The base accent style.
  public prop Accent Style {
    get { return accent }
    set { accent = value }
  }

  /// The base muted style.
  public prop Muted Style {
    get { return muted }
    set { muted = value }
  }

  /// The base success style.
  public prop Success Style {
    get { return success }
    set { success = value }
  }

  /// The base warning style.
  public prop Warning Style {
    get { return warning }
    set { warning = value }
  }

  /// The base error style.
  public prop Error Style {
    get { return error }
    set { error = value }
  }

  /// The style overlay for focused controls.
  public prop Focused Style {
    get { return focused }
    set { focused = value }
  }

  /// The style overlay for selected controls.
  public prop Selected Style {
    get { return selected }
    set { selected = value }
  }

  /// The style overlay for disabled controls.
  public prop Disabled Style {
    get { return disabled }
    set { disabled = value }
  }

  /// Creates a theme whose roles and overlays inherit their surrounding style.
  public init() {
    body = Style()
    accent = Style()
    muted = Style()
    success = Style()
    warning = Style()
    error = Style()
    focused = Style()
    selected = Style()
    disabled = Style()
  }

  /// Resolves a role and applies focused, selected, then disabled overlays.
  /// @param role The semantic base role to resolve.
  /// @param state The control states to apply.
  /// @returns The merged style for the role and states.
  public func Resolve(role ThemeRole, state ControlState) Style {
    var result = baseStyle(role)
    if (int32(state) & int32(ControlState.Focused)) != 0 {
      result = focused.MergedOver(result)
    }
    if (int32(state) & int32(ControlState.Selected)) != 0 {
      result = selected.MergedOver(result)
    }
    if (int32(state) & int32(ControlState.Disabled)) != 0 {
      result = disabled.MergedOver(result)
    }
    return result
  }

  private func baseStyle(role ThemeRole) Style {
    if role == ThemeRole.Accent { return accent }
    if role == ThemeRole.Muted { return muted }
    if role == ThemeRole.Success { return success }
    if role == ThemeRole.Warning { return warning }
    if role == ThemeRole.Error { return error }
    return body
  }
}
