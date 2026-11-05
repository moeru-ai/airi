internal static class RendererUrl
{
    public static string ForMain(string baseUrl)
    {
        UrlParts parts = Split(baseUrl);
        string[] leaderValues = GetLeaderValues(parts.Query);
        if (leaderValues.Length > 1)
        {
            throw new InvalidOperationException("The startup URL has duplicate synced-leader query values.");
        }

        if (leaderValues.Length == 1)
        {
            if (StringComparer.Ordinal.Equals(leaderValues[0], "true"))
            {
                return baseUrl;
            }

            throw new InvalidOperationException("The first Kirie window requires synced-leader=true.");
        }

        return Build(parts.Location, parts.Query, "true", parts.Fragment);
    }

    public static string ForFollowerRoute(string baseUrl, string route)
    {
        return ForFollowerRoute(baseUrl, route, null);
    }

    public static string ForMinimalFollowerRoute(string baseUrl, string route)
    {
        return ForFollowerRoute(baseUrl, route, "minimal");
    }

    private static string ForFollowerRoute(string baseUrl, string route, string? stageRuntime)
    {
        UrlParts parts = Split(baseUrl);
        var queryParts = parts.Query
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Where(part =>
            {
                string key = part.Split('=', 2)[0];
                return !StringComparer.Ordinal.Equals(key, "synced-leader")
                    && !StringComparer.Ordinal.Equals(key, "stage-runtime");
            })
            .ToList();

        if (stageRuntime is not null)
        {
            queryParts.Add($"stage-runtime={stageRuntime}");
        }

        string query = string.Join('&', queryParts);
        string fragment = route.StartsWith("/", StringComparison.Ordinal) ? route : $"/{route}";
        return Build(parts.Location, query, "false", fragment);
    }

    private static string Build(string location, string query, string leader, string fragment)
    {
        string leaderQuery = $"synced-leader={leader}";
        string nextQuery = query.Length > 0 ? $"{query}&{leaderQuery}" : leaderQuery;
        string nextFragment = fragment.Length > 0 ? $"#{fragment.TrimStart('#')}" : string.Empty;
        return $"{location}?{nextQuery}{nextFragment}";
    }

    private static string[] GetLeaderValues(string query)
    {
        return query
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Split('=', 2))
            .Where(pair => StringComparer.Ordinal.Equals(pair[0], "synced-leader"))
            .Select(pair => pair.Length == 2 ? pair[1] : string.Empty)
            .ToArray();
    }

    private static UrlParts Split(string url)
    {
        int fragmentStart = url.IndexOf('#', StringComparison.Ordinal);
        string locationAndQuery = fragmentStart >= 0 ? url[..fragmentStart] : url;
        string fragment = fragmentStart >= 0 ? url[(fragmentStart + 1)..] : string.Empty;
        int queryStart = locationAndQuery.IndexOf('?', StringComparison.Ordinal);
        string location = queryStart >= 0 ? locationAndQuery[..queryStart] : locationAndQuery;
        string query = queryStart >= 0 ? locationAndQuery[(queryStart + 1)..] : string.Empty;
        return new UrlParts(location, query, fragment);
    }

    private sealed record UrlParts(string Location, string Query, string Fragment);
}
