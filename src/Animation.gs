package SharpTui

import System
import System.Collections.Generic
import System.Threading

/// Selects the interpolation curve used by a tween.
public enum Easing {
  /// Leaves progress unchanged.
  Linear;
  /// Starts with a sinusoidal acceleration.
  SineIn;
  /// Ends with a sinusoidal deceleration.
  SineOut;
  /// Uses sinusoidal acceleration and deceleration.
  SineInOut;
  /// Starts with cubic acceleration.
  CubicIn;
  /// Ends with cubic deceleration.
  CubicOut;
  /// Uses cubic acceleration and deceleration.
  CubicInOut;
  /// Overshoots before accelerating from the starting value.
  BackIn;
  /// Overshoots after decelerating into the ending value.
  BackOut;
  /// Overshoots at both ends of the curve.
  BackInOut;
  /// Bounces into the starting value.
  BounceIn;
  /// Bounces into the ending value.
  BounceOut;
  /// Bounces at both ends of the curve.
  BounceInOut;
  /// Springs into the starting value.
  ElasticIn;
  /// Springs into the ending value.
  ElasticOut;
  /// Springs at both ends of the curve.
  ElasticInOut
}

/// Reports the lifetime state of an animation handle.
public enum AnimationState {
  /// The animation has not yet completed or been cancelled.
  Running;
  /// The terminal animation state has been applied.
  Completed;
  /// The animation stopped without another sample.
  Cancelled
}

/// Describes a composable time-based animation.
public class Animation {
  private var node AnimationNode

  internal init(value AnimationNode) {
    node = value
  }

  internal prop Node AnimationNode { get { return node } }

  shared {
    /// Creates a tween that invokes update with eased progress over its duration.
    /// @param duration The time over which the tween runs.
    /// @param update The UI-thread callback receiving the current progress.
    /// @param easing The interpolation curve.
    /// @remarks Back and Elastic easing may produce values outside the normalized [0,1] range.
    /// @returns A tween animation.
    public func Tween(duration TimeSpan, update Action[float64], easing Easing) Animation {
      if duration.TotalMilliseconds < 0.0 { throw ArgumentOutOfRangeException("duration") }
      if update == nil { throw ArgumentNullException("update") }
      return Animation(TweenNode(duration.TotalMilliseconds, update, easing))
    }

    /// Creates an animation that occupies time without changing state.
    /// @param duration The time over which the wait runs.
    /// @returns A wait animation.
    public func Wait(duration TimeSpan) Animation {
      if duration.TotalMilliseconds < 0.0 { throw ArgumentOutOfRangeException("duration") }
      return Animation(WaitNode(duration.TotalMilliseconds))
    }

    /// Runs animations one after another.
    /// @param animations The child animations in execution order.
    /// @returns A sequence animation.
    public func Sequence(animations ...Animation) Animation {
      return Animation(SequenceNode(animationNodes(animations)))
    }

    /// Runs animations at the same time.
    /// @param animations The child animations to run in parallel.
    /// @returns A parallel animation.
    public func Parallel(animations ...Animation) Animation {
      return Animation(ParallelNode(animationNodes(animations)))
    }

    /// Runs an animation a fixed number of times.
    /// @param animation The child animation to repeat.
    /// @param count The total number of executions, which must be positive.
    /// @returns A repeated animation.
    public func Repeat(animation Animation, count int32) Animation {
      if animation == nil { throw ArgumentNullException("animation") }
      if count <= 0 { throw ArgumentOutOfRangeException("count") }
      if animation.Node.Duration <= 0.0 {
        throw ArgumentException("Repeat requires a positive-duration animation", "animation")
      }
      return Animation(RepeatNode(animation.Node, count))
    }

    /// Runs an animation repeatedly until its handle is cancelled or finished.
    /// @param animation The child animation to repeat.
    /// @returns An indefinitely repeating animation.
    public func Repeat(animation Animation) Animation {
      if animation == nil { throw ArgumentNullException("animation") }
      if animation.Node.Duration <= 0.0 {
        throw ArgumentException("Repeat requires a positive-duration animation", "animation")
      }
      return Animation(RepeatNode(animation.Node, -1))
    }

    /// Interpolates two scalar values at a normalized progress.
    /// @param from The starting value.
    /// @param to The ending value.
    /// @param progress The normalized interpolation progress, clamped to [0,1].
    /// @returns The interpolated scalar.
    public func Lerp(from float64, to float64, progress float64) float64 {
      let p = clampProgress(progress)
      return from + (to - from) * p

    }
    /// Interpolates two integer values at a normalized progress.
    /// @param from The starting value.
    /// @param to The ending value.
    /// @param progress The normalized interpolation progress, clamped to [0,1].
    /// @returns The interpolated integer.
    public func Lerp(from int32, to int32, progress float64) int32 {
      let p = clampProgress(progress)
      return int32(float64(from) + (float64(to) - float64(from)) * p)

    }
    /// Interpolates two terminal cell points at a normalized progress.
    /// @param from The starting point.
    /// @param to The ending point.
    /// @param progress The normalized interpolation progress, clamped to [0,1].
    /// @returns The interpolated cell point.
    public func Lerp(from CellPoint, to CellPoint, progress float64) CellPoint {
      return CellPoint{
        Column: Lerp(from.Column, to.Column, progress),
        Row: Lerp(from.Row, to.Row, progress),
      }

    }
    /// Interpolates two RGB colors at a normalized progress.
    /// @param from The starting RGB color.
    /// @param to The ending RGB color.
    /// @param progress The normalized interpolation progress, clamped to [0,1].
    /// @returns The interpolated RGB color.
    public func Lerp(from Color, to Color, progress float64) Color {
      if from.IsInherited || from.IsTerminalDefault || to.IsInherited || to.IsTerminalDefault {
        throw ArgumentException("Lerp requires RGB colors")
      }
      let p = clampProgress(progress)
      let red = lerpChannel((from.Packed >> 16) & 255, (to.Packed >> 16) & 255, p)
      let green = lerpChannel((from.Packed >> 8) & 255, (to.Packed >> 8) & 255, p)
      let blue = lerpChannel(from.Packed & 255, (to.Packed & 255), p)
      return Color.Rgb(red, green, blue)
    }
  }
}

/// Controls animations owned by an application.
public class AnimationController {
  private var wake AutoResetEvent
  private var gate Object
  private var records List[AnimationRecord]
  private var motionScale float64
  private let cadenceMilliseconds int64 = 16
  private var lastNow int64
  private var lastSample int64
  private var needsSample int32

  internal init(wakeup AutoResetEvent) {
    wake = wakeup
    gate = Object()
    records = List[AnimationRecord]()
    motionScale = 1.0
    lastNow = 0
    lastSample = -1
    needsSample = 0
  }

  internal func Observe(nowMilliseconds int64) {
    lock gate {
      if nowMilliseconds > lastNow { lastNow = nowMilliseconds }
    }
  }

  /// Scales animation time. Zero completes active animations on the next app turn.
  public prop MotionScale float64 {
    get { lock gate { return motionScale } }
    set {
      if value < 0.0 || Double.IsNaN(value) || Double.IsInfinity(value) {
        throw ArgumentOutOfRangeException("MotionScale")
      }
      lock gate {
        accrueRecords(lastNow)
        motionScale = value
        Interlocked.Exchange(ref needsSample, 1)
      }
      wake.Set()
    }
  }

  /// Starts an animation and returns its lifetime handle.
  /// @param animation The reusable animation recipe to run.
  /// @returns A handle that can cancel or finish the animation.
  public func Play(animation Animation) AnimationHandle {
    if animation == nil { throw ArgumentNullException("animation") }
    let handle = AnimationHandle(this)
    let record = AnimationRecord{
      Runtime: animation.Node.CreateRuntime(),
      Handle: handle,
      ScaledElapsed: 0.0,
      LastObserved: 0,
    }
    lock gate {
      record.LastObserved = lastNow
      records.Add(record)
      Interlocked.Exchange(ref needsSample, 1)
    }
    wake.Set()
    return handle
  }

  internal func Cancel(handle AnimationHandle) {
    if handle.Request(2) {
      Interlocked.Exchange(ref needsSample, 1)
      wake.Set()
    }
  }

  internal func Finish(handle AnimationHandle) {
    if handle.Request(1) {
      Interlocked.Exchange(ref needsSample, 1)
      wake.Set()
    }
  }

  internal func Sample(nowMilliseconds int64) bool {
    lock gate {
      if nowMilliseconds > lastNow { lastNow = nowMilliseconds }
      accrueRecords(lastNow)
      if records.Count == 0 {
        Interlocked.Exchange(ref needsSample, 0)
        return false
      }
      let interval = intervalMilliseconds()
      if Interlocked.CompareExchange(ref needsSample, 0, 0) == 0
          && lastSample >= 0 && lastNow < lastSample + interval {
        return false
      }
      Interlocked.Exchange(ref needsSample, 0)
      lastSample = lastNow
      var changed = false
      var i = records.Count - 1
      while i >= 0 {
        let record = records[i]
        let request = record.Handle.Requested()
        if request == 2 {
          record.Handle.MarkCancelled()
          records.RemoveAt(i)
          changed = true
          i = i - 1
          continue
        }
        let duration = record.Runtime.Duration
        if request == 1 || motionScale == 0.0 {
          record.Runtime.Finish()
          record.Handle.MarkCompleted()
          records.RemoveAt(i)
          changed = true
          i = i - 1
          continue
        }
        if duration >= 0.0 && record.ScaledElapsed >= duration {
          if record.Runtime.Sample(duration) { changed = true }
          record.Handle.MarkCompleted()
          records.RemoveAt(i)
          changed = true
        } else if record.Runtime.Sample(record.ScaledElapsed) {
          changed = true
        }
        i = i - 1
      }
      return changed
    }
  }

  internal func NextDeadline(nowMilliseconds int64) int64 {
    lock gate {
      if records.Count == 0 { return -1 }
      if Interlocked.CompareExchange(ref needsSample, 0, 0) != 0 || motionScale == 0.0 {
        return nowMilliseconds
      }
      if lastSample < 0 { return nowMilliseconds }
      let interval = intervalMilliseconds()
      let next = lastSample + interval
      return next < nowMilliseconds ? nowMilliseconds : next
    }
  }

  internal func HasActive() bool {
    lock gate { return records.Count > 0 }
  }

  private func accrueRecords(nowMilliseconds int64) {
    for record in records {
      if nowMilliseconds <= record.LastObserved { continue }
      let delta = nowMilliseconds - record.LastObserved
      if motionScale > 0.0 {
        let added = float64(delta) * motionScale
        if Double.IsInfinity(added) || record.ScaledElapsed > Double.MaxValue - added {
          record.ScaledElapsed = Double.MaxValue
        } else {
          record.ScaledElapsed = record.ScaledElapsed + added
        }
      }
      record.LastObserved = nowMilliseconds
    }
  }

  private func intervalMilliseconds() int64 {
    return cadenceMilliseconds
  }
}

/// Controls one running animation.
public class AnimationHandle {
  private var owner AnimationController
  private var state int32
  private var requested int32

  internal init(controller AnimationController) {
    owner = controller
    state = 0
    requested = 0
  }

  /// Reports whether the animation is running, completed, or cancelled.
  public prop State AnimationState {
    get {
      let value = Interlocked.CompareExchange(ref state, 0, 0)
      if value == 1 { return AnimationState.Completed }
      if value == 2 { return AnimationState.Cancelled }
      return AnimationState.Running
    }
  }

  /// Requests cancellation without applying another sample.
  public func Cancel() {
    owner.Cancel(this)
  }

  /// Requests application of the exact terminal state and completion.
  public func Finish() {
    owner.Finish(this)
  }

  internal func Request(value int32) bool {
    if Interlocked.CompareExchange(ref state, 0, 0) != 0 { return false }
    return Interlocked.CompareExchange(ref requested, value, 0) == 0
  }

  internal func Requested() int32 {
    return Interlocked.CompareExchange(ref requested, 0, 0)
  }

  internal func MarkCompleted() {
    Interlocked.CompareExchange(ref state, 1, 0)
  }

  internal func MarkCancelled() {
    Interlocked.CompareExchange(ref state, 2, 0)
  }
}

internal class AnimationRecord {
  public var Runtime AnimationRuntime
  public var Handle AnimationHandle
  public var ScaledElapsed float64
  public var LastObserved int64
}

internal open class AnimationRuntime {
  public let Duration float64
  private var completed bool

  internal init(duration float64) {
    Duration = duration
    completed = false
  }

  internal func IsCompleted() bool {
    return completed
  }

  internal func MarkCompleted() {
    completed = true
  }

  internal func Reset() {
    completed = false
    ResetState()
  }

  open func ResetState() {}

  open func Sample(elapsed float64) bool;

  open func Finish() bool {
    if completed { return false }
    let changed = Sample(Duration)
    if !completed { completed = true }
    return changed
  }
}

internal open class AnimationNode {
  public let Duration float64

  internal init(duration float64) {
    Duration = duration
  }

  open func CreateRuntime() AnimationRuntime;
}

internal class TweenNode : AnimationNode {
  private var update Action[float64]
  private var easing Easing

  internal init(duration float64, callback Action[float64], curve Easing) : base(duration) {
    update = callback
    easing = curve
  }

  override func CreateRuntime() AnimationRuntime {
    return TweenRuntime(Duration, update, easing)
  }
}

internal class WaitNode : AnimationNode {
  internal init(duration float64) : base(duration) {}

  override func CreateRuntime() AnimationRuntime {
    return WaitRuntime(Duration)
  }
}

internal class SequenceNode : AnimationNode {
  private var children List[AnimationNode]

  internal init(values List[AnimationNode]) : base(totalDuration(values)) {
    children = values
  }

  override func CreateRuntime() AnimationRuntime {
    let runtimes = List[AnimationRuntime]()
    for child in children { runtimes.Add(child.CreateRuntime()) }
    return SequenceRuntime(Duration, runtimes)
  }
}

internal class ParallelNode : AnimationNode {
  private var children List[AnimationNode]

  internal init(values List[AnimationNode]) : base(maxDuration(values)) {
    children = values
  }

  override func CreateRuntime() AnimationRuntime {
    let runtimes = List[AnimationRuntime]()
    for child in children { runtimes.Add(child.CreateRuntime()) }
    return ParallelRuntime(Duration, runtimes)
  }
}

internal class RepeatNode : AnimationNode {
  private var child AnimationNode

  internal init(value AnimationNode, count int32) : base(repeatDuration(value.Duration, count)) {
    child = value
  }

  override func CreateRuntime() AnimationRuntime {
    return RepeatRuntime(Duration, child.CreateRuntime())
  }
}

internal class TweenRuntime : AnimationRuntime {
  private var update Action[float64]
  private var easing Easing
  private var hasProgress bool
  private var lastProgress float64

  internal init(duration float64, callback Action[float64], curve Easing) : base(duration) {
    update = callback
    easing = curve
    hasProgress = false
    lastProgress = 0.0
  }

  override func Sample(elapsed float64) bool {
    if IsCompleted() { return false }
    var progress = Duration <= 0.0 ? 1.0 : elapsed / Duration
    if progress < 0.0 { progress = 0.0 }
    if progress > 1.0 { progress = 1.0 }
    if hasProgress && progress == lastProgress { return false }
    hasProgress = true
    lastProgress = progress
    update(applyEasing(progress, easing))
    if Duration >= 0.0 && progress >= 1.0 { MarkCompleted() }
    return true
  }

  override func ResetState() {
    hasProgress = false
    lastProgress = 0.0
  }
}

internal class WaitRuntime : AnimationRuntime {
  internal init(duration float64) : base(duration) {}

  override func Sample(elapsed float64) bool {
    if IsCompleted() { return false }
    if Duration >= 0.0 && elapsed >= Duration { MarkCompleted() }
    return false
  }
}

internal class SequenceRuntime : AnimationRuntime {
  private var children List[AnimationRuntime]

  internal init(duration float64, values List[AnimationRuntime]) : base(duration) {
    children = values
  }

  override func Sample(elapsed float64) bool {
    if IsCompleted() { return false }
    var remaining = elapsed
    if remaining < 0.0 { remaining = 0.0 }
    var changed = false
    for child in children {
      if child.Duration < 0.0 {
        if child.Sample(remaining) { changed = true }
        break
      }
      if remaining >= child.Duration {
        if child.Finish() { changed = true }
        remaining = remaining - child.Duration
      } else {
        if child.Sample(remaining) { changed = true }
        break
      }
    }
    if Duration >= 0.0 && elapsed >= Duration { MarkCompleted() }
    return changed
  }

  override func Finish() bool {
    if IsCompleted() { return false }
    var changed = false
    for child in children {
      if child.Finish() { changed = true }
    }
    MarkCompleted()
    return changed
  }

  override func ResetState() {
    for child in children { child.Reset() }
  }
}

internal class ParallelRuntime : AnimationRuntime {
  private var children List[AnimationRuntime]

  internal init(duration float64, values List[AnimationRuntime]) : base(duration) {
    children = values
  }

  override func Sample(elapsed float64) bool {
    if IsCompleted() { return false }
    var local = elapsed
    if local < 0.0 { local = 0.0 }
    var changed = false
    for child in children {
      if child.Duration >= 0.0 && local >= child.Duration {
        if child.Finish() { changed = true }
      } else if child.Sample(local) {
        changed = true
      }
    }
    if Duration >= 0.0 && local >= Duration { MarkCompleted() }
    return changed
  }

  override func Finish() bool {
    if IsCompleted() { return false }
    var changed = false
    for child in children {
      if child.Finish() { changed = true }
    }
    MarkCompleted()
    return changed
  }

  override func ResetState() {
    for child in children { child.Reset() }
  }
}

internal class RepeatRuntime : AnimationRuntime {
  private var child AnimationRuntime
  private var currentCycle float64

  internal init(duration float64, value AnimationRuntime) : base(duration) {
    child = value
    currentCycle = -1.0
  }

  override func Sample(elapsed float64) bool {
    if IsCompleted() { return false }
    var remaining = elapsed
    if remaining < 0.0 { remaining = 0.0 }
    if Duration >= 0.0 && remaining >= Duration {
      let changed = child.Finish()
      MarkCompleted()
      return changed
    }
    let cycle = Math.Floor(remaining / child.Duration)
    var local = remaining - cycle * child.Duration
    if local < 0.0 { local = 0.0 }
    if cycle != currentCycle {
      child.Reset()
      currentCycle = cycle
    }
    return child.Sample(local)
  }

  override func Finish() bool {
    if IsCompleted() { return false }
    if Duration >= 0.0 { return Sample(Duration) }
    let changed = child.Finish()
    MarkCompleted()
    return changed
  }

  override func ResetState() {
    child.Reset()
    currentCycle = -1.0
  }
}


private func animationNodes(values []Animation) List[AnimationNode] {
  let result = List[AnimationNode]()
  for value in values {
    if value == nil { throw ArgumentException("animations cannot contain null values", "animations") }
    result.Add(value.Node)
  }
  return result
}

private func totalDuration(values List[AnimationNode]) float64 {
  var total = 0.0
  for value in values {
    if value.Duration < 0.0 { return -1.0 }
    total = total + value.Duration
  }
  return total
}

private func maxDuration(values List[AnimationNode]) float64 {
  var maximum = 0.0
  for value in values {
    if value.Duration < 0.0 { return -1.0 }
    if value.Duration > maximum { maximum = value.Duration }
  }
  return maximum
}

private func repeatDuration(duration float64, count int32) float64 {
  if count < 0 || duration < 0.0 { return -1.0 }
  return duration * float64(count)
}

private func applyEasing(progress float64, easing Easing) float64 {
  if easing == Easing.SineIn { return 1.0 - Math.Cos(progress * Math.PI / 2.0) }
  if easing == Easing.SineOut { return Math.Sin(progress * Math.PI / 2.0) }
  if easing == Easing.SineInOut { return -(Math.Cos(Math.PI * progress) - 1.0) / 2.0 }
  if easing == Easing.CubicIn { return progress * progress * progress }
  if easing == Easing.CubicOut {
    let inverse = 1.0 - progress
    return 1.0 - inverse * inverse * inverse
  }
  if easing == Easing.CubicInOut {
    if progress < 0.5 { return 4.0 * progress * progress * progress }
    let inverse = -2.0 * progress + 2.0
    return 1.0 - inverse * inverse * inverse / 2.0
  }
  if easing == Easing.BackIn {
    let c1 = 1.70158
    let c3 = c1 + 1.0
    return c3 * progress * progress * progress - c1 * progress * progress
  }
  if easing == Easing.BackOut {
    let c1 = 1.70158
    let c3 = c1 + 1.0
    let shifted = progress - 1.0
    return 1.0 + c3 * shifted * shifted * shifted + c1 * shifted * shifted
  }
  if easing == Easing.BackInOut {
    let c1 = 1.70158
    let c2 = c1 * 1.525
    if progress < 0.5 {
      let scaled = 2.0 * progress
      return scaled * scaled * ((c2 + 1.0) * scaled - c2) / 2.0
    }
    let scaled = 2.0 * progress - 2.0
    return (scaled * scaled * ((c2 + 1.0) * scaled + c2) + 2.0) / 2.0
  }
  if easing == Easing.BounceIn { return 1.0 - bounceOut(1.0 - progress) }
  if easing == Easing.BounceOut { return bounceOut(progress) }
  if easing == Easing.BounceInOut {
    if progress < 0.5 { return (1.0 - bounceOut(1.0 - 2.0 * progress)) / 2.0 }
    return (1.0 + bounceOut(2.0 * progress - 1.0)) / 2.0
  }
  if easing == Easing.ElasticIn {
    if progress == 0.0 || progress == 1.0 { return progress }
    return -Math.Pow(2.0, 10.0 * progress - 10.0) * Math.Sin((progress * 10.0 - 10.75) * (2.0 * Math.PI / 3.0))
  }
  if easing == Easing.ElasticOut {
    if progress == 0.0 || progress == 1.0 { return progress }
    return Math.Pow(2.0, -10.0 * progress) * Math.Sin((progress * 10.0 - 0.75) * (2.0 * Math.PI / 3.0)) + 1.0
  }
  if easing == Easing.ElasticInOut {
    if progress == 0.0 || progress == 1.0 { return progress }
    let angle = (20.0 * progress - 11.125) * (2.0 * Math.PI / 4.5)
    if progress < 0.5 {
      return -(Math.Pow(2.0, 20.0 * progress - 10.0) * Math.Sin(angle)) / 2.0
    }
    return Math.Pow(2.0, -20.0 * progress + 10.0) * Math.Sin(angle) / 2.0 + 1.0
  }
  return progress
}

private func bounceOut(progress float64) float64 {
  let n1 = 7.5625
  let d1 = 2.75
  if progress < 1.0 / d1 { return n1 * progress * progress }
  if progress < 2.0 / d1 {
    let shifted = progress - 1.5 / d1
    return n1 * shifted * shifted + 0.75
  }
  if progress < 2.5 / d1 {
    let shifted = progress - 2.25 / d1
    return n1 * shifted * shifted + 0.9375
  }
  let shifted = progress - 2.625 / d1
  return n1 * shifted * shifted + 0.984375
}

private func clampProgress(progress float64) float64 {
  if progress < 0.0 { return 0.0 }
  if progress > 1.0 { return 1.0 }
  return progress
}

private func lerpChannel(from int32, to int32, progress float64) int32 {
  return int32(float64(from) + (float64(to) - float64(from)) * progress)
}
