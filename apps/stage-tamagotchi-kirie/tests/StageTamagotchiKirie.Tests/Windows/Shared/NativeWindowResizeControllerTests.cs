using Godot;
using Xunit;

// ROOT CAUSE:
//
// The Kirie renderer used DOM elements to detect window resize edges. That kept
// fixed native-window geometry in CEF and made Godot depend on Web mouse events.
//
// We fixed this by resolving each edge from Godot WindowInput coordinates.
public class NativeWindowResizeControllerTests
{
    private static readonly Vector2I WindowSize = new(450, 600);

    [Theory]
    [InlineData(8, 8, DisplayServer.WindowResizeEdge.TopLeft)]
    [InlineData(442, 8, DisplayServer.WindowResizeEdge.TopRight)]
    [InlineData(8, 592, DisplayServer.WindowResizeEdge.BottomLeft)]
    [InlineData(442, 592, DisplayServer.WindowResizeEdge.BottomRight)]
    [InlineData(225, 2, DisplayServer.WindowResizeEdge.Top)]
    [InlineData(448, 300, DisplayServer.WindowResizeEdge.Right)]
    [InlineData(225, 598, DisplayServer.WindowResizeEdge.Bottom)]
    [InlineData(2, 300, DisplayServer.WindowResizeEdge.Left)]
    public void ResolvesEdgeFromPointerPosition(
        float x,
        float y,
        DisplayServer.WindowResizeEdge expected)
    {
        Assert.Equal(
            expected,
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(x, y), WindowSize, 5, 10));
    }

    [Fact]
    public void IgnoresWindowInterior()
    {
        Assert.Null(
            NativeWindowResizeController.ResolveResizeEdge(new Vector2(225, 300), WindowSize, 5, 10));
    }
}
