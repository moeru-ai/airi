using Xunit;

public class SpotlightHostTests
{
    [Fact]
    public void AcceptsDefaultShortcut()
    {
        Assert.True(SpotlightHost.IsSafe(SpotlightHost.Default));
    }

    [Theory]
    [InlineData("KeyK", "cmd", true)]
    [InlineData("KeyA", "shift", false)]
    [InlineData("", "ctrl", false)]
    public void RequiresKeyAndNonShiftModifier(string key, string modifier, bool expected)
    {
        Assert.Equal(expected, SpotlightHost.IsSafe(new SpotlightAcceleratorPayload(key, [modifier])));
    }

    [Fact]
    public void ParsesPersistedModifiers()
    {
        Assert.Equal("KeyA", SpotlightHost.TryCreate("KeyA", "ctrl, shift")!.Key);
    }

    [Fact]
    public void RejectsUnsafePersistedShortcut()
    {
        Assert.Null(SpotlightHost.TryCreate("KeyA", "shift"));
    }
}
