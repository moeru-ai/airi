using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class Main : Node
{
    private const string PageUrl = "res://src-web/dist/index.html";
    private const string DevWebUrlOption = "kirie-web-url";

    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private OnboardingWindowManager? _onboarding;
    private SettingsWindowManager? _settings;
    private ChatWindowManager? _chat;
    private NoticeWindowManager? _notice;
    private AuthService? _auth;
    private IDisposable? _authRegistration;
    private IDisposable? _displaySnapshotRegistration;
    private WebViewPermissionHandler? _permissions;
    private IDisposable? _quitRegistration;
    private NativeWindowResizeController? _nativeResize;

    public override void _Ready()
    {
        var window = GetWindow();
        DesktopWindowSizing.ApplyInitialDisplayScale(window);
        _nativeResize = new NativeWindowResizeController(window);
        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            GD.PushError("Kirie is unavailable on this platform.");
            return;
        }

        var registry = AiriDesktopContracts.Register(
            GdKiriePlatform.Register(new KirieEventaJsonRegistry()));
        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, window);
        _displaySnapshotRegistration = CurrentDisplaySnapshotService.Attach(
            _eventa.Context,
            window);
        _auth = new AuthService();
        _authRegistration = _auth.Attach(_eventa.Context);
        _quitRegistration = _eventa.Context.RegisterInvokeHandler(
            AiriDesktopEvents.QuitApp,
            (EmptyPayload _, CancellationToken _) =>
            {
                GetTree().Quit();
                return Task.FromResult(new EmptyPayload());
            });

        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;

        string initialUrl;
        try
        {
            var rendererUrl = ResolveInitialUrl();
            initialUrl = RendererUrl.ForMain(rendererUrl);
            _permissions = new WebViewPermissionHandler(_kirie, rendererUrl, "microphone");
            _onboarding = new OnboardingWindowManager(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl,
                _auth);
            _settings = new SettingsWindowManager(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl,
                _auth);
            _chat = new ChatWindowManager(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl);
            _notice = new NoticeWindowManager(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl);
        }
        catch (InvalidOperationException error)
        {
            GD.PushError(error.Message);
            return;
        }

        GD.Print($"create_webview initial_url={initialUrl}");
        _kirie.CreateWebView(initialUrl);
    }

    public override void _ExitTree()
    {
        _nativeResize?.Dispose();
        _quitRegistration?.Dispose();
        _authRegistration?.Dispose();
        _displaySnapshotRegistration?.Dispose();
        _auth?.Dispose();
        _notice?.Dispose();
        _chat?.Dispose();
        _settings?.Dispose();
        _onboarding?.Dispose();
        _permissions?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
    }

    public override void _Process(double delta)
    {
        _auth?.ProcessPending();
    }

    private string ResolveInitialUrl()
    {
        var launchUrl = _kirie!.GetLaunchOption(DevWebUrlOption).Trim();
        if (launchUrl.Length > 0)
        {
            return launchUrl;
        }

        var environmentUrl = OS.GetEnvironment("KIRIE_WEB_URL").Trim();
        return environmentUrl.Length > 0 ? environmentUrl : PageUrl;
    }

    private static void OnWebViewReady()
    {
        GD.Print("signal webview_ready");
    }

    private static void OnIpcError(string error)
    {
        GD.PushError($"Kirie IPC error: {error}");
    }

    private static void OnEventaError(KirieEventaError error)
    {
        GD.PushError($"Kirie Eventa error: {error.Message}");
    }
}
