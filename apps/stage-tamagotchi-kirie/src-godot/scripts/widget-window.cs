using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

/// <summary>
/// Owns one native widget window and its renderer transport.
/// The manager removes its state before disposal, so each transport closes once.
/// </summary>
internal sealed class WidgetWindow : IDisposable
{
    private readonly Window _window;
    private readonly KirieClient _kirie;
    private readonly KirieEventaContextHandle _eventa;
    private readonly GdKiriePlatformHost _platform;
    private readonly WebViewPermissionHandler _permissions;
    private readonly IDisposable _microphoneRegistration;
    private readonly Action _detachWidgets;
    private bool _rendererMounted;

    public WidgetWindow(
        Window window,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        string id,
        MicrophonePermissionService microphonePermissions,
        WidgetWindowManager widgets)
    {
        _window = window;
        _kirie = KirieClient.FromNode(window.GetNode("KirieNode"));
        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, window);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);
        _microphoneRegistration = microphonePermissions.Attach(_eventa.Context);
        _detachWidgets = widgets.Attach(_eventa.Context, id);
        _kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(
            rendererUrl, $"/widgets?id={Uri.EscapeDataString(id)}"));
    }

    public void Present(WidgetSnapshotPayload snapshot)
    {
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
        _detachWidgets();
        _permissions.Dispose();
        _microphoneRegistration.Dispose();
        _platform.Dispose();
        _eventa.Dispose();
        _kirie.Dispose();
        if (!_window.IsQueuedForDeletion())
        {
            _window.QueueFree();
        }
    }
}
