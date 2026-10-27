using Eventa;
using GdKirie.EventaAdapter;
using GdKirie.Notifications;
using GdKirie.Platform;
using GdKirie.Tray;
using Godot;

public partial class Main : Node
{
    private const string PageUrl = "res://src-web/dist/index.html";
    private const string DevWebUrlOption = "kirie-web-url";

    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;
    private GdKirieNotificationsHost? _notifications;
    private OnboardingWindowManager? _onboarding;
    private SettingsWindowManager? _settings;
    private ChatWindowManager? _chat;
    private WidgetWindowManager? _widgets;
    private SpotlightHost? _spotlight;
    private NoticeWindowManager? _notice;
    private TrayHost? _tray;
    private IDisposable? _trayLabelsRegistration;
    private DeveloperToolsService? _developerTools;
    private IDisposable? _developerToolsRegistration;
    private AuthService? _auth;
    private IDisposable? _authRegistration;
    private IDisposable? _displaySnapshotRegistration;
    private WebViewPermissionHandler? _permissions;
    private MicrophonePermissionService? _microphonePermissions;
    private IDisposable? _microphonePermissionRegistration;
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

        var registry = WidgetContracts.Register(
            AiriDesktopContracts.Register(
                GdKirieNotifications.Register(
                    GdKiriePlatform.Register(new KirieEventaJsonRegistry()))));
        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, window);
        _notifications = GdKirieNotifications.Attach(_eventa.Context, window);
        _displaySnapshotRegistration = CurrentDisplaySnapshotService.Attach(
            _eventa.Context,
            window);
        _auth = new AuthService();
        _authRegistration = _auth.Attach(_eventa.Context);
        _microphonePermissions = new MicrophonePermissionService();
        _microphonePermissionRegistration = _microphonePermissions.Attach(
            _eventa.Context,
            ownsPrompt: true);
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
        AboutWindowManager about;
        try
        {
            var rendererUrl = ResolveInitialUrl();
            initialUrl = RendererUrl.ForMain(rendererUrl);
            _permissions = new WebViewPermissionHandler(
                _kirie,
                rendererUrl,
                _microphonePermissions);
            _widgets = new WidgetWindowManager(_eventa.Context, this, window,
                registry, rendererUrl, _microphonePermissions);
            _developerTools = new DeveloperToolsService(
                this,
                GetWindow(),
                registry,
                rendererUrl,
                _microphonePermissions,
                _widgets);
            _developerToolsRegistration = _developerTools.Attach(_eventa.Context);
            _onboarding = new OnboardingWindowManager(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl,
                _auth,
                _microphonePermissions);
            _chat = new ChatWindowManager(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl,
                _microphonePermissions);
            _spotlight = new SpotlightHost(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl,
                _microphonePermissions,
                _chat);
            _settings = new SettingsWindowManager(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl,
                _auth,
                _microphonePermissions,
                _developerTools,
                _spotlight,
                _widgets);
            about = new AboutWindowManager(
                this,
                window,
                registry,
                rendererUrl,
                _microphonePermissions);
            _notice = new NoticeWindowManager(
                _eventa.Context,
                this,
                GetWindow(),
                registry,
                rendererUrl,
                _microphonePermissions);
        }
        catch (InvalidOperationException error)
        {
            GD.PushError(error.Message);
            return;
        }

        try
        {
            _tray = new TrayHost(
                this,
                window,
                _settings,
                about,
                () => GetTree().Quit());
        }
        catch (Exception error) when (error is TrayException or InvalidOperationException)
        {
            // The application stays usable without a tray, for example on Linux without
            // a StatusNotifierItem host.
            GD.PushError($"The system tray is unavailable: {error.Message}");
        }

        // The main renderer awaits this invoke, and an unanswered invoke never settles.
        // Answer it also when the platform has no tray.
        _trayLabelsRegistration = _eventa.Context.RegisterInvokeHandler(
            AiriDesktopEvents.SetTrayLabels,
            (TrayLabelsPayload labels, CancellationToken _) =>
            {
                _tray?.ApplyLabels(labels);
                return Task.FromResult(new EmptyPayload());
            });

        GD.Print($"create_webview initial_url={initialUrl}");
        _kirie.CreateWebView(initialUrl);
    }

    public override void _Input(InputEvent inputEvent)
    {
        _nativeResize?.HandleInput(inputEvent);
    }

    public override void _ExitTree()
    {
        _nativeResize?.Dispose();
        _trayLabelsRegistration?.Dispose();
        _tray?.Dispose();
        _quitRegistration?.Dispose();
        _authRegistration?.Dispose();
        _displaySnapshotRegistration?.Dispose();
        _auth?.Dispose();
        _notice?.Dispose();
        _spotlight?.Dispose();
        _widgets?.Dispose();
        _chat?.Dispose();
        _settings?.Dispose();
        _onboarding?.Dispose();
        _developerToolsRegistration?.Dispose();
        _developerTools?.Dispose();
        _microphonePermissions?.Dispose();
        _microphonePermissionRegistration?.Dispose();
        _permissions?.Dispose();
        _notifications?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
    }

    public override void _Process(double delta)
    {
        _widgets?.Process();
        _tray?.Process();
        _auth?.ProcessPending();
        _microphonePermissions?.Process();
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
