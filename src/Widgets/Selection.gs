package SharpTui

/// Stateless viewport math for indexed rows and other uniformly sized logical units.
public class Viewport {
  /// Creates a viewport utility instance. All operations are shared, so callers normally use the type directly.
  public init() {}

  shared {
    /// Clamps index into [0, count - 1], or 0 when count is zero.
    /// @param count The number of indexed units.
    /// @param index The requested index.
    /// @returns A valid index, or zero when count is zero.
    public func ClampIndex(count int32, index int32) int32 {
      if count < 0 { throw System.ArgumentOutOfRangeException("count") }
      if count == 0 { return 0 }
      if index < 0 { return 0 }
      if index >= count { return count - 1 }
      return index
    }

    /// Clamps an offset so a viewport never starts past the end of its extent.
    /// @param extent The number of logical units in the content.
    /// @param offset The requested first visible unit.
    /// @param size The number of visible units.
    /// @returns The clamped first visible unit.
    public func ClampOffset(extent int32, offset int32, size int32) int32 {
      validate(extent, size)
      var max = extent - size
      if max < 0 { max = 0 }
      if offset > max { return max }
      if offset < 0 { return 0 }
      return offset
    }

    /// Moves an offset by the minimum amount needed to show an indexed unit.
    /// @param extent The number of logical units in the content.
    /// @param index The unit that must become visible.
    /// @param offset The current first visible unit.
    /// @param size The number of visible units.
    /// @returns The new first visible unit.
    public func BringIntoView(extent int32, index int32, offset int32, size int32) int32 {
      validate(extent, size)
      if extent == 0 || size == 0 { return 0 }
      let target = ClampIndex(extent, index)
      return BringRangeIntoView(extent, target, 1, offset, size)
    }

    /// Moves an offset by the minimum amount needed to show a logical range.
    /// @param extent The number of logical units in the content.
    /// @param start The first unit in the range.
    /// @param length The number of units in the range.
    /// @param offset The current first visible unit.
    /// @param size The number of visible units.
    /// @returns The new first visible unit.
    public func BringRangeIntoView(extent int32, start int32, length int32, offset int32, size int32) int32 {
      validate(extent, size)
      if start < 0 { throw System.ArgumentOutOfRangeException("start") }
      if length < 0 { throw System.ArgumentOutOfRangeException("length") }
      if extent == 0 || size == 0 || length == 0 { return 0 }
      if start >= extent || length > extent - start { throw System.ArgumentOutOfRangeException("length") }
      var next = ClampOffset(extent, offset, size)
      if length >= size { return ClampOffset(extent, start, size) }
      if start < next { next = start }
      if start + length > next + size { next = start + length - size }
      return ClampOffset(extent, next, size)
    }

    private func validate(extent int32, size int32) {
      if extent < 0 { throw System.ArgumentOutOfRangeException("extent") }
      if size < 0 { throw System.ArgumentOutOfRangeException("size") }
    }
  }
}

internal class Selection {
  shared {
    internal let WheelStep int32 = 3

    public func ClampIndex(count int32, index int32) int32 -> Viewport.ClampIndex(count, index)

    public func ClampScroll(count int32, scroll int32, height int32) int32 {
      return Viewport.ClampOffset(count, scroll, height)
    }

    public func ScrollIntoView(count int32, index int32, scroll int32, height int32) int32 {
      return Viewport.BringIntoView(count, index, scroll, height)
    }

    public func DirectionFor(want int32, current int32) int32 -> want < current ? -1 : 1
  }
}
