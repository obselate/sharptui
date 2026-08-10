package SharpTui

import System
import System.Collections.Generic

/// Controls whether a binding runs before or after focused widgets.
public enum BindingPhase { BeforeWidgets; AfterWidgets }

/// One project-wide key binding.
public class Bind {
  private var gesture KeyGesture
  private var phase BindingPhase
  private var hit bool

  /// The gesture that triggers this binding.
  public prop Gesture KeyGesture { get { return gesture } }
  /// Which routing phase this binding is offered during.
  public prop Phase BindingPhase { get { return phase } }
  /// True when the gesture has matched and Consume has not yet reported it.
  public prop IsPending bool { get { return hit } }

  internal init(gesture KeyGesture, phase BindingPhase) {
    this.gesture = gesture
    this.phase = phase
    hit = false
  }

  /// Reports and clears a pending activation.
  /// @returns True when a pending activation was consumed.
  public func Consume() bool {
    if !hit { return false }
    hit = false
    return true
  }

  internal func Offer() {
    hit = true
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

  /// Adds a typed binding and returns it for Consume.
  /// @param gesture The key combination that triggers the binding.
  /// @param phase The routing phase the binding is offered during.
  /// @returns The registered binding.
  public func Add(gesture KeyGesture, phase BindingPhase) Bind {
    let binding = Bind(gesture, phase)
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
        binding.Offer()
        return true
      }
    }
    return false
  }

  /// Reports whether an event matches a typed gesture.
  /// @param ev The event to test.
  /// @param gesture The gesture to match against.
  /// @returns True when the event matches the gesture.
  public func Matches(ev UiEvent, gesture KeyGesture) bool {
    return gesture.Matches(ev)
  }

}
