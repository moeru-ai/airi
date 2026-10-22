using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

internal sealed class AboutWindowManager : IDisposable
{
    private const string WindowScenePath = "res://src-godot/about-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly MicrophonePermissionService _microphonePermissions;
    private WindowSession? _window;
    private bool _disposed;

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

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _window?.Close();
    }

    /// <summary>
    /// Opens or focuses the About window on the main window's current screen.
    /// </summary>
    public void Open()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_window is null || !_window.IsValid)
        {
            var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
                ?? throw new InvalidOperationException($"The about window scene is missing: {WindowScenePath}");
            var window = scene.Instantiate<Window>();
            try
            {
                _owner.AddChild(window);
                window.CurrentScreen = _mainWindow.CurrentScreen;
                DesktopWindowSizing.ApplyInitialDisplayScale(window);
                _window = new WindowSession(
                    this,
                    window,
                    _registry,
                    _rendererUrl,
                    _microphonePermissions);
            }
            catch
            {
                window.QueueFree();
                _window = null;
                throw;
            }
        }

        _window.Open(_mainWindow.CurrentScreen);
    }

    private void OnWindowClosed(WindowSession session)
    {
        if (_window == session)
        {
            _window = null;
        }
    }

    private sealed class WindowSession : IDisposable
    {
        private readonly AboutWindowManager _owner;
        private readonly Window _window;
        private readonly KirieClient _kirie;
        private readonly KirieEventaContextHandle _eventa;
        private readonly GdKiriePlatformHost _platform;
        private readonly WebViewPermissionHandler _permissions;
        private readonly IDisposable _microphonePermissionRegistration;
        private bool _ready;
        private bool _showRequested;
        private bool _initialGeometryApplied;
        private bool _disposed;

        public WindowSession(
            AboutWindowManager owner,
            Window window,
            KirieEventaJsonRegistry registry,
            string rendererUrl,
            MicrophonePermissionService microphonePermissions)
        {
            _owner = owner;
            _window = window;
            _kirie = KirieClient.FromNode(window.GetNode("KirieNode"));
            if (!_kirie.IsAvailable)
            {
                throw new InvalidOperationException("Kirie is unavailable for the about window.");
            }

            _eventa = _kirie.CreateEventaContext(registry);
            _platform = GdKiriePlatform.Attach(_eventa.Context, window);
            _microphonePermissionRegistration = microphonePermissions.Attach(_eventa.Context);
            _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);

            _kirie.WebViewReady += OnWebViewReady;
            _kirie.IpcError += OnIpcError;
            _eventa.Adapter.Error += OnEventaError;
            _window.CloseRequested += Close;
            _window.TreeExiting += Dispose;
            _kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(rendererUrl, "/about"));
        }

        public bool IsValid =>
            !_disposed
            && GodotObject.IsInstanceValid(_window)
            && !_window.IsQueuedForDeletion();

        public void Open(int screen)
        {
            _window.CurrentScreen = screen;
            _showRequested = true;
            if (_ready)
            {
                ShowAndFocus();
            }
        }

        public void Close()
        {
            _showRequested = false;
            if (GodotObject.IsInstanceValid(_window))
            {
                _window.Hide();
            }

            Dispose();
            if (GodotObject.IsInstanceValid(_window) && !_window.IsQueuedForDeletion())
            {
                _window.QueueFree();
            }
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            _owner.OnWindowClosed(this);
            if (GodotObject.IsInstanceValid(_window))
            {
                _window.CloseRequested -= Close;
                _window.TreeExiting -= Dispose;
            }

            _kirie.WebViewReady -= OnWebViewReady;
            _kirie.IpcError -= OnIpcError;
            _eventa.Adapter.Error -= OnEventaError;
            _permissions.Dispose();
            _microphonePermissionRegistration.Dispose();
            _platform.Dispose();
            _eventa.Dispose();
            _kirie.Dispose();
        }

        private void OnWebViewReady()
        {
            _ready = true;
            if (_showRequested)
            {
                ShowAndFocus();
            }
        }

        private void ShowAndFocus()
        {
            if (_window.Mode == Window.ModeEnum.Minimized)
            {
                _window.Mode = Window.ModeEnum.Windowed;
            }

            _window.Show();
            if (!_initialGeometryApplied)
            {
                DesktopWindowSizing.FitDecoratedSizeToInitialSize(_window);
                DesktopWindowSizing.MoveToUsableCenter(_window);
                _initialGeometryApplied = true;
            }

            _window.GrabFocus();
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
}
