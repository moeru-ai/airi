using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

/// <summary>Owns one native widget window and the renderer transport until the window exits.</summary>
internal sealed class WidgetWindow : IDisposable
{
    private readonly Window _window;
    private readonly KirieClient _kirie;
    private readonly KirieEventaContextHandle _eventa;
    private readonly GdKiriePlatformHost _platform;
    private readonly WebViewPermissionHandler _permissions;
    private readonly IDisposable _microphoneRegistration;
    private readonly IDisposable _widgetRegistration;
    private readonly Action _closed;
    private bool _disposed;
    private bool _rendererMounted;

    public WidgetWindow(
        Window window,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        string id,
        MicrophonePermissionService microphonePermissions,
        Func<IEventContext, string, IDisposable> attach,
        Action closed)
    {
        _window = window;
        _closed = closed;
        _kirie = KirieClient.FromNode(window.GetNode("KirieNode"));
        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, window);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);
        _microphoneRegistration = microphonePermissions.Attach(_eventa.Context);
        _widgetRegistration = attach(_eventa.Context, id);
        window.CloseRequested += Close;
        window.TreeExiting += Dispose;
        _kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(
            rendererUrl, $"/widgets?id={Uri.EscapeDataString(id)}"));
    }

    public void Present(WidgetSnapshotPayload snapshot, bool show)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _window.AlwaysOnTop = snapshot.AlwaysOnTop;
        if (snapshot.WindowSize is { } size)
        {
            float scale = DesktopWindowSizing.GetDisplayScale(_window);
            var workArea = DisplayServer.ScreenGetUsableRect(_window.CurrentScreen);
            int minWidth = Math.Clamp((int)((size.MinWidth ?? 240) * scale), 1, workArea.Size.X);
            int minHeight = Math.Clamp((int)((size.MinHeight ?? 160) * scale), 1, workArea.Size.Y);
            int maxWidth = Math.Clamp((int)((size.MaxWidth ?? workArea.Size.X / scale) * scale), minWidth, workArea.Size.X);
            int maxHeight = Math.Clamp((int)((size.MaxHeight ?? workArea.Size.Y / scale) * scale), minHeight, workArea.Size.Y);
            _window.MinSize = new Vector2I(minWidth, minHeight);
            _window.MaxSize = new Vector2I(maxWidth, maxHeight);
            _window.Size = new Vector2I(
                Math.Clamp((int)((size.Width ?? 620) * scale), minWidth, maxWidth),
                Math.Clamp((int)((size.Height ?? 760) * scale), minHeight, maxHeight));
        }

        // Fetch supplies the first snapshot. Later mutations use events after that renderer is mounted.
        if (_rendererMounted)
        {
            _eventa.Context.Emit(WidgetContracts.Render, snapshot);
        }
        if (show)
        {
            Show();
        }
    }

    public void MarkRendererMounted() => _rendererMounted = true;

    public void Show()
    {
        _window.Show();
        _window.GrabFocus();
    }

    public void Hide() => _window.Hide();

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _window.CloseRequested -= Close;
        _window.TreeExiting -= Dispose;
        _widgetRegistration.Dispose();
        _permissions.Dispose();
        _microphoneRegistration.Dispose();
        _platform.Dispose();
        _eventa.Dispose();
        _kirie.Dispose();
        _closed();
        if (!_window.IsQueuedForDeletion())
        {
            _window.QueueFree();
        }
    }

    private void Close() => Dispose();
}
