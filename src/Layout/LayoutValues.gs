package SharpTui

import System

internal enum CellLengthUnit { Auto, Cells }

/// A requested size in terminal cells.
public struct CellLength {
  internal var Unit CellLengthUnit
  internal var Count int32

  /// Reports whether this length auto-sizes instead of using a fixed cell count.
  public prop IsAuto bool { get { return Unit == CellLengthUnit.Auto } }
  /// The requested cell count, meaningful only when IsAuto is false.
  public prop CellCount int32 { get { return Count } }

  shared {
    /// A length that auto-sizes rather than using a fixed cell count.
    public prop Auto CellLength {
      get { return CellLength{ Unit: CellLengthUnit.Auto } }
    }

    /// Creates a fixed length of the given non-negative cell count.
    /// @param count The fixed cell count. Must be non-negative.
    /// @returns A cell length with the given fixed count.
    public func Cells(count int32) CellLength {
      if count < 0 { throw ArgumentOutOfRangeException("count") }
      return CellLength{ Unit: CellLengthUnit.Cells, Count: count }
    }
  }
}

/// Padding measured in terminal cells and rows.
public struct CellInsets {
  private var leftCells int32
  private var topRows int32
  private var rightCells int32
  private var bottomRows int32

  /// The left padding in cells. Must be non-negative.
  public prop LeftCells int32 {
    get { return leftCells }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("LeftCells") }
      leftCells = value
    }
  }

  /// The top padding in rows. Must be non-negative.
  public prop TopRows int32 {
    get { return topRows }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("TopRows") }
      topRows = value
    }
  }

  /// The right padding in cells. Must be non-negative.
  public prop RightCells int32 {
    get { return rightCells }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("RightCells") }
      rightCells = value
    }
  }

  /// The bottom padding in rows. Must be non-negative.
  public prop BottomRows int32 {
    get { return bottomRows }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("BottomRows") }
      bottomRows = value
    }
  }

  shared {
    /// Insets with no padding on any side.
    public prop None CellInsets { get { return CellInsets{} } }

    /// Creates equal padding on all four sides.
    /// @param cells The padding to apply to each side. Must be non-negative.
    /// @returns Insets with the given padding on all four sides.
    public func All(cells int32) CellInsets {
      if cells < 0 { throw ArgumentOutOfRangeException("cells") }
      return CellInsets{
        LeftCells: cells,
        TopRows: cells,
        RightCells: cells,
        BottomRows: cells,
      }
    }
  }
}

/// A terminal cell coordinate.
public struct CellPoint {
  private var column int32
  private var row int32

  /// The column coordinate. Must be non-negative.
  public prop Column int32 {
    get { return column }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("Column") }
      column = value
    }
  }

  /// The row coordinate. Must be non-negative.
  public prop Row int32 {
    get { return row }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("Row") }
      row = value
    }
  }
}

/// A terminal cell width and row height.
public struct CellSize {
  private var widthCells int32
  private var heightRows int32

  /// The width in cells. Must be non-negative.
  public prop WidthCells int32 {
    get { return widthCells }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("WidthCells") }
      widthCells = value
    }
  }

  /// The height in rows. Must be non-negative.
  public prop HeightRows int32 {
    get { return heightRows }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("HeightRows") }
      heightRows = value
    }
  }
}

/// A rectangle in terminal cell coordinates.
public struct CellRect {
  private var column int32
  private var row int32
  private var widthCells int32
  private var heightRows int32

  /// The column of the rectangle's top-left corner.
  public prop Column int32 {
    get { return column }
    init { column = value }
  }

  /// The row of the rectangle's top-left corner.
  public prop Row int32 {
    get { return row }
    init { row = value }
  }

  /// The width in cells. Must be non-negative.
  public prop WidthCells int32 {
    get { return widthCells }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("WidthCells") }
      widthCells = value
    }
  }

  /// The height in rows. Must be non-negative.
  public prop HeightRows int32 {
    get { return heightRows }
    init {
      if value < 0 { throw ArgumentOutOfRangeException("HeightRows") }
      heightRows = value
    }
  }

  /// Tests whether a point falls within this rectangle.
  /// @param point The point to test.
  /// @returns True when the point falls within this rectangle.
  public func Contains(point CellPoint) bool {
    return point.Column >= Column && point.Row >= Row
      && point.Column < Column + WidthCells && point.Row < Row + HeightRows
  }

  /// Tests whether a column and row fall within this rectangle.
  /// @param column The zero-based column to test.
  /// @param row The zero-based row to test.
  /// @returns True when the column and row fall within this rectangle.
  public func Contains(column int32, row int32) bool {
    return column >= Column && row >= Row
      && column < Column + WidthCells && row < Row + HeightRows
  }

  /// Returns this rectangle shrunk by the given padding, clamped to zero width or height rather than going negative.
  /// @param insets The padding to shrink by on each side.
  /// @returns A new rectangle inset by the given padding.
  public func Inset(insets CellInsets) CellRect {
    var width = WidthCells - insets.LeftCells - insets.RightCells
    var height = HeightRows - insets.TopRows - insets.BottomRows
    if width < 0 { width = 0 }
    if height < 0 { height = 0 }
    return CellRect{
      Column: Column + insets.LeftCells,
      Row: Row + insets.TopRows,
      WidthCells: width,
      HeightRows: height,
    }
  }
}

internal enum PlacementKind { InFlow, Centered, Point }

/// Controls whether an element participates in flex layout or is positioned over it.
public struct Placement {
  private var kind PlacementKind
  private var point CellPoint

  /// Reports whether this element participates in flex layout alongside its siblings.
  public prop IsInFlow bool { get { return kind == PlacementKind.InFlow } }
  /// Reports whether this element is centered over the layout rather than flowed.
  public prop IsCentered bool { get { return kind == PlacementKind.Centered } }
  /// The fixed position to place at, meaningful only when placed by At.
  public prop Point CellPoint { get { return point } }

  shared {
    /// Participates in flex layout alongside its siblings.
    public prop InFlow Placement { get { return Placement{} } }
    /// Positioned centered over the layout, outside the flex flow.
    public prop Centered Placement { get { return Placement{ kind: PlacementKind.Centered } } }

    /// Positions an element at a fixed point, outside the flex flow.
    /// @param point The fixed position to place at.
    /// @returns A placement fixed at the given point.
    public func At(point CellPoint) Placement {
      return Placement{ kind: PlacementKind.Point, point: point }
    }
  }
}
