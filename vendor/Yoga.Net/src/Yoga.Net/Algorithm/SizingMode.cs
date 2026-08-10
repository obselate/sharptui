using System;

namespace Facebook.Yoga
{
    public enum SizingMode
    {
        StretchFit,
        MaxContent,
        FitContent,
    }

    public static class SizingModeExtensions
    {
        public static MeasureMode ToMeasureMode(this SizingMode mode)
        {
            return mode switch
            {
                SizingMode.StretchFit => MeasureMode.Exactly,
                SizingMode.MaxContent => MeasureMode.Undefined,
                SizingMode.FitContent => MeasureMode.AtMost,
                _ => throw new InvalidOperationException("Invalid SizingMode"),
            };
        }

        public static SizingMode ToSizingMode(this MeasureMode mode)
        {
            return mode switch
            {
                MeasureMode.Exactly => SizingMode.StretchFit,
                MeasureMode.Undefined => SizingMode.MaxContent,
                MeasureMode.AtMost => SizingMode.FitContent,
                _ => throw new InvalidOperationException("Invalid MeasureMode"),
            };
        }
    }
}

