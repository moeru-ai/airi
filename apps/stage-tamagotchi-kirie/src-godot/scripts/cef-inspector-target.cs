using System.Text.Json;

internal static class CefInspectorTarget
{
    private const string LeaderQuery = "synced-leader=true";

    /// <summary>
    /// Selects the DevTools frontend for the main AIRI page from the CEF target list.
    /// </summary>
    /// <remarks>
    /// The leader page is the main application window. The first page target is a
    /// fallback for startup states that do not expose the leader query yet.
    /// </remarks>
    public static Uri SelectMainInspectorUri(string targetsJson)
    {
        using var document = JsonDocument.Parse(targetsJson);
        if (document.RootElement.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException("The CEF debugging target list must be a JSON array.");
        }

        Uri? firstPageInspector = null;
        foreach (var target in document.RootElement.EnumerateArray())
        {
            if (!HasStringValue(target, "type", "page"))
            {
                continue;
            }

            var inspectorUri = ReadInspectorUri(target);
            if (inspectorUri is null)
            {
                continue;
            }

            firstPageInspector ??= inspectorUri;
            if (TryReadString(target, "url", out var pageUrl) && IsLeaderPage(pageUrl))
            {
                return inspectorUri;
            }
        }

        return firstPageInspector
            ?? throw new InvalidDataException("The CEF debugging target list has no page inspector.");
    }

    private static bool IsLeaderPage(string pageUrl)
    {
        if (!Uri.TryCreate(pageUrl, UriKind.Absolute, out var uri))
        {
            return false;
        }

        return uri.Query
            .TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Contains(LeaderQuery, StringComparer.Ordinal);
    }

    private static Uri? ReadInspectorUri(JsonElement target)
    {
        if (!TryReadString(target, "devtoolsFrontendUrl", out var value)
            || !Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return null;
        }

        return uri;
    }

    private static bool HasStringValue(JsonElement element, string property, string expected)
    {
        return TryReadString(element, property, out var value)
            && StringComparer.Ordinal.Equals(value, expected);
    }

    private static bool TryReadString(JsonElement element, string property, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(property, out var jsonValue)
            || jsonValue.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var stringValue = jsonValue.GetString();
        if (string.IsNullOrWhiteSpace(stringValue))
        {
            return false;
        }

        value = stringValue;
        return true;
    }
}
