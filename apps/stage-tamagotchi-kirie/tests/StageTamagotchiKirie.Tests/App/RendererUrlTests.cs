using Xunit;

// ROOT CAUSE:
//
// Chat already used the minimal follower runtime. Notice still booted the
// full Stage runtime, so a second CEF WebView started orchestrator work
// and competed with software OSR compositing of the main Live2D stage.
//
// We fixed this by keeping Settings and developer windows on the full
// follower runtime, and by giving Notice the same minimal runtime as Chat.
public class RendererUrlTests
{
    private const string BaseUrl = "http://127.0.0.1:5173/";

    [Fact]
    public void KeepsSettingsOnFullFollowerRuntime()
    {
        Assert.Equal(
            "http://127.0.0.1:5173/?synced-leader=false#/settings",
            RendererUrl.ForFollowerRoute(BaseUrl, "/settings"));
    }

    [Theory]
    [InlineData("/chat")]
    [InlineData("/spotlight")]
    [InlineData("/notice?id=one")]
    public void UsesMinimalFollowerRuntime(string route)
    {
        Assert.Equal(
            $"http://127.0.0.1:5173/?stage-runtime=minimal&synced-leader=false#{route}",
            RendererUrl.ForMinimalFollowerRoute(BaseUrl, route));
    }
}
