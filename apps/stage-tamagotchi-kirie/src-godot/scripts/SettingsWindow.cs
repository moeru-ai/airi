using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class SettingsWindow : Window
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private WebViewPermissionHandler? _permissions;
    private IDisposable? _authRegistration;
    private IDisposable? _settingsReadyRegistration;
    private Action? _onClosed;
    private string? _loadedRoute;
    private string? _route;
    private bool _ready;
    private bool _rendererReady;
    private bool _closing;
    private bool _showRequested;
    private bool _positioned;

    internal void Initialize(
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        string initialRoute,
        AuthService auth,
        Action onClosed)
    {
        if (!IsInsideTree())
        {
            throw new InvalidOperationException("The settings window must be inside the scene tree before initialization.");
        }

        if (_kirie is not null)
        {
            throw new InvalidOperationException("The settings window is already initialized.");
        }

        _onClosed = onClosed;
        _loadedRoute = initialRoute;
        _route = initialRoute;
        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            throw new InvalidOperationException("Kirie is unavailable for the settings window.");
        }

        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, this);
        _authRegistration = auth.Attach(_eventa.Context);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);
        _settingsReadyRegistration = _eventa.Context.Subscribe(
            AiriDesktopEvents.SettingsReady,
            _ => OnRendererReady());

        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;
        CloseRequested += RequestClose;
        _kirie.CreateWebView(RendererUrl.ForFollowerRoute(rendererUrl, initialRoute));
    }

    public void Open(int screen, string route)
    {
        CurrentScreen = screen;
        _showRequested = true;
        _route = route;
        if (_rendererReady && !StringComparer.Ordinal.Equals(route, _loadedRoute))
        {
            Navigate(route);
            _loadedRoute = route;
        }

        if (_ready)
        {
            ShowAndFocus();
        }
    }

    public override void _ExitTree()
    {
        CloseRequested -= RequestClose;
        if (_kirie is not null)
        {
            _kirie.WebViewReady -= OnWebViewReady;
            _kirie.IpcError -= OnIpcError;
        }

        if (_eventa is not null)
        {
            _eventa.Adapter.Error -= OnEventaError;
        }

        _settingsReadyRegistration?.Dispose();
        _authRegistration?.Dispose();
        _permissions?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
        _onClosed?.Invoke();
    }

    private void OnWebViewReady()
    {
        _ready = true;
        if (_showRequested)
        {
            ShowAndFocus();
        }
    }

    private void OnRendererReady()
    {
        _rendererReady = true;
        if (_route is not null && !StringComparer.Ordinal.Equals(_route, _loadedRoute))
        {
            Navigate(_route);
            _loadedRoute = _route;
        }
    }

    private void Navigate(string route)
    {
        _eventa!.Context.Emit(
            AiriDesktopEvents.SettingsNavigate,
            new SettingsNavigatePayload(route));
    }

    private void ShowAndFocus()
    {
        if (Mode == ModeEnum.Minimized)
        {
            Mode = ModeEnum.Windowed;
        }

        if (!_positioned)
        {
            var workArea = DisplayServer.ScreenGetUsableRect(CurrentScreen);
            Position = workArea.Position + new Vector2I(
                Math.Max(0, (workArea.Size.X - Size.X) / 2),
                Math.Max(0, (workArea.Size.Y - Size.Y) / 2));
            _positioned = true;
        }

        Show();
        GrabFocus();
    }

    private void RequestClose()
    {
        if (_closing)
        {
            return;
        }

        _closing = true;
        _showRequested = false;
        Hide();
        QueueFree();
    }

    private static void OnIpcError(string error)
    {
        GD.PushError($"Settings Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Settings Kirie Eventa error: {error.Message}");
    }
}
