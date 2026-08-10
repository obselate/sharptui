namespace Facebook.Yoga
{
    public enum Overflow : byte
    {
        Visible = 0,
        Hidden = 1,
        Scroll = 2,
    }

    public static class OverflowExtensions
    {
        public static int OrdinalCount() => 3;

        public static string ToString(Overflow e)
        {
            return e switch
            {
                Overflow.Visible => "visible",
                Overflow.Hidden => "hidden",
                Overflow.Scroll => "scroll",
                _ => e.ToString()
            };
        }
    }
}

