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

    public override void _Ready()
    {
        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            GD.PushError("Kirie is unavailable on this platform.");
            return;
        }

        var registry = AiriDesktopContracts.Register(
            GdKiriePlatform.Register(new KirieEventaJsonRegistry()));
        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, GetWindow());

        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += OnIpcError;
        _eventa.Adapter.Error += OnEventaError;

        string initialUrl;
        try
        {
            var rendererUrl = ResolveInitialUrl();
            initialUrl = RendererUrl.ForMain(rendererUrl);
            GetWindow().GuiEmbedSubwindows = false;
            _onboarding = new OnboardingWindowManager(
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
        _onboarding?.Dispose();
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
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
