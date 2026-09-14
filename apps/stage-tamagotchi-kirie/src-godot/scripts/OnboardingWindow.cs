using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class OnboardingWindow : Window
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private IDisposable? _closeRegistration;
    private Action? _onClosed;
    private bool _ready;
    private bool _closing;
    private bool _showRequested;

    public void Initialize(
        KirieEventaJsonRegistry registry,
        string rendererUrl,
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

        _onClosed = onClosed;
        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            throw new InvalidOperationException("Kirie is unavailable for the onboarding window.");
        }

        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, this);
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

        var workArea = DisplayServer.ScreenGetUsableRect(CurrentScreen);
        Position = workArea.Position + new Vector2I(
            Math.Max(0, (workArea.Size.X - Size.X) / 2),
            Math.Max(0, (workArea.Size.Y - Size.Y) / 2));
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
        GD.PushError($"Onboarding Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Onboarding Kirie Eventa error: {error.Message}");
    }
}
