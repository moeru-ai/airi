using Xunit;

public class CefInspectorTargetTests
{
    [Fact]
    public void SelectsLeaderPageFrontend()
    {
        // ROOT CAUSE:
        //
        // The CEF debugging server returns an empty response at its root URL.
        // Opening that URL produced a blank system-browser page instead of DevTools.
        //
        // We fixed this by selecting the main page's frontend URL from /json/list.
        const string targetsJson = """
            [
              {
                "type": "page",
                "url": "http://127.0.0.1:5173/?synced-leader=false#/settings",
                "devtoolsFrontendUrl": "https://devtools.example/inspector.html?ws=follower"
              },
              {
                "type": "worker",
                "url": "http://127.0.0.1:5173/?synced-leader=true#/",
                "devtoolsFrontendUrl": "https://devtools.example/inspector.html?ws=worker"
              },
              {
                "type": "page",
                "url": "http://127.0.0.1:5173/?synced-leader=true#/",
                "devtoolsFrontendUrl": "https://devtools.example/inspector.html?ws=leader"
              }
            ]
            """;

        Uri inspectorUri = CefInspectorTarget.SelectMainInspectorUri(targetsJson);

        Assert.Equal("https://devtools.example/inspector.html?ws=leader", inspectorUri.AbsoluteUri);
    }

    [Fact]
    public void RejectsTargetListWithoutLeader()
    {
        const string targetsJson = """
            [
              {
                "type": "page",
                "url": "http://127.0.0.1:5173/?synced-leader=false#/settings",
                "devtoolsFrontendUrl": "https://devtools.example/inspector.html?ws=follower"
              }
            ]
            """;

        Assert.Throws<InvalidDataException>(() => CefInspectorTarget.SelectMainInspectorUri(targetsJson));
    }
}
