package SharpTui

/// A shared, consumable activation model for commands exposed by UI surfaces.
public class Command {
  private var id string
  private var label string
  private var gesture KeyGesture
  private var enabled bool
  private var pending bool

  /// Stable command identity.
  public prop Id string { get { return id } }
  /// Text shown by a command surface.
  public prop Label string { get { return label } }
  /// The key gesture that can activate this command through a Keymap.
  public prop Gesture KeyGesture { get { return gesture } }
  /// Whether this command accepts activation.
  public prop IsEnabled bool {
    get { return enabled }
    set { enabled = value }
  }
  /// True when an activation is waiting to be consumed.
  public prop IsPending bool { get { return pending } }

  /// Creates an enabled command with a gesture.
  /// @param id The stable command identity.
  /// @param label The text shown by a command surface.
  /// @param gesture The key gesture that activates the command.
  public init(id string, label string, gesture KeyGesture) {
    this.id = id
    this.label = label
    this.gesture = gesture
    enabled = true
    pending = false
  }

  /// Activates the command when it is enabled.
  /// @returns True when the command accepted the activation.
  public func Activate() bool {
    if !enabled { return false }
    pending = true
    return true
  }

  /// Reports and clears one pending activation.
  /// @returns True when an activation was consumed.
  public func Consume() bool {
    if !pending { return false }
    pending = false
    return true
  }
}
