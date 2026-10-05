using Godot;

internal sealed class WebViewPermissionHandler : IDisposable
{
    private readonly KirieClient _kirie;
    private readonly Uri _trustedOrigin;
    private readonly MicrophonePermissionService? _microphonePermissions;
    private bool _disposed;

    public WebViewPermissionHandler(
        KirieClient kirie,
        string rendererUrl,
        MicrophonePermissionService? microphonePermissions = null)
    {
        _kirie = kirie;
        _trustedOrigin = ParseOrigin(rendererUrl);
        _microphonePermissions = microphonePermissions;
        _kirie.PermissionRequested += OnPermissionRequested;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _kirie.PermissionRequested -= OnPermissionRequested;
    }

    private void OnPermissionRequested(string permissionType, string origin, long requestId)
    {
        if (StringComparer.Ordinal.Equals(permissionType, "microphone")
            && HasSameOrigin(origin)
            && _microphonePermissions is not null)
        {
            _microphonePermissions.Request(granted => Resolve(requestId, granted));
            return;
        }

        Resolve(requestId, granted: false);
    }

    private void Resolve(long requestId, bool granted)
    {
        var resolved = granted
            ? _kirie.GrantPermission(requestId)
            : _kirie.DenyPermission(requestId);
        if (!resolved)
        {
            GD.PushError(
                $"Kirie could not resolve WebView permission request {requestId}.");
        }
    }

    private bool HasSameOrigin(string origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var requestOrigin))
        {
            return false;
        }

        return StringComparer.OrdinalIgnoreCase.Equals(_trustedOrigin.Scheme, requestOrigin.Scheme)
            && StringComparer.OrdinalIgnoreCase.Equals(_trustedOrigin.IdnHost, requestOrigin.IdnHost)
            && _trustedOrigin.Port == requestOrigin.Port;
    }

    private static Uri ParseOrigin(string rendererUrl)
    {
        if (!Uri.TryCreate(rendererUrl, UriKind.Absolute, out var origin))
        {
            throw new InvalidOperationException("The renderer URL must have an absolute origin.");
        }

        return origin;
    }
}
