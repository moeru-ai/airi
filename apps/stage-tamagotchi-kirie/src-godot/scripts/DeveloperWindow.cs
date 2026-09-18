using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class DeveloperWindow : Window
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private WebViewPermissionHandler? _permissions;
    private Action? _onClosed;
    private OpenDevtoolsWindowPayload? _request;
    private Vector2I _defaultSize;
    private Vector2I _minimumSize;
    private bool _ready;
    private bool _closing;
    private bool _showRequested;

    internal void Initialize(
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        OpenDevtoolsWindowPayload request,
        Action onClosed)
    {
        if (!IsInsideTree())
        {
            throw new InvalidOperationException("The developer window must be inside the scene tree before initialization.");
        }

        if (_kirie is not null)
        {
            throw new InvalidOperationException("The developer window is already initialized.");
        }

        _request = request;
        _onClosed = onClosed;
        _defaultSize = Size;
        _minimumSize = MinSize;
        DesktopWindowSizing.ApplyInitialDisplayScale(this);

        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            throw new InvalidOperationException("Kirie is unavailable for the developer window.");
        }

        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, this);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);

        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;
        CloseRequested += RequestClose;

        _kirie.CreateWebView(RendererUrl.ForFollowerRoute(rendererUrl, request.Route ?? "/devtools"));
    }

    internal void Open(int screen, OpenDevtoolsWindowPayload request)
    {
        CurrentScreen = screen;
        _request = request;
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
        var request = _request
            ?? throw new InvalidOperationException("The developer window request is missing.");
        var scale = DesktopWindowSizing.GetDisplayScale(this);
        MinSize = Scale(_minimumSize, scale);
        Size = Scale(
            new Vector2I(
                Math.Max(request.Width ?? _defaultSize.X, _minimumSize.X),
                Math.Max(request.Height ?? _defaultSize.Y, _minimumSize.Y)),
            scale);
        DesktopWindowSizing.FitDecoratedSizeToInitialSize(this);

        DesktopWindowSizing.MoveToUsableCenter(this);
        if (request.X is not null || request.Y is not null)
        {
            var centeredPosition = Position;
            Position = new Vector2I(
                request.X is null ? centeredPosition.X : Mathf.RoundToInt(request.X.Value * scale),
                request.Y is null ? centeredPosition.Y : Mathf.RoundToInt(request.Y.Value * scale));
        }

        if (Mode == ModeEnum.Minimized)
        {
            Mode = ModeEnum.Windowed;
        }

        Show();
        GrabFocus();
    }

    internal void RequestClose()
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

    private static Vector2I Scale(Vector2I value, float scale)
    {
        return new Vector2I(
            Mathf.RoundToInt(value.X * scale),
            Mathf.RoundToInt(value.Y * scale));
    }

    private static void OnIpcError(string error)
    {
        GD.PushError($"Developer Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Developer Kirie Eventa error: {error.Message}");
    }
}
