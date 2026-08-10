using System;

namespace Facebook.Yoga
{
    public enum FlexDirection : byte
    {
        Column = 0,
        ColumnReverse = 1,
        Row = 2,
        RowReverse = 3,
    }

    public static class FlexDirectionExtensions
    {
        public static int OrdinalCount(this FlexDirection direction)
        {
            return 4;
        }

        public static string ToString(this FlexDirection direction)
        {
            return direction switch
            {
                FlexDirection.Column => "column",
                FlexDirection.ColumnReverse => "column-reverse",
                FlexDirection.Row => "row",
                FlexDirection.RowReverse => "row-reverse",
                _ => throw new ArgumentOutOfRangeException(nameof(direction), direction, "Invalid FlexDirection value")
            };
        }
    }
}

