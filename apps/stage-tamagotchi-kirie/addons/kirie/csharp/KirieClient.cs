#nullable enable

using System;
using Godot;

public partial class KirieClient : GodotObject
{
    public const string PluginSingletonName = "Kirie";

    private readonly Callable _webViewReadyCallable;
    private readonly Callable _textReceivedCallable;
    private readonly Callable _binaryReceivedCallable;
    private readonly Callable _dataReceivedCallable;
    private readonly Callable _ipcErrorCallable;

    private readonly GodotObject? _pluginSingleton;
    private readonly GodotObject? _sceneNode;
    private readonly long _viewId;
    private bool _signalsDisconnected;

    public event Action? WebViewReady;
    public event Action<string>? TextReceived;
    public event Action<byte[]>? BinaryReceived;
    public event Action<Variant>? DataReceived;
    public event Action<string>? IpcError;

    public KirieClient()
    {
        _viewId = (long)GetInstanceId();
        _webViewReadyCallable = Callable.From<long>(OnPluginWebViewReady);
        _textReceivedCallable = Callable.From<long, string>(OnPluginTextReceived);
        _binaryReceivedCallable = Callable.From<long, byte[]>(OnPluginBinaryReceived);
        _dataReceivedCallable = Callable.From<long, Variant>(OnPluginDataReceived);
        _ipcErrorCallable = Callable.From<long, string>(OnPluginIpcError);

        if (!Engine.HasSingleton(PluginSingletonName))
        {
            GD.Print("[Kirie][cs] platform singleton unavailable");
            return;
        }

        _pluginSingleton = Engine.GetSingleton(PluginSingletonName);
        GD.Print("[Kirie][cs] platform singleton detected");
        ConnectPluginSignals();
    }

    private KirieClient(GodotObject sceneNode)
    {
        ArgumentNullException.ThrowIfNull(sceneNode);

        _sceneNode = sceneNode;
        _webViewReadyCallable = Callable.From(OnSceneWebViewReady);
        _textReceivedCallable = Callable.From<string>(OnSceneTextReceived);
        _binaryReceivedCallable = Callable.From<byte[]>(OnSceneBinaryReceived);
        _dataReceivedCallable = Callable.From<Variant>(OnSceneDataReceived);
        _ipcErrorCallable = Callable.From<string>(OnSceneIpcError);
        ConnectSceneSignals();
    }

    /// <summary>
    /// Creates a typed client that borrows an existing scene KirieNode.
    /// The node remains responsible for its WebView lifecycle and must outlive this client.
    /// </summary>
    public static KirieClient FromNode(GodotObject kirieNode)
    {
        return new KirieClient(kirieNode);
    }

    public bool IsAvailable => _sceneNode is not null
        ? (bool)_sceneNode.Call("is_available")
        : _pluginSingleton is not null;

    /// <summary>
    /// Enables browser pointer forwarding on a borrowed scene KirieNode.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// This client was created without <see cref="FromNode(GodotObject)"/>.
    /// </exception>
    public bool PointerInputForwardingEnabled
    {
        get
        {
            if (_sceneNode is null)
            {
                throw new InvalidOperationException(
                    "Pointer input forwarding requires a KirieClient borrowed from KirieNode.");
            }

            return _sceneNode.Get("pointer_input_forwarding_enabled").AsBool();
        }
        set
        {
            if (_sceneNode is null)
            {
                throw new InvalidOperationException(
                    "Pointer input forwarding requires a KirieClient borrowed from KirieNode.");
            }

            _sceneNode.Set("pointer_input_forwarding_enabled", value);
        }
    }

    public void CreateWebView(string initialUrl = "")
    {
        if (_sceneNode is not null)
        {
            if (initialUrl.Length == 0)
            {
                _sceneNode.Call("create_webview");
                return;
            }

            _sceneNode.Call(
                "create_webview",
                new Godot.Collections.Dictionary
                {
                    ["initial_url"] = initialUrl,
                });
            return;
        }

        if (!EnsurePluginSingleton(nameof(CreateWebView)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] create_webview initial_url={initialUrl}");
        _pluginSingleton!.Call("createWebView", _viewId, initialUrl);
    }

    public void DestroyWebView()
    {
        if (_sceneNode is not null)
        {
            _sceneNode.Call("destroy_webview");
            return;
        }

        if (!EnsurePluginSingleton(nameof(DestroyWebView)))
        {
            return;
        }

        GD.Print("[Kirie][cs] destroy_webview");
        _pluginSingleton!.Call("destroyWebView", _viewId);
    }

    public void LoadUrl(string url)
    {
        if (_sceneNode is not null)
        {
            _sceneNode.Call("load_url", url);
            return;
        }

        if (!EnsurePluginSingleton(nameof(LoadUrl)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] load_url url={url}");
        _pluginSingleton!.Call("loadUrl", _viewId, url);
    }

    public void LoadHtmlString(string html, string baseUrl = "")
    {
        if (_sceneNode is not null)
        {
            _sceneNode.Call("load_html_string", html, baseUrl);
            return;
        }

        if (!EnsurePluginSingleton(nameof(LoadHtmlString)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] load_html_string bytes={html.Length} base_url={baseUrl}");
        _pluginSingleton!.Call("loadHtmlString", _viewId, html, baseUrl);
    }

    public void SendText(string message)
    {
        if (_sceneNode is not null)
        {
            _sceneNode.Call("send_text", message);
            return;
        }

        if (!EnsurePluginSingleton(nameof(SendText)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_text bytes={message.Length}");
        _pluginSingleton!.Call("sendText", _viewId, message);
    }

    public void SendBinary(byte[] bytes)
    {
        if (_sceneNode is not null)
        {
            _sceneNode.Call("send_binary", bytes);
            return;
        }

        if (!EnsurePluginSingleton(nameof(SendBinary)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_binary bytes={bytes.Length}");
        _pluginSingleton!.Call("sendBinary", _viewId, bytes);
    }

    public void SendData(Variant value)
    {
        if (_sceneNode is not null)
        {
            _sceneNode.Call("send_data", value);
            return;
        }

        if (!EnsurePluginSingleton(nameof(SendData)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_data {value}");
        // Android plugin methods are registered by concrete JVM parameter type.
        // Godot does not expose a Kotlin-side Variant parameter type, and JVM Object
        // parameters do not reliably carry Variant containers. Use Godot's supported
        // Dictionary conversion path as a private carrier, then unwrap on Android
        // before CBOR encoding.
        switch (value.VariantType)
        {
            case Variant.Type.Nil:
            case Variant.Type.Bool:
            case Variant.Type.Int:
            case Variant.Type.Float:
            case Variant.Type.String:
            case Variant.Type.Array:
            case Variant.Type.Dictionary:
                break;
            default:
                GD.PushError($"Unsupported Kirie data type: {value.VariantType}");
                return;
        }

        _pluginSingleton!.Call(
            "sendData",
            _viewId,
            new Godot.Collections.Dictionary
            {
                ["value"] = value,
            });
    }

    public string GetLaunchOption(string key)
    {
        if (_sceneNode is not null)
        {
            return _sceneNode.Call("get_launch_option", key).AsString();
        }

        if (!EnsurePluginSingleton(nameof(GetLaunchOption)))
        {
            return string.Empty;
        }

        var value = _pluginSingleton!.Call("getLaunchOption", key).AsString();
        GD.Print($"[Kirie][cs] get_launch_option key={key} value={value}");
        return value;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            DisconnectSignals();
        }

        base.Dispose(disposing);
    }

    private void ConnectPluginSignals()
    {
        if (_pluginSingleton == null)
        {
            return;
        }

        ConnectPluginSignal("webview_ready", _webViewReadyCallable);
        ConnectPluginSignal("text_received", _textReceivedCallable);
        ConnectPluginSignal("binary_received", _binaryReceivedCallable);
        ConnectPluginSignal("data_received", _dataReceivedCallable);
        ConnectPluginSignal("ipc_error", _ipcErrorCallable);
    }

    private void ConnectPluginSignal(string signalName, Callable callback)
    {
        if (_pluginSingleton == null || !_pluginSingleton.HasSignal(signalName))
        {
            return;
        }

        _pluginSingleton.Connect(signalName, callback);
    }

    private void ConnectSceneSignals()
    {
        _sceneNode!.Connect("webview_ready", _webViewReadyCallable);
        _sceneNode.Connect("text_received", _textReceivedCallable);
        _sceneNode.Connect("binary_received", _binaryReceivedCallable);
        _sceneNode.Connect("data_received", _dataReceivedCallable);
        _sceneNode.Connect("ipc_error", _ipcErrorCallable);
    }

    private void DisconnectSignals()
    {
        if (_signalsDisconnected)
        {
            return;
        }

        _signalsDisconnected = true;
        if (_sceneNode is not null)
        {
            DisconnectSignal(_sceneNode, "webview_ready", _webViewReadyCallable);
            DisconnectSignal(_sceneNode, "text_received", _textReceivedCallable);
            DisconnectSignal(_sceneNode, "binary_received", _binaryReceivedCallable);
            DisconnectSignal(_sceneNode, "data_received", _dataReceivedCallable);
            DisconnectSignal(_sceneNode, "ipc_error", _ipcErrorCallable);
            return;
        }

        if (_pluginSingleton is null)
        {
            return;
        }

        DisconnectSignal(_pluginSingleton, "webview_ready", _webViewReadyCallable);
        DisconnectSignal(_pluginSingleton, "text_received", _textReceivedCallable);
        DisconnectSignal(_pluginSingleton, "binary_received", _binaryReceivedCallable);
        DisconnectSignal(_pluginSingleton, "data_received", _dataReceivedCallable);
        DisconnectSignal(_pluginSingleton, "ipc_error", _ipcErrorCallable);
    }

    private static void DisconnectSignal(GodotObject source, string signalName, Callable callback)
    {
        if (GodotObject.IsInstanceValid(source) && source.IsConnected(signalName, callback))
        {
            source.Disconnect(signalName, callback);
        }
    }

    private bool EnsurePluginSingleton(string methodName)
    {
        if (_pluginSingleton != null)
        {
            return true;
        }

        var error = $"Kirie platform singleton is not available for {methodName}()";
        GD.PushWarning(error);
        IpcError?.Invoke(error);
        return false;
    }

    private void OnPluginWebViewReady(long viewId)
    {
        if (viewId != _viewId)
            return;

        GD.Print("[Kirie][cs] signal webview_ready");
        WebViewReady?.Invoke();
    }

    private void OnPluginTextReceived(long viewId, string message)
    {
        if (viewId != _viewId)
            return;

        GD.Print($"[Kirie][cs] signal text_received {message}");
        TextReceived?.Invoke(message);
    }

    private void OnPluginBinaryReceived(long viewId, byte[] bytes)
    {
        if (viewId != _viewId)
            return;

        GD.Print($"[Kirie][cs] signal binary_received bytes={bytes.Length}");
        BinaryReceived?.Invoke(bytes);
    }

    private void OnPluginDataReceived(long viewId, Variant value)
    {
        if (viewId != _viewId)
            return;

        GD.Print($"[Kirie][cs] signal data_received {value}");
        DataReceived?.Invoke(value);
    }

    private void OnPluginIpcError(long viewId, string error)
    {
        if (viewId != _viewId)
            return;

        GD.Print($"[Kirie][cs] signal ipc_error {error}");
        IpcError?.Invoke(error);
    }

    private void OnSceneWebViewReady()
    {
        WebViewReady?.Invoke();
    }

    private void OnSceneTextReceived(string message)
    {
        TextReceived?.Invoke(message);
    }

    private void OnSceneBinaryReceived(byte[] bytes)
    {
        BinaryReceived?.Invoke(bytes);
    }

    private void OnSceneDataReceived(Variant value)
    {
        DataReceived?.Invoke(value);
    }

    private void OnSceneIpcError(string error)
    {
        IpcError?.Invoke(error);
    }
}
