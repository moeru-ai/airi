using Godot;
using Xunit;

public class TrayWindowGeometryTests
{
    private static readonly Rect2I WorkArea = new(0, 25, 1200, 800);

    [Fact]
    public void ResolvesRecommendedSizeInPhysicalPixels()
    {
        Assert.Equal(
            new Vector2I(900, 1200),
            TrayWindowGeometry.ResolvePresetSize(TrayWindowSizePreset.Recommended, WorkArea, 2.0f));
    }

    [Fact]
    public void KeepsRecommendedAspectRatioForHeightPresets()
    {
        Assert.Equal(
            new Vector2I(600, 800),
            TrayWindowGeometry.ResolvePresetSize(TrayWindowSizePreset.FullHeight, WorkArea, 2.0f));
        Assert.Equal(
            new Vector2I(300, 400),
            TrayWindowGeometry.ResolvePresetSize(TrayWindowSizePreset.HalfHeight, WorkArea, 2.0f));
    }

    [Fact]
    public void KeepsBottomRightEdgesWhenResizingInBottomRightQuadrant()
    {
        Rect2I bounds = TrayWindowGeometry.ResolveAnchoredBounds(
            new Rect2I(500, 225, 600, 600),
            new Vector2I(300, 400),
            WorkArea);

        Assert.Equal(new Rect2I(800, 425, 300, 400), bounds);
    }

    [Fact]
    public void KeepsResizedWindowInsideWorkArea()
    {
        Rect2I bounds = TrayWindowGeometry.ResolveAnchoredBounds(
            new Rect2I(-50, 0, 400, 400),
            new Vector2I(450, 1000),
            WorkArea);

        Assert.Equal(new Rect2I(0, 25, 450, 800), bounds);
    }

    [Fact]
    public void ResolvesAlignedPositions()
    {
        var size = new Vector2I(450, 600);

        Assert.Equal(
            new Vector2I(750, 25),
            TrayWindowGeometry.ResolveAlignedPosition(TrayWindowAlignment.TopRight, WorkArea, size));
        Assert.Equal(
            new Vector2I(375, 125),
            TrayWindowGeometry.ResolveAlignedPosition(TrayWindowAlignment.Center, WorkArea, size));
    }

    [Fact]
    public void MatchesPositionWithinTolerance()
    {
        Assert.True(TrayWindowGeometry.IsPositionMatch(new Vector2I(754, 21), new Vector2I(750, 25)));
    }

    [Fact]
    public void RejectsSizeOutsideTolerance()
    {
        Assert.False(TrayWindowGeometry.IsSizeMatch(new Vector2I(453, 600), new Vector2I(450, 600)));
    }
}
