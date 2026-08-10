using System;

namespace Facebook.Yoga
{
    public enum GridTrackType : byte
    {
        Auto = 0,
        Points = 1,
        Percent = 2,
        Fr = 3,
        Minmax = 4,
    }

    public static partial class YogaEnums
    {
        internal static string ToString(GridTrackType e) => e switch
        {
            GridTrackType.Auto => "Auto",
            GridTrackType.Points => "Points",
            GridTrackType.Percent => "Percent",
            GridTrackType.Fr => "Fr",
            GridTrackType.Minmax => "Minmax",
            _ => throw new ArgumentOutOfRangeException(nameof(e), e, "Invalid GridTrackType value")
        };
    }
}

