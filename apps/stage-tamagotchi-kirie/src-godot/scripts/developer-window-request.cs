internal sealed record DeveloperWindowRequest(
    string Key,
    string Route,
    string Title,
    int Width,
    int Height,
    int MinWidth,
    int MinHeight,
    int? X,
    int? Y,
    bool UsesMinimalRuntime)
{
    private const int DefaultDevtoolsWidth = 1020;
    private const int DefaultDevtoolsHeight = 720;
    private const int DevtoolsMinWidth = 640;
    private const int DevtoolsMinHeight = 480;

    public static DeveloperWindowRequest ForEditor()
    {
        return new DeveloperWindowRequest(
            "editor",
            "/editor",
            "AIRI Editor",
            1200,
            800,
            800,
            600,
            null,
            null,
            true);
    }

    public static DeveloperWindowRequest ForDevtools(OpenDevtoolsWindowPayload payload)
    {
        if (string.IsNullOrWhiteSpace(payload.Key))
        {
            throw new ArgumentException("The developer window key must not be empty.", nameof(payload));
        }

        var route = payload.Route ?? "/devtools";
        if (!StringComparer.Ordinal.Equals(route, "/devtools")
            && !route.StartsWith("/devtools/", StringComparison.Ordinal))
        {
            throw new ArgumentException("The developer window route must start with /devtools.", nameof(payload));
        }

        if (payload.Width is <= 0 || payload.Height is <= 0)
        {
            throw new ArgumentException("The developer window size must be positive.", nameof(payload));
        }

        return new DeveloperWindowRequest(
            payload.Key,
            route,
            "AIRI Devtools",
            Math.Max(payload.Width ?? DefaultDevtoolsWidth, DevtoolsMinWidth),
            Math.Max(payload.Height ?? DefaultDevtoolsHeight, DevtoolsMinHeight),
            DevtoolsMinWidth,
            DevtoolsMinHeight,
            payload.X,
            payload.Y,
            false);
    }
}
