using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

internal sealed class AboutWindowManager
{
    private const string WindowScenePath = "res://src-godot/about-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private Window? _window;
    private bool _ready;

    public AboutWindowManager(
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        MicrophonePermissionService microphonePermissions)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
        _microphonePermissions = microphonePermissions;
    }

    /// <summary>
    /// Opens or focuses the About window on the main window's current screen.
    /// </summary>
    public void Open()
    {
        if (_window is not null)
        {
            _window.CurrentScreen = _mainWindow.CurrentScreen;
            if (_ready)
            {
                ShowAndFocus(_window);
            }

            return;
        }

        var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
            ?? throw new InvalidOperationException($"The about window scene is missing: {WindowScenePath}");
        var window = scene.Instantiate<Window>();
        _window = window;
        _ready = false;
        try
        {
            _owner.AddChild(window);
            window.CurrentScreen = _mainWindow.CurrentScreen;
            DesktopWindowSizing.ApplyInitialDisplayScale(window);
            AttachRuntime(window);
        }
        catch
        {
            window.QueueFree();
            _window = null;
            throw;
        }
    }

    private void AttachRuntime(Window window)
    {
        var kirie = KirieClient.FromNode(window.GetNode("KirieNode"));
        var eventa = kirie.CreateEventaContext(_registry);
        var platform = GdKiriePlatform.Attach(eventa.Context, window);
        var microphonePermissionRegistration = _microphonePermissions.Attach(eventa.Context);
        var permissions = new WebViewPermissionHandler(kirie, _rendererUrl);

        void OnWebViewReady()
        {
            _ready = true;
            window.Show();
            DesktopWindowSizing.FitDecoratedSizeToInitialSize(window);
            DesktopWindowSizing.MoveToUsableCenter(window);
            window.GrabFocus();
        }

        void OnCloseRequested()
        {
            _window = null;
            _ready = false;
            window.Hide();
            window.QueueFree();
        }

        void OnTreeExiting()
        {
            if (_window == window)
            {
                _window = null;
                _ready = false;
            }

            window.CloseRequested -= OnCloseRequested;
            window.TreeExiting -= OnTreeExiting;
            kirie.WebViewReady -= OnWebViewReady;
            kirie.IpcError -= OnIpcError;
            eventa.Adapter.Error -= OnEventaError;
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
        kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(_rendererUrl, "/about"));
    }

    private static void ShowAndFocus(Window window)
    {
        if (window.Mode == Window.ModeEnum.Minimized)
        {
            window.Mode = Window.ModeEnum.Windowed;
        }

        window.Show();
        window.GrabFocus();
    }

    private static void OnIpcError(string error)
    {
        GD.PushError($"About Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"About Kirie Eventa error: {error.Message}");
    }
}
