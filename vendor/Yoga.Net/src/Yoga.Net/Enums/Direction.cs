using System;

namespace Facebook.Yoga
{
    public enum Direction : byte
    {
        Inherit = 0,
        LTR = 1,
        RTL = 2,
    }

    public static partial class YogaEnums
    {
        public static int OrdinalCount(Direction _) => 3;

        public static string ToString(Direction e)
        {
            return e switch
            {
                Direction.Inherit => "inherit",
                Direction.LTR => "ltr",
                Direction.RTL => "rtl",
                _ => throw new ArgumentOutOfRangeException(nameof(e), e, "Invalid Direction value"),
            };
        }
    }
}

