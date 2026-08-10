using System;

namespace Facebook.Yoga
{
    public enum ExperimentalFeature : byte
    {
        WebFlexBasis = 0,
        FixFlexBasisFitContent = 1,
    }

    public static partial class YogaEnums
    {
        public static string ToString(ExperimentalFeature e)
        {
            return e switch
            {
                ExperimentalFeature.WebFlexBasis => nameof(ExperimentalFeature.WebFlexBasis),
                ExperimentalFeature.FixFlexBasisFitContent => nameof(ExperimentalFeature.FixFlexBasisFitContent),
                _ => e.ToString()
            };
        }
    }
}

