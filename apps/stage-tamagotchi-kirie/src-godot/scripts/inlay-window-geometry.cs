using Godot;

/// <summary>
/// Places the voice overlay above the primary display's Dock or taskbar.
/// The logical sizes match the Electron Inlay in src/main/windows/inlay/bounds.ts.
/// </summary>
internal static class InlayWindowGeometry
{
    public static Rect2I ResolveBounds(Rect2I workArea, float displayScale)
    {
        // Godot supplies physical pixels. Select the Electron breakpoint in logical pixels first.
        var logicalWidth = workArea.Size.X / displayScale;
        var width = logicalWidth switch
        {
            <= 1280 => Math.Floor(logicalWidth * 0.5),
            <= 1920 => Math.Floor(logicalWidth * 0.33),
            <= 2560 => Math.Min(Math.Floor(logicalWidth * 0.25), 710),
            _ => Math.Min(Math.Floor(logicalWidth * 0.2), 768),
        };
        var physicalWidth = (int)Math.Round(
            Math.Min(width, 520) * displayScale, MidpointRounding.AwayFromZero);
        var height = (int)Math.Round(200 * displayScale, MidpointRounding.AwayFromZero);
        var bottomGap = (int)Math.Round(
            Math.Max(56 * displayScale, workArea.Size.Y * 0.1), MidpointRounding.AwayFromZero);

        return new Rect2I(
            workArea.Position.X + (int)Math.Round(
                (workArea.Size.X - physicalWidth) / 2.0, MidpointRounding.AwayFromZero),
            Math.Max(workArea.Position.Y, workArea.End.Y - bottomGap - height),
            physicalWidth,
            height);
    }
}
