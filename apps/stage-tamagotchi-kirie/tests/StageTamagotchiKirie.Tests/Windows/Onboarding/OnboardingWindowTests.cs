using Godot;
using Xunit;

// ROOT CAUSE:
//
// Godot CEF does not process Electron CSS drag regions. The renderer then
// started window movement from a DOM mouse event instead of native input.
//
// We fixed this by using the safe native title region from Godot WindowInput.
public class OnboardingWindowTests
{
    private static readonly Vector2I WindowSize = new(1000, 650);
    private static readonly Vector3I SafeTitleMargins = new(80, 12, 32);

    [Fact]
    public void DragsFromSafeTitleRegion()
    {
        Assert.True(OnboardingWindow.IsInSafeTitleRegion(new Vector2(80, 0), WindowSize, SafeTitleMargins));
    }

    [Theory]
    [InlineData(79, 16)]
    [InlineData(988, 16)]
    [InlineData(500, 32)]
    public void IgnoresTrafficLightsRightMarginAndContent(float x, float y)
    {
        Assert.False(OnboardingWindow.IsInSafeTitleRegion(new Vector2(x, y), WindowSize, SafeTitleMargins));
    }
}
