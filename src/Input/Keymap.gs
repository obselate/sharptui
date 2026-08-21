package SharpTui

import System
import System.Collections.Generic

/// Controls whether a binding runs before or after focused widgets.
public enum BindingPhase {
  /// Offers the binding before the application tree handles the event.
  BeforeWidgets;
  /// Offers the binding after the application tree declines the event.
  AfterWidgets;
}

/// One project-wide key binding.
public class Bind {
  private var id string
  private var label string
  private var gesture KeyGesture
  private var phase BindingPhase
  private var enabled bool
  private var handler Action

  /// Stable binding identity.
  public prop Id string { get { return id } }
  /// Text shown for this binding in command surfaces.
  public prop Label string { get { return label } }
  /// The gesture that triggers this binding.
  public prop Gesture KeyGesture { get { return gesture } }
  /// Which routing phase this binding is offered during.
  public prop Phase BindingPhase { get { return phase } }
  /// Whether this binding accepts activation.
  public prop IsEnabled bool {
    get { return enabled }
    set { enabled = value }
  }
  /// Work invoked when the binding matches.
  public prop Handler Action { get { return handler } }

  internal init(id string, label string, gesture KeyGesture, phase BindingPhase, handler Action) {
    this.id = id
    this.label = label
    this.gesture = gesture
    this.phase = phase
    enabled = true
    this.handler = handler
  }

  internal func Offer() bool {
    if !enabled { return false }
    handler()
    return true
  }
}

/// Project-wide bindings layered around focused-widget event handling.
public class Keymap {
  private var bindings List[Bind]

  /// All bindings registered on this keymap, in registration order.
  public prop Bindings List[Bind] { get { return bindings } }

  /// Creates an empty keymap.
  public init() {
    bindings = List[Bind]()
  }

  /// Adds an unnamed binding.
  /// @param gesture The key combination that triggers the binding.
  /// @param phase The routing phase the binding is offered during.
  /// @param handler Work invoked when the binding matches.
  /// @returns The registered binding.
  public func Add(gesture KeyGesture, phase BindingPhase, handler Action) Bind {
    return Add("", "", gesture, phase, handler)
  }

  /// Adds a named binding for use by command surfaces.
  /// @param id The stable binding identity.
  /// @param label The text shown by command surfaces.
  /// @param gesture The key combination that triggers this binding.
  /// @param phase The routing phase the binding is offered during.
  /// @param handler Work invoked when the binding matches.
  /// @returns The registered binding.
  public func Add(id string, label string, gesture KeyGesture, phase BindingPhase,
      handler Action) Bind {
    if handler == nil { throw ArgumentNullException("handler") }
    let binding = Bind(id, label, gesture, phase, handler)
    bindings.Add(binding)
    return binding
  }

  /// Offers an event to one routing phase.
  /// @param ev The event to offer.
  /// @param phase The routing phase to test bindings against.
  /// @returns True when a matching binding consumed the event.
  public func Offer(ev UiEvent, phase BindingPhase) bool {
    for binding in bindings {
      if binding.Phase == phase && binding.Gesture.Matches(ev) {
        if binding.Offer() { return true }
      }
    }
    return false
  }

}
