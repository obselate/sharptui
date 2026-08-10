using System;
using System.Collections.Generic;

namespace Facebook.Yoga
{
    internal static class LayoutScratch
    {
        private const int MaxPooledLists = 32;
        private const int MaxRetainedCapacity = 4096;

        [ThreadStatic]
        private static Stack<List<Node>>? available_;

        public static List<Node> Rent(int capacity)
        {
            var available = available_;
            if (available is not null && available.Count != 0)
            {
                var items = available.Pop();
                items.EnsureCapacity(capacity);
                return items;
            }

            return new List<Node>(capacity);
        }

        public static void Return(List<Node> items)
        {
            items.Clear();
            if (items.Capacity > MaxRetainedCapacity)
            {
                return;
            }

            var available = available_ ??= new Stack<List<Node>>();
            if (available.Count < MaxPooledLists)
            {
                available.Push(items);
            }
        }
    }
}
