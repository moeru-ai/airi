using Eventa;
using GdKirie.EventaAdapter;
using Godot;
using NetHttpClient = System.Net.Http.HttpClient;

internal sealed class DeveloperToolsService : IDisposable
{
    private const int DefaultRemoteDevtoolsPort = 9229;
    private const string RemoteDevtoolsPortSetting = "godot_cef/debug/remote_devtools_port";
    private const string WindowScenePath = "res://src-godot/developer-window.tscn";

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly string _rendererUrl;
    private readonly NetHttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(2),
    };
    private readonly HashSet<Binding> _bindings = [];
    private readonly Dictionary<string, DeveloperWindow> _windows = [];
    private bool _disposed;

    public DeveloperToolsService(
        Node owner,
        Window mainWindow,
        KirieEventaJsonRegistry registry,
        string rendererUrl)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _registry = registry;
        _rendererUrl = rendererUrl;
    }

    public IDisposable Attach(IEventContext context)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var binding = new Binding(this, context);
        _bindings.Add(binding);
        return binding;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        foreach (var binding in _bindings.ToArray())
        {
            binding.Dispose();
        }

        foreach (var window in _windows.Values.ToArray())
        {
            window.RequestClose();
        }

        _windows.Clear();
        _http.Dispose();
    }

    private async Task OpenWebInspector(CancellationToken cancellationToken)
    {
        if (!OS.IsDebugBuild())
        {
            throw new InvalidOperationException("The CEF web inspector is available only in debug builds.");
        }

        var port = ProjectSettings.GetSetting(
            RemoteDevtoolsPortSetting,
            DefaultRemoteDevtoolsPort).AsInt32();
        if (port is < 1 or > 65535)
        {
            throw new InvalidOperationException($"The CEF remote debugging port is invalid: {port}.");
        }

        var targetsEndpoint = new UriBuilder(
            Uri.UriSchemeHttp,
            "127.0.0.1",
            port,
            "/json/list").Uri;
        var targetsJson = await _http.GetStringAsync(targetsEndpoint, cancellationToken);
        var inspectorUri = CefInspectorTarget.SelectMainInspectorUri(targetsJson);
        var result = OS.ShellOpen(inspectorUri.AbsoluteUri);
        if (result != Error.Ok)
        {
            throw new InvalidOperationException($"The system browser could not open the CEF web inspector: {result}.");
        }
    }

    private void OpenWindow(OpenDevtoolsWindowPayload request)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ValidateWindowRequest(request);
        if (!_windows.TryGetValue(request.Key, out var window)
            || !GodotObject.IsInstanceValid(window)
            || window.IsQueuedForDeletion())
        {
            var scene = ResourceLoader.Load<PackedScene>(WindowScenePath)
                ?? throw new InvalidOperationException($"The developer window scene is missing: {WindowScenePath}");
            window = scene.Instantiate<DeveloperWindow>();
            _windows[request.Key] = window;
            try
            {
                _owner.AddChild(window);
                window.CurrentScreen = _mainWindow.CurrentScreen;
                window.Initialize(
                    _registry,
                    _rendererUrl,
                    request,
                    () => OnWindowClosed(request.Key, window));
            }
            catch
            {
                window.QueueFree();
                _windows.Remove(request.Key);
                throw;
            }
        }

        window.Open(_mainWindow.CurrentScreen, request);
    }

    private static void ValidateWindowRequest(OpenDevtoolsWindowPayload request)
    {
        if (string.IsNullOrWhiteSpace(request.Key))
        {
            throw new ArgumentException("The developer window key must not be empty.", nameof(request));
        }

        var route = request.Route ?? "/devtools";
        if (!StringComparer.Ordinal.Equals(route, "/devtools")
            && !route.StartsWith("/devtools/", StringComparison.Ordinal))
        {
            throw new ArgumentException("The developer window route must start with /devtools.", nameof(request));
        }

        if (request.Width is <= 0 || request.Height is <= 0)
        {
            throw new ArgumentException("The developer window size must be positive.", nameof(request));
        }
    }

    private void OnWindowClosed(string key, DeveloperWindow window)
    {
        if (_windows.TryGetValue(key, out var current) && current == window)
        {
            _windows.Remove(key);
        }
    }

    private void Detach(Binding binding)
    {
        _bindings.Remove(binding);
    }

    private sealed class Binding : IDisposable
    {
        private readonly DeveloperToolsService _owner;
        private readonly IDisposable _openWebInspector;
        private readonly IDisposable _openDevtools;
        private bool _disposed;

        public Binding(DeveloperToolsService owner, IEventContext context)
        {
            _owner = owner;
            _openWebInspector = context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenMainDevtools,
                async (EmptyPayload _, CancellationToken cancellationToken) =>
                {
                    await owner.OpenWebInspector(cancellationToken);
                    return new EmptyPayload();
                });
            _openDevtools = context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenDevtoolsWindow,
                (OpenDevtoolsWindowPayload payload, CancellationToken _) =>
                {
                    owner.OpenWindow(payload);
                    return Task.FromResult(new EmptyPayload());
                });
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            _openDevtools.Dispose();
            _openWebInspector.Dispose();
            _owner.Detach(this);
        }
    }
}
