using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class NoticeWindow : Window
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private WebViewPermissionHandler? _permissions;
    private IDisposable? _actionRegistration;
    private IDisposable? _mountedRegistration;
    private IDisposable? _unmountedRegistration;
    private Action? _onClosed;
    private string? _rendererUrl;
    private NoticePendingPayload? _pending;
    private TaskCompletionSource<bool>? _completion;
    private CancellationTokenRegistration _cancellationRegistration;
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
            throw new InvalidOperationException("The notice window must be inside the scene tree before initialization.");
        }

        if (_kirie is not null)
        {
            throw new InvalidOperationException("The notice window is already initialized.");
        }

        _onClosed = onClosed;
        _rendererUrl = rendererUrl;
        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            throw new InvalidOperationException("Kirie is unavailable for the notice window.");
        }

        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, this);
        _permissions = new WebViewPermissionHandler(_kirie, rendererUrl);
        _actionRegistration = _eventa.Context.RegisterInvokeHandler(
            AiriDesktopEvents.NoticeAction,
            (NoticeActionPayload payload, CancellationToken _) =>
            {
                HandleAction(payload);
                return Task.FromResult(new EmptyPayload());
            });
        _mountedRegistration = _eventa.Context.RegisterInvokeHandler(
            AiriDesktopEvents.NoticePageMounted,
            (NoticePagePayload payload, CancellationToken _) =>
                Task.FromResult(Mounted(payload)));
        _unmountedRegistration = _eventa.Context.RegisterInvokeHandler(
            AiriDesktopEvents.NoticePageUnmounted,
            (NoticePagePayload payload, CancellationToken _) =>
            {
                HandleUnmounted(payload);
                return Task.FromResult(new EmptyPayload());
            });

        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;
        CloseRequested += CloseWithoutAction;
    }

    internal Task<bool> Open(
        int screen,
        string id,
        NoticeOpenPayload payload,
        CancellationToken cancellationToken)
    {
        if (_pending is not null)
        {
            if (!StringComparer.Ordinal.Equals(_pending.Id, id))
            {
                throw new InvalidOperationException("Another notice is already open.");
            }

            CurrentScreen = screen;
            ShowAndFocusIfReady();
            return _completion!.Task;
        }

        _pending = new NoticePendingPayload(id, payload.Type, payload.Payload);
        _completion = new TaskCompletionSource<bool>();
        CurrentScreen = screen;
        _showRequested = true;
        _cancellationRegistration = cancellationToken.Register(CloseWithoutAction);
        if (_closing)
        {
            return _completion.Task;
        }

        _kirie!.CreateWebView(RendererUrl.ForFollowerRoute(
            _rendererUrl!,
            $"{payload.Route}?id={Uri.EscapeDataString(id)}"));
        ShowAndFocusIfReady();
        return _completion.Task;
    }

    internal void CloseWithoutAction()
    {
        Complete(false);
    }

    public override void _ExitTree()
    {
        CloseRequested -= CloseWithoutAction;
        if (_kirie is not null)
        {
            _kirie.WebViewReady -= OnWebViewReady;
            _kirie.IpcError -= OnIpcError;
        }

        if (_eventa is not null)
        {
            _eventa.Adapter.Error -= OnEventaError;
        }

        _unmountedRegistration?.Dispose();
        _mountedRegistration?.Dispose();
        _actionRegistration?.Dispose();
        _permissions?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
        _cancellationRegistration.Unregister();
        _completion?.TrySetResult(false);
        _onClosed?.Invoke();
    }

    private NoticePendingPayload? Mounted(NoticePagePayload payload)
    {
        if (_pending is null)
        {
            return null;
        }

        return string.IsNullOrEmpty(payload.Id)
            || StringComparer.Ordinal.Equals(payload.Id, _pending.Id)
            ? _pending
            : null;
    }

    private void HandleAction(NoticeActionPayload payload)
    {
        if (_pending is null || !StringComparer.Ordinal.Equals(payload.Id, _pending.Id))
        {
            throw new ArgumentException("The notice action does not match the open notice.", nameof(payload));
        }

        var confirmed = payload.Action switch
        {
            "confirm" => true,
            "cancel" or "close" => false,
            _ => throw new ArgumentException("The notice action is invalid.", nameof(payload)),
        };
        Complete(confirmed);
    }

    private void HandleUnmounted(NoticePagePayload payload)
    {
        if (_pending is null
            || (!string.IsNullOrEmpty(payload.Id)
                && !StringComparer.Ordinal.Equals(payload.Id, _pending.Id)))
        {
            return;
        }

        Complete(false);
    }

    private void OnWebViewReady()
    {
        _ready = true;
        ShowAndFocusIfReady();
    }

    private void ShowAndFocusIfReady()
    {
        if (!_ready || !_showRequested)
        {
            return;
        }

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

    private void Complete(bool confirmed)
    {
        if (_closing)
        {
            return;
        }

        _closing = true;
        _showRequested = false;
        _cancellationRegistration.Unregister();
        _completion?.TrySetResult(confirmed);
        Hide();
        QueueFree();
    }

    private static void OnIpcError(string error)
    {
        GD.PushError($"Notice Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Notice Kirie Eventa error: {error.Message}");
    }
}
