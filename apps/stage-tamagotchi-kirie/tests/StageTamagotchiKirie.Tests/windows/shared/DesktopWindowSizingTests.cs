using Godot;
using Xunit;

// ROOT CAUSE:
//
// Godot's ScreenGetScale returns 1 on Windows even when the desktop uses
// high-DPI scaling, and MoveToCenter includes reserved system UI areas.
//
// We fixed this by deriving the Windows scale from native DPI and centering
// the decorated frame inside ScreenGetUsableRect.
public class DesktopWindowSizingTests
{
    [Fact]
    public void DerivesWindowsScaleFromNativeDpi()
    {
        Assert.Equal(1.5f, DesktopWindowSizing.ResolveDisplayScale("Windows", 1.0f, 144));
    }

    [Fact]
    public void UsesGodotScaleOnOtherPlatforms()
    {
        Assert.Equal(1.25f, DesktopWindowSizing.ResolveDisplayScale("Wayland", 1.25f, 0));
    }

    [Fact]
    public void CentersDecoratedFrameInUsableArea()
    {
        Vector2I center = DesktopWindowSizing.ResolveUsableCenter(
            new Rect2I(0, 25, 1200, 800),
            new Vector2I(400, 400),
            new Vector2I(5, -10));

        Assert.Equal(new Vector2I(405, 215), center);
    }

    [Fact]
    public void PlacesSpotlightInUpperSlot()
    {
        Vector2I position = DesktopWindowSizing.ResolveSpotlightPosition(
            new Rect2I(0, 25, 1200, 800),
            new Vector2I(720, 100));

        Assert.Equal(new Vector2I(240, 201), position);
    }
}
