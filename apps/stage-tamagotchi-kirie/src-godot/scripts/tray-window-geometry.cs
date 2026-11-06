using Godot;

internal enum TrayWindowAlignment
{
    Center,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

internal enum TrayWindowSizePreset
{
    Recommended,
    FullHeight,
    HalfHeight,
    FullScreen,
}

/// <summary>
/// Computes the main-window geometry for the tray size and alignment items.
/// The values match the Electron tray in apps/stage-tamagotchi/src/main/tray/index.ts.
/// </summary>
internal static class TrayWindowGeometry
{
    public static readonly Vector2I RecommendedLogicalSize = new(450, 600);

    private const int SizeTolerance = 2;
    private const int PositionTolerance = 5;

    /// <summary>
    /// Returns the target size of a preset in physical pixels.
    /// </summary>
    public static Vector2I ResolvePresetSize(
        TrayWindowSizePreset preset,
        Rect2I workArea,
        float displayScale)
    {
        var aspectRatio = (float)RecommendedLogicalSize.X / RecommendedLogicalSize.Y;
        var halfHeight = workArea.Size.Y / 2;
        return preset switch
        {
            TrayWindowSizePreset.Recommended => new Vector2I(
                Mathf.RoundToInt(RecommendedLogicalSize.X * displayScale),
                Mathf.RoundToInt(RecommendedLogicalSize.Y * displayScale)),
            TrayWindowSizePreset.FullHeight => new Vector2I(
                Mathf.FloorToInt(workArea.Size.Y * aspectRatio),
                workArea.Size.Y),
            TrayWindowSizePreset.HalfHeight => new Vector2I(
                Mathf.FloorToInt(halfHeight * aspectRatio),
                halfHeight),
            TrayWindowSizePreset.FullScreen => workArea.Size,
            _ => throw new ArgumentOutOfRangeException(nameof(preset), preset, null),
        };
    }

    /// <summary>
    /// Resizes the window and keeps the edge nearest to the work-area quadrant fixed.
    /// The result stays inside the work area.
    /// </summary>
    public static Rect2I ResolveAnchoredBounds(
        Rect2I currentBounds,
        Vector2I targetSize,
        Rect2I workArea)
    {
        var width = Math.Min(targetSize.X, workArea.Size.X);
        var height = Math.Min(targetSize.Y, workArea.Size.Y);
        var currentCenter = currentBounds.Position + (currentBounds.Size / 2);
        var workAreaCenter = workArea.Position + (workArea.Size / 2);

        var x = currentCenter.X > workAreaCenter.X
            ? currentBounds.End.X - width
            : currentBounds.Position.X;
        var y = currentCenter.Y > workAreaCenter.Y
            ? currentBounds.End.Y - height
            : currentBounds.Position.Y;

        return new Rect2I(
            Math.Clamp(x, workArea.Position.X, workArea.End.X - width),
            Math.Clamp(y, workArea.Position.Y, workArea.End.Y - height),
            width,
            height);
    }

    /// <summary>
    /// Returns the window position for an alignment inside the work area.
    /// </summary>
    public static Vector2I ResolveAlignedPosition(
        TrayWindowAlignment alignment,
        Rect2I workArea,
        Vector2I windowSize)
    {
        var left = workArea.Position.X;
        var top = workArea.Position.Y;
        var right = workArea.End.X - windowSize.X;
        var bottom = workArea.End.Y - windowSize.Y;
        return alignment switch
        {
            TrayWindowAlignment.Center => new Vector2I(
                left + ((workArea.Size.X - windowSize.X) / 2),
                top + ((workArea.Size.Y - windowSize.Y) / 2)),
            TrayWindowAlignment.TopLeft => new Vector2I(left, top),
            TrayWindowAlignment.TopRight => new Vector2I(right, top),
            TrayWindowAlignment.BottomLeft => new Vector2I(left, bottom),
            TrayWindowAlignment.BottomRight => new Vector2I(right, bottom),
            _ => throw new ArgumentOutOfRangeException(nameof(alignment), alignment, null),
        };
    }

    public static bool IsSizeMatch(Vector2I actual, Vector2I target)
    {
        return Math.Abs(actual.X - target.X) <= SizeTolerance
            && Math.Abs(actual.Y - target.Y) <= SizeTolerance;
    }

    public static bool IsPositionMatch(Vector2I actual, Vector2I target)
    {
        return Math.Abs(actual.X - target.X) <= PositionTolerance
            && Math.Abs(actual.Y - target.Y) <= PositionTolerance;
    }
}
