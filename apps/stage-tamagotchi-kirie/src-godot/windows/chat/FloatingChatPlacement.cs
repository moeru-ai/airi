using Godot;

/// <summary>The edge of the main window that an attached floating chat touches.</summary>
internal enum AttachedChatSide
{
    Left,
    Right,
}

/// <summary>
/// The edge of the main window that an attached floating chat lines up with. `Bottom` lets the chat
/// grow up beside the character. `Top` is for a main window near the top of the work area.
/// </summary>
internal enum AttachedChatAnchor
{
    Bottom,
    Top,
}

/// <summary>Where an attached floating chat sits against the main window.</summary>
internal readonly record struct AttachedChatLayout(AttachedChatSide Side, AttachedChatAnchor Anchor)
{
    public static AttachedChatLayout Preferred { get; } =
        new(AttachedChatSide.Left, AttachedChatAnchor.Bottom);
}

/// <summary>
/// A display. Its full bounds identify it, and its work area leaves out the system UI.
/// </summary>
internal readonly record struct DisplayArea(Rect2I Bounds, Rect2I WorkArea);

/// <summary>
/// The geometry of the floating chat window, in native window pixels.
/// It matches `apps/stage-tamagotchi/src/main/windows/chat/floating-placement.ts`.
/// </summary>
internal static class FloatingChatPlacement
{
    /// <summary>Every edge and corner of a chat that shares none with the main window.</summary>
    public static readonly string[] AllResizeEdges = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

    /// <summary>
    /// Chooses the layout of an attached chat for a main window position.
    /// The current layout stays while it fits, so a drag does not change it without a reason.
    /// The preferred layout comes back when it fits with <paramref name="returnMargin"/> to spare.
    /// </summary>
    public static AttachedChatLayout ChooseAttachedLayout(
        Rect2I main,
        Vector2I size,
        Rect2I workArea,
        AttachedChatLayout current,
        int returnMargin)
    {
        var leftRoom = main.Position.X - size.X - workArea.Position.X;
        var fitsRight = main.End.X + size.X <= workArea.End.X;
        var side = current.Side;
        if (current.Side == AttachedChatSide.Left && leftRoom < 0 && fitsRight)
        {
            side = AttachedChatSide.Right;
        }
        else if (current.Side == AttachedChatSide.Right
            && (leftRoom >= returnMargin || (!fitsRight && leftRoom >= 0)))
        {
            side = AttachedChatSide.Left;
        }

        var bottomAnchorRoom = main.End.Y - size.Y - workArea.Position.Y;
        var fitsTopAnchor = main.Position.Y + size.Y <= workArea.End.Y;
        var anchor = current.Anchor;
        if (current.Anchor == AttachedChatAnchor.Bottom && bottomAnchorRoom < 0 && fitsTopAnchor)
        {
            anchor = AttachedChatAnchor.Top;
        }
        else if (current.Anchor == AttachedChatAnchor.Top
            && (bottomAnchorRoom >= returnMargin || (!fitsTopAnchor && bottomAnchorRoom >= 0)))
        {
            anchor = AttachedChatAnchor.Bottom;
        }

        return new AttachedChatLayout(side, anchor);
    }

    /// <summary>
    /// The offset of an attached chat from the main window origin. The offset stays the same while
    /// the main window moves. A work area that is too small clamps the chat inside it.
    /// </summary>
    public static Vector2I AttachedOffset(
        Rect2I main,
        Vector2I size,
        Rect2I workArea,
        AttachedChatLayout layout)
    {
        var x = layout.Side == AttachedChatSide.Left ? main.Position.X - size.X : main.End.X;
        var y = layout.Anchor == AttachedChatAnchor.Bottom ? main.End.Y - size.Y : main.Position.Y;
        return new Vector2I(
            ClampToRange(x, workArea.Position.X, workArea.End.X - size.X) - main.Position.X,
            ClampToRange(y, workArea.Position.Y, workArea.End.Y - size.Y) - main.Position.Y);
    }

    /// <summary>
    /// The edges and the corner of an attached chat that it does not share with the main window. A
    /// bottom anchored chat grows up, a top anchored one down, and both grow away from the
    /// character.
    /// </summary>
    public static string[] AttachedResizeEdges(AttachedChatLayout layout)
    {
        var vertical = layout.Anchor == AttachedChatAnchor.Bottom ? "n" : "s";
        var horizontal = layout.Side == AttachedChatSide.Left ? "w" : "e";
        return [vertical, horizontal, vertical + horizontal];
    }

    /// <summary>
    /// Bounds that keep the chat whole on one display. The chat has no title bar, so no part of it
    /// can leave the work area. The display that holds most of <paramref name="bounds"/> takes the
    /// chat. A chat larger than that work area shrinks to it.
    /// </summary>
    public static Rect2I KeepOnDisplay(Rect2I bounds, IReadOnlyList<DisplayArea> displays)
    {
        DisplayArea? dominant = null;
        long dominantArea = -1;
        foreach (var display in displays)
        {
            // The full display bounds identify the display. The system UI does not change which
            // display owns a chat that crosses the edge of a work area.
            var area = IntersectionArea(bounds, display.Bounds);
            if (area > dominantArea)
            {
                dominant = display;
                dominantArea = area;
            }
        }

        if (dominant is not { } owner)
        {
            return bounds;
        }

        var workArea = owner.WorkArea;
        var width = Math.Min(bounds.Size.X, workArea.Size.X);
        var height = Math.Min(bounds.Size.Y, workArea.Size.Y);
        return new Rect2I(
            Math.Min(Math.Max(bounds.Position.X, workArea.Position.X), workArea.End.X - width),
            Math.Min(Math.Max(bounds.Position.Y, workArea.Position.Y), workArea.End.Y - height),
            width,
            height);
    }

    /// <summary>
    /// Moves the edges that <paramref name="direction"/> names by the delta. The opposite edges
    /// stay in place, and the size does not go below <paramref name="minimumSize"/>.
    /// </summary>
    public static Rect2I ResizeByDelta(
        Rect2I bounds,
        Vector2I delta,
        string direction,
        Vector2I minimumSize)
    {
        var x = bounds.Position.X;
        var y = bounds.Position.Y;
        var width = bounds.Size.X;
        var height = bounds.Size.Y;

        if (direction.Contains('e', StringComparison.Ordinal))
        {
            width = Math.Max(minimumSize.X, width + delta.X);
        }
        else if (direction.Contains('w', StringComparison.Ordinal))
        {
            var newWidth = Math.Max(minimumSize.X, width - delta.X);
            x += width - newWidth;
            width = newWidth;
        }

        if (direction.Contains('s', StringComparison.Ordinal))
        {
            height = Math.Max(minimumSize.Y, height + delta.Y);
        }
        else if (direction.Contains('n', StringComparison.Ordinal))
        {
            var newHeight = Math.Max(minimumSize.Y, height - delta.Y);
            y += height - newHeight;
            height = newHeight;
        }

        return new Rect2I(x, y, width, height);
    }

    /// <summary>
    /// Clamps like `es-toolkit` `clamp`: the maximum wins when the range is empty.
    /// </summary>
    private static int ClampToRange(int value, int minimum, int maximum)
    {
        return Math.Min(Math.Max(value, minimum), maximum);
    }

    private static long IntersectionArea(Rect2I a, Rect2I b)
    {
        var left = Math.Max(a.Position.X, b.Position.X);
        var top = Math.Max(a.Position.Y, b.Position.Y);
        var right = Math.Min(a.End.X, b.End.X);
        var bottom = Math.Min(a.End.Y, b.End.Y);
        if (right <= left || bottom <= top)
        {
            return 0;
        }

        return (long)(right - left) * (bottom - top);
    }
}
