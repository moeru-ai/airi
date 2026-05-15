using System;
using System.Text.Json;
using Godot;

/// <summary>
/// Root node for the Godot sidecar stage runtime.
///
/// Use when:
/// - Running the desktop Godot stage through Electron main.
/// - Receiving scene input from the current stage settings model selection.
///
/// Expects:
/// - Electron launches Godot with <c>--airi-ws-url=&lt;runtime-url&gt;</c>.
/// - The scene contains or can create an avatar root node.
///
/// Returns:
/// - A running stage process that reports ready/applied/error envelopes to Electron main.
///
/// Call stack:
///
/// Godot scene tree
///   -> <see cref="_Ready"/>
///     -> <see cref="StageBridge.Connect"/>
///   -> <see cref="_Process"/>
///     -> <see cref="StageBridge.Poll"/>
///       -> <see cref="HandleMessage"/>
/// </summary>
public partial class StageRoot : Node3D
{
    private const string AvatarRootNodeName = "AvatarRoot";
    private const string EditorPreviewRootNodeName = "EditorPreviewRoot";
    private const string WebSocketUrlArgumentPrefix = "--airi-ws-url=";

    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private StageBridge _bridge = null!;
    private StageSceneController _sceneController = null!;
    private Label3D _statusLabel = null!;
    private bool _shutdownRequested;

    /// <inheritdoc/>
    public override void _Ready()
    {
        HideEditorPreviewRoot();
        _statusLabel = CreateStatusLabel();
        AddChild(_statusLabel);

        _sceneController = new StageSceneController(ResolveAvatarRoot(), new VrmAvatarLoader());

        var webSocketUrl = ResolveWebSocketUrl();
        if (string.IsNullOrWhiteSpace(webSocketUrl))
        {
            UpdateStatus("Missing Electron bridge URL.");
            GD.PushWarning("Godot stage missing --airi-ws-url argument.");
            return;
        }

        _bridge = new StageBridge(_jsonOptions);
        _bridge.Opened += HandleBridgeOpened;
        _bridge.MessageReceived += HandleMessage;
        _bridge.Closed += HandleBridgeClosed;

        var connectError = _bridge.Connect(webSocketUrl);
        if (connectError != Error.Ok)
        {
            UpdateStatus("Failed to connect to Electron main.");
            GD.PushError($"Godot stage failed to connect to {webSocketUrl}: {connectError}.");
            GetTree().Quit();
            return;
        }

        UpdateStatus("Connecting to Electron main...");
    }

    /// <inheritdoc/>
    public override void _Process(double delta)
    {
        if (_bridge == null)
        {
            return;
        }

        _bridge.Poll();
    }

    private void HandleBridgeOpened()
    {
        _bridge.SendEnvelope("stage.ready");
        UpdateStatus("Connected to Electron main.");
    }

    private void HandleBridgeClosed(string message)
    {
        if (_shutdownRequested)
        {
            GetTree().Quit();
            return;
        }

        UpdateStatus(message);
        GD.PushWarning(message);
        GetTree().Quit();
    }

    private Node3D ResolveAvatarRoot()
    {
        var avatarRoot = GetNodeOrNull<Node3D>(AvatarRootNodeName);
        if (avatarRoot != null)
        {
            return avatarRoot;
        }

        avatarRoot = new Node3D
        {
            Name = AvatarRootNodeName,
        };
        AddChild(avatarRoot);
        return avatarRoot;
    }

    private void HideEditorPreviewRoot()
    {
        var editorPreviewRoot = GetNodeOrNull<Node3D>(EditorPreviewRootNodeName);
        if (editorPreviewRoot == null)
        {
            return;
        }

        editorPreviewRoot.Visible = false;
        editorPreviewRoot.ProcessMode = ProcessModeEnum.Disabled;
    }

    private static Label3D CreateStatusLabel()
    {
        return new Label3D
        {
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
            FontSize = 34,
            Modulate = new Color(0.95f, 0.98f, 1.0f),
            PixelSize = 0.0035f,
            Position = new Vector3(-1.45f, 1.75f, 0.0f),
            Text = "Godot Stage (experimental)",
        };
    }

    private void HandleMessage(string rawMessage)
    {
        try
        {
            var envelope = JsonSerializer.Deserialize<StageEnvelope>(rawMessage, _jsonOptions);
            if (envelope == null || string.IsNullOrWhiteSpace(envelope.Type))
            {
                return;
            }

            switch (envelope.Type)
            {
                case "host.scene.apply":
                    ApplySceneInput(envelope.Payload);
                    break;
                case "host.shutdown":
                    _shutdownRequested = true;
                    UpdateStatus("Shutdown requested by Electron main.");
                    GetTree().Quit();
                    break;
            }
        }
        catch (Exception error)
        {
            var message = $"Failed to parse Electron message: {error.Message}";
            UpdateStatus(message);
            SendSceneError(message);
        }
    }

    private void ApplySceneInput(JsonElement? payloadElement)
    {
        if (payloadElement == null)
        {
            SendSceneError("Scene input payload was empty.");
            return;
        }

        try
        {
            var payload = payloadElement.Value.Deserialize<StageSceneApplyPayload>(_jsonOptions);
            if (payload == null)
            {
                throw new InvalidOperationException("Scene input payload could not be parsed.");
            }

            _sceneController.Apply(payload);
            var fileName = System.IO.Path.GetFileName(payload.Path);
            UpdateStatus($"Connected to Electron main.\nModel: {payload.Name}\nAsset: {fileName}");

            _bridge.SendEnvelope("scene.applied", new
            {
                modelId = payload.ModelId,
            });
        }
        catch (Exception error)
        {
            var message = $"Failed to apply scene input: {error.Message}";
            UpdateStatus(message);
            SendSceneError(message);
        }
    }

    private static string ResolveWebSocketUrl()
    {
        string[] arguments = OS.GetCmdlineUserArgs();
        if (arguments.Length == 0)
        {
            arguments = OS.GetCmdlineArgs();
        }

        foreach (var argument in arguments)
        {
            if (argument.StartsWith(WebSocketUrlArgumentPrefix, StringComparison.Ordinal))
            {
                return argument[WebSocketUrlArgumentPrefix.Length..];
            }
        }

        return string.Empty;
    }

    private void SendSceneError(string message)
    {
        _bridge.SendEnvelope("scene.error", new
        {
            message,
        });
    }

    private void UpdateStatus(string message) =>
        _statusLabel.Text = $"Godot Stage (experimental)\n{message}";
}
