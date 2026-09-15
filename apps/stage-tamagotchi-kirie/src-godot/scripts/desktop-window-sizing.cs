using Godot;

internal static class DesktopWindowSizing
{
    private const float WindowsBaseDpi = 96.0f;

    /// <summary>
    /// Converts Electron-compatible logical sizes from project settings and scenes
    /// into Godot's physical pixels.
    /// </summary>
    public static void ApplyInitialDisplayScale(Window window)
    {
        var displayScale = GetDisplayScale(window);
        if (Mathf.IsEqualApprox(displayScale, 1.0f))
        {
            return;
        }

        window.Size = Scale(window.Size, displayScale);
        if (window.MinSize != Vector2I.Zero)
        {
            window.MinSize = Scale(window.MinSize, displayScale);
        }
    }

    /// <summary>
    /// Treats the current client size as an Electron-compatible outer-window size
    /// and subtracts the native window decorations from it.
    /// </summary>
    public static void FitDecoratedSizeToInitialSize(Window window)
    {
        var decorationSize = window.GetSizeWithDecorations() - window.Size;
        window.Size = new Vector2I(
            Math.Max(1, window.Size.X - decorationSize.X),
            Math.Max(1, window.Size.Y - decorationSize.Y));
    }

    /// <summary>
    /// Centers the complete native window inside the current screen's usable area.
    /// </summary>
    public static void MoveToUsableCenter(Window window)
    {
        var workArea = DisplayServer.ScreenGetUsableRect(window.CurrentScreen);
        var decoratedSize = window.GetSizeWithDecorations();
        var decorationOffset = window.Position - window.GetPositionWithDecorations();

        window.Position = ResolveUsableCenter(
            workArea,
            decoratedSize,
            decorationOffset);
    }

    /// <summary>
    /// Returns the native pixel scale used to match Electron's logical window geometry.
    /// </summary>
    public static float GetDisplayScale(Window window)
    {
        var displayServerName = DisplayServer.GetName();
        if (displayServerName == "Windows")
        {
            return ResolveDisplayScale(
                displayServerName,
                1.0f,
                DisplayServer.ScreenGetDpi(window.CurrentScreen));
        }

        var screenScale = displayServerName == "Wayland"
            ? DisplayServer.ScreenGetScale((int)DisplayServer.ScreenOfMainWindow)
            : DisplayServer.ScreenGetScale(window.CurrentScreen);
        return ResolveDisplayScale(
            displayServerName,
            screenScale,
            0);
    }

    internal static Vector2I ResolveUsableCenter(
        Rect2I workArea,
        Vector2I decoratedSize,
        Vector2I decorationOffset)
    {
        var decoratedPosition = workArea.Position + new Vector2I(
            (workArea.Size.X - decoratedSize.X) / 2,
            (workArea.Size.Y - decoratedSize.Y) / 2);

        return decoratedPosition + decorationOffset;
    }

    internal static float ResolveDisplayScale(
        string displayServerName,
        float screenScale,
        int screenDpi)
    {
        if (displayServerName == "Windows")
        {
            return Math.Max(1.0f, screenDpi / WindowsBaseDpi);
        }

        return Math.Max(1.0f, screenScale);
    }

    private static Vector2I Scale(Vector2I size, float displayScale)
    {
        return new Vector2I(
            Mathf.RoundToInt(size.X * displayScale),
            Mathf.RoundToInt(size.Y * displayScale));
    }
}
