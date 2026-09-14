using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class ChatWindow : Window
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private WebViewPermissionHandler? _permissions;
    private IDisposable? _readyRegistration;
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
            throw new InvalidOperationException("The chat window must be inside the scene tree before initialization.");
        }

        if (_kirie is not null)
        {
            throw new InvalidOperationException("The chat window is already initialized.");
        }

        _onClosed = onClosed;
        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            throw new InvalidOperationException("Kirie is unavailable for the chat window.");
        }

        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, this);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);
        _readyRegistration = _eventa.Context.Subscribe(
            AiriDesktopEvents.ChatReady,
            _ => OnRendererReady());

        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;
        CloseRequested += RequestClose;
        _kirie.CreateWebView(RendererUrl.ForMinimalFollowerRoute(rendererUrl, "/chat"));
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
            _kirie.IpcError -= OnIpcError;
        }

        if (_eventa is not null)
        {
            _eventa.Adapter.Error -= OnEventaError;
        }

        _readyRegistration?.Dispose();
        _permissions?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
        _onClosed?.Invoke();
    }

    private void OnRendererReady()
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
        GD.PushError($"Chat Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Chat Kirie Eventa error: {error.Message}");
    }
}
