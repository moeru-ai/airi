using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class OnboardingWindow : Window
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private WebViewPermissionHandler? _permissions;
    private IDisposable? _authRegistration;
    private IDisposable? _closeRegistration;
    private Action? _onClosed;
    private bool _ready;
    private bool _closing;
    private bool _showRequested;
    private bool _initialGeometryApplied;

    internal void Initialize(
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        AuthService auth,
        Action onClosed)
    {
        if (!IsInsideTree())
        {
            throw new InvalidOperationException("The onboarding window must be inside the scene tree before initialization.");
        }

        if (_kirie is not null)
        {
            throw new InvalidOperationException("The onboarding window is already initialized.");
        }

        if (ExtendToTitle)
        {
            WindowInput += OnWindowInput;
        }

        _onClosed = onClosed;
        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            throw new InvalidOperationException("Kirie is unavailable for the onboarding window.");
        }

        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, this);
        _authRegistration = auth.Attach(_eventa.Context);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);
        _closeRegistration = _eventa.Context.RegisterInvokeHandler(
            AiriDesktopEvents.CloseOnboarding,
            (EmptyPayload _, CancellationToken _) =>
            {
                RequestClose();
                return Task.FromResult(new EmptyPayload());
            });

        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;
        CloseRequested += RequestClose;
        _kirie.CreateWebView(RendererUrl.ForFollowerRoute(rendererUrl, "/onboarding"));
    }

    public void Open(int screen)
    {
        CurrentScreen = screen;
        _showRequested = true;
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

        _closeRegistration?.Dispose();
        _authRegistration?.Dispose();
        WindowInput -= OnWindowInput;
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

    private void ShowAndFocus()
    {
        if (Mode == ModeEnum.Minimized)
        {
            Mode = ModeEnum.Windowed;
        }

        Show();
        if (!_initialGeometryApplied)
        {
            DesktopWindowSizing.FitDecoratedSizeToInitialSize(this);
            DesktopWindowSizing.MoveToUsableCenter(this);
            _initialGeometryApplied = true;
        }

        GrabFocus();
    }

    internal static bool IsInSafeTitleRegion(
        Vector2 position,
        Vector2I windowSize,
        Vector3I safeTitleMargins)
    {
        return position.X >= safeTitleMargins.X
            && position.X < windowSize.X - safeTitleMargins.Y
            && position.Y >= 0
            && position.Y < safeTitleMargins.Z;
    }

    private void OnWindowInput(InputEvent inputEvent)
    {
        if (inputEvent is not InputEventMouseButton
            {
                ButtonIndex: MouseButton.Left,
                Pressed: true,
            } mouseButton)
        {
            return;
        }

        var safeTitleMargins = DisplayServer.WindowGetSafeTitleMargins(GetWindowId());
        if (!IsInSafeTitleRegion(mouseButton.Position, Size, safeTitleMargins))
        {
            return;
        }

        SetInputAsHandled();
        StartDrag();
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
        GD.PushError($"Onboarding Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Onboarding Kirie Eventa error: {error.Message}");
    }
}
