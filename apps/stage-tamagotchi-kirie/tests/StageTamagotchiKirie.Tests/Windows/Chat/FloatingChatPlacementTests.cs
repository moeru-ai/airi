using Godot;
using Xunit;

public class FloatingChatPlacementTests
{
    private const int ReturnMargin = 24;

    private static readonly Rect2I WorkArea = new(0, 25, 1920, 1055);
    private static readonly Vector2I ChatSize = new(360, 520);
    private static readonly AttachedChatLayout LeftBottom = AttachedChatLayout.Preferred;
    private static readonly AttachedChatLayout RightBottom = new(AttachedChatSide.Right, AttachedChatAnchor.Bottom);
    private static readonly AttachedChatLayout LeftTop = new(AttachedChatSide.Left, AttachedChatAnchor.Top);

    private static readonly DisplayArea[] Displays =
    [
        new(new Rect2I(0, 0, 1920, 1080), WorkArea),
        new(new Rect2I(-1280, 0, 1280, 800), new Rect2I(-1280, 0, 1280, 800)),
    ];

    private static AttachedChatLayout Choose(Rect2I stage, AttachedChatLayout current)
    {
        return FloatingChatPlacement.ChooseAttachedLayout(stage, ChatSize, WorkArea, current, ReturnMargin);
    }

    [Fact]
    public void MovesRightWithoutRoomOnTheLeft()
    {
        Assert.Equal(AttachedChatSide.Right, Choose(new Rect2I(100, 300, 450, 600), LeftBottom).Side);
    }

    [Fact]
    public void StaysRightUntilTheLeftHasRoomToSpare()
    {
        Assert.Equal(AttachedChatSide.Right, Choose(new Rect2I(370, 300, 450, 600), RightBottom).Side);
    }

    [Fact]
    public void ReturnsLeftWithRoomToSpare()
    {
        Assert.Equal(AttachedChatSide.Left, Choose(new Rect2I(400, 300, 450, 600), RightBottom).Side);
    }

    [Fact]
    public void GoesBackLeftWhenNeitherSideHasRoomToSpare()
    {
        Assert.Equal(AttachedChatSide.Left, Choose(new Rect2I(380, 300, 1300, 600), RightBottom).Side);
    }

    [Fact]
    public void AnchorsTopNearTheTopOfTheWorkArea()
    {
        Assert.Equal(AttachedChatAnchor.Top, Choose(new Rect2I(1000, 25, 450, 300), LeftBottom).Anchor);
    }

    [Fact]
    public void StaysTopAnchoredUntilTheBottomHasRoomToSpare()
    {
        Assert.Equal(AttachedChatAnchor.Top, Choose(new Rect2I(1000, 250, 450, 300), LeftTop).Anchor);
    }

    [Fact]
    public void ReturnsToBottomAnchorWithRoomToSpare()
    {
        Assert.Equal(AttachedChatAnchor.Bottom, Choose(new Rect2I(1000, 280, 450, 300), LeftTop).Anchor);
    }

    [Fact]
    public void OffsetsLeftBottomLayout()
    {
        Assert.Equal(
            new Vector2I(-360, 80),
            FloatingChatPlacement.AttachedOffset(new Rect2I(1000, 300, 450, 600), ChatSize, WorkArea, LeftBottom));
    }

    [Fact]
    public void OffsetsRightTopLayout()
    {
        var rightTop = new AttachedChatLayout(AttachedChatSide.Right, AttachedChatAnchor.Top);

        Assert.Equal(
            new Vector2I(450, 0),
            FloatingChatPlacement.AttachedOffset(new Rect2I(100, 25, 450, 300), ChatSize, WorkArea, rightTop));
    }

    [Fact]
    public void KeepsOffsetInsideWorkAreaWithoutRoom()
    {
        Assert.Equal(
            new Vector2I(-100, 0),
            FloatingChatPlacement.AttachedOffset(new Rect2I(100, 25, 450, 300), ChatSize, WorkArea, LeftBottom));
    }

    [Fact]
    public void ResizesLeftBottomLayoutFromOuterEdges()
    {
        Assert.Equal(["n", "w", "nw"], FloatingChatPlacement.AttachedResizeEdges(LeftBottom));
    }

    [Fact]
    public void KeepsTopEdgeBelowMenuBar()
    {
        Assert.Equal(
            new Rect2I(600, 25, 380, 560),
            FloatingChatPlacement.KeepOnDisplay(new Rect2I(600, -200, 380, 560), Displays));
    }

    [Fact]
    public void MovesOntoDisplayThatHoldsMostOfTheWindow()
    {
        Assert.Equal(
            new Rect2I(-380, 240, 380, 560),
            FloatingChatPlacement.KeepOnDisplay(new Rect2I(-300, 600, 380, 560), Displays));
    }

    [Fact]
    public void ShrinksWindowLargerThanWorkArea()
    {
        Assert.Equal(
            new Rect2I(-1280, 0, 1280, 800),
            FloatingChatPlacement.KeepOnDisplay(new Rect2I(-1280, 0, 1400, 1000), Displays));
    }

    [Fact]
    public void ResizesFromTopLeftCorner()
    {
        Assert.Equal(
            new Rect2I(80, 70, 420, 530),
            FloatingChatPlacement.ResizeByDelta(
                new Rect2I(100, 100, 400, 500), new Vector2I(-20, -30), "nw", new Vector2I(300, 260)));
    }

    [Fact]
    public void StopsResizeAtMinimumWidth()
    {
        Assert.Equal(
            new Rect2I(200, 100, 300, 500),
            FloatingChatPlacement.ResizeByDelta(
                new Rect2I(100, 100, 400, 500), new Vector2I(250, 0), "w", new Vector2I(300, 260)));
    }
}
