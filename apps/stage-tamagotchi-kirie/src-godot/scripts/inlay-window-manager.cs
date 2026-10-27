using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

/// <summary>
/// Keeps one preloaded Inlay WebView alive across hides and native close requests.
/// Speech requests show it without activation. The tray explicitly requests keyboard focus.
/// </summary>
internal sealed class InlayWindowManager : IDisposable
{
    private const string WindowScenePath = "res://src-godot/inlay-window.tscn";

    private readonly Node _owner;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private readonly IDisposable _openRegistration;
    private Window? _window;
    private bool _webViewReady;
    private bool _focusRequested;
    private bool _disposed;
    private int _homeScreen = -1;
    private Rect2I _homeWorkArea;
    private float _homeScale;

    public InlayWindowManager(
        IEventContext context,
        Node owner,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions)
    {
        _owner = owner;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
        _openRegistration = context.RegisterInvokeHandler(
            AiriDesktopEvents.OpenInlay,
            (EmptyPayload _, CancellationToken _) =>
            {
                OpenInactive();
                return Task.FromResult(new EmptyPayload());
            });
    }

    public void OpenInactive()
    {
        Open(false);
    }

    public void OpenFocused()
    {
        Open(true);
    }

    /// <summary>
    /// Display changes return the overlay home. Ordinary window dragging keeps its position.
    /// </summary>
    public void Process()
    {
        if (_window is null || _disposed)
        {
            return;
        }

        var screen = DisplayServer.GetPrimaryScreen();
        var workArea = DisplayServer.ScreenGetUsableRect(screen);
        var scale = DesktopWindowSizing.GetDisplayScale(screen);
        if (screen != _homeScreen || workArea != _homeWorkArea || scale != _homeScale)
        {
            ReturnHome();
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _openRegistration.Dispose();
        if (_window is not null)
        {
            _window.QueueFree();
            _window = null;
        }
    }

    private void Open(bool focus)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        // A background speech request cannot cancel a tray request while the page loads.
        _focusRequested |= focus;
        if (_window is null)
        {
            var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
                ?? throw new InvalidOperationException(
                    $"The Inlay window scene is missing: {WindowScenePath}");
            var window = scene.Instantiate<Window>();
            _window = window;
            _webViewReady = false;
            try
            {
                _owner.AddChild(window);
                RenderingServer.ViewportSetTransparentBackground(window.GetViewportRid(), true);
                ReturnHome();
                AttachRuntime(window);
            }
            catch
            {
                window.QueueFree();
                _window = null;
                throw;
            }
        }

        if (_webViewReady)
        {
            Show();
        }
    }

    private void AttachRuntime(Window window)
    {
        var kirie = KirieClient.FromNode(window.GetNode("KirieNode"));
        var eventa = kirie.CreateEventaContext(_registry);
        var platform = GdKiriePlatform.Attach(eventa.Context, window);
        var microphonePermissionRegistration = _microphonePermissions.Attach(eventa.Context);
        var permissions = new WebViewPermissionHandler(kirie, _rendererUrl);
        var returnHomeRegistration = eventa.Context.RegisterInvokeHandler(
            AiriDesktopEvents.InlayReturnHome,
            (EmptyPayload _, CancellationToken _) =>
            {
                ReturnHome();
                return Task.FromResult(new EmptyPayload());
            });

        void OnWebViewReady()
        {
            _webViewReady = true;
            var cef = window.GetNode<Control>("KirieNode/KirieCefWebView");
            cef.FocusMode = Control.FocusModeEnum.All;
            Show();
        }

        void OnCloseRequested()
        {
            _focusRequested = false;
            window.Hide();
        }

        void OnTreeExiting()
        {
            if (_window == window)
            {
                _window = null;
                _webViewReady = false;
            }

            window.CloseRequested -= OnCloseRequested;
            window.TreeExiting -= OnTreeExiting;
            kirie.WebViewReady -= OnWebViewReady;
            kirie.IpcError -= OnIpcError;
            eventa.Adapter.Error -= OnEventaError;
            returnHomeRegistration.Dispose();
            permissions.Dispose();
            microphonePermissionRegistration.Dispose();
            platform.Dispose();
            eventa.Dispose();
            kirie.Dispose();
        }

        kirie.WebViewReady += OnWebViewReady;
        kirie.IpcError += OnIpcError;
        eventa.Adapter.Error += OnEventaError;
        window.CloseRequested += OnCloseRequested;
        window.TreeExiting += OnTreeExiting;
        kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(_rendererUrl, "/inlay"));
    }

    private void Show()
    {
        var window = _window!;
        if (!window.Visible)
        {
            // Godot uses nonactivating native presentation for an unfocusable window.
            // Restore focusability after Show so a later click can edit a speech draft.
            // Source: Godot 4.7.2 display_server_macos.mm and display_server_windows.cpp, show_window.
            window.Unfocusable = !_focusRequested;
            try
            {
                window.Show();
            }
            finally
            {
                window.Unfocusable = false;
            }
        }

        if (!_focusRequested)
        {
            return;
        }

        _focusRequested = false;
        window.GrabFocus();
        window.GetNode<Control>("KirieNode/KirieCefWebView").GrabFocus();
    }

    private void ReturnHome()
    {
        if (_window is null)
        {
            return;
        }

        _homeScreen = DisplayServer.GetPrimaryScreen();
        _homeWorkArea = DisplayServer.ScreenGetUsableRect(_homeScreen);
        _homeScale = DesktopWindowSizing.GetDisplayScale(_homeScreen);
        var bounds = InlayWindowGeometry.ResolveBounds(_homeWorkArea, _homeScale);
        _window.CurrentScreen = _homeScreen;
        _window.Size = bounds.Size;
        _window.Position = bounds.Position;
    }

    private static void OnIpcError(string error)
    {
        GD.PushError($"Inlay Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Inlay Kirie Eventa error: {error.Message}");
    }
}
