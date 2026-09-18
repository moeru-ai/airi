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
    private DeveloperWindowRequest? _request;
    private bool _ready;
    private bool _closing;
    private bool _showRequested;

    internal void Initialize(
        KirieEventaJsonRegistry registry,
        string rendererUrl,
        DeveloperWindowRequest request,
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
        Title = request.Title;
        MinSize = new Vector2I(request.MinWidth, request.MinHeight);
        Size = new Vector2I(request.Width, request.Height);
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

        var initialUrl = request.UsesMinimalRuntime
            ? RendererUrl.ForMinimalFollowerRoute(rendererUrl, request.Route)
            : RendererUrl.ForFollowerRoute(rendererUrl, request.Route);
        _kirie.CreateWebView(initialUrl);
    }

    internal void Open(int screen, DeveloperWindowRequest request)
    {
        CurrentScreen = screen;
        _request = request;
        _showRequested = true;
        if (_ready)
        {
            ShowAndFocus();
        }
    }

    internal void Close()
    {
        RequestClose();
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
        MinSize = Scale(new Vector2I(request.MinWidth, request.MinHeight), scale);
        Size = Scale(new Vector2I(request.Width, request.Height), scale);
        DesktopWindowSizing.FitDecoratedSizeToInitialSize(this);

        if (request.X is null && request.Y is null)
        {
            DesktopWindowSizing.MoveToUsableCenter(this);
        }
        else
        {
            DesktopWindowSizing.MoveToUsableCenter(this);
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
