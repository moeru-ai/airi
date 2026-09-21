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

        if (window.MaxSize != Vector2I.Zero)
        {
            window.MaxSize = Scale(window.MaxSize, displayScale);
        }

        if (window.MinSize != Vector2I.Zero)
        {
            window.MinSize = Scale(window.MinSize, displayScale);
        }

        window.Size = Scale(window.Size, displayScale);
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
    /// Places the Spotlight window on the display that contains the cursor.
    /// The vertical offset matches Electron: 22% down the usable area.
    /// </summary>
    public static void MoveToSpotlightSlot(Window window)
    {
        var mouse = DisplayServer.MouseGetPosition();
        var screen = ResolveScreenFromPoint(
            mouse,
            CollectScreenBounds(),
            window.CurrentScreen);
        window.CurrentScreen = screen;
        var workArea = DisplayServer.ScreenGetUsableRect(screen);
        window.Position = ResolveSpotlightPosition(workArea, window.Size);
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

    internal static Vector2I ResolveSpotlightPosition(Rect2I workArea, Vector2I windowSize)
    {
        return new Vector2I(
            workArea.Position.X + ((workArea.Size.X - windowSize.X) / 2),
            workArea.Position.Y + Mathf.RoundToInt(workArea.Size.Y * 0.22f));
    }

    internal static int ResolveScreenFromPoint(
        Vector2I point,
        IReadOnlyList<Rect2I> screens,
        int fallbackScreen)
    {
        for (var index = 0; index < screens.Count; index++)
        {
            if (screens[index].HasPoint(point))
            {
                return index;
            }
        }

        return fallbackScreen;
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

    private static Rect2I[] CollectScreenBounds()
    {
        var screens = new Rect2I[DisplayServer.GetScreenCount()];
        for (var screen = 0; screen < screens.Length; screen++)
        {
            screens[screen] = new Rect2I(
                DisplayServer.ScreenGetPosition(screen),
                DisplayServer.ScreenGetSize(screen));
        }

        return screens;
    }
}
