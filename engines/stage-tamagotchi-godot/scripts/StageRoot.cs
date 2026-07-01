using System;
using System.Text.Json;
using System.Text.Json.Serialization;
using Godot;

/// <summary>
/// Root node for the Godot sidecar stage runtime.
/// </summary>
///
/// Call stack:
///
/// Godot scene tree
///   -> <see cref="_Ready"/>
///     -> <see cref="StageBridge.Connect"/>
///   -> <see cref="_Process"/>
///     -> <see cref="StageBridge.Poll"/>
///       -> <see cref="HandleMessage"/>
public partial class StageRoot : Node3D
{
    private const string AvatarRootNodeName = "AvatarRoot";
    private const string CameraNodeName = "Camera3D";
    private const string EditorPreviewRootNodeName = "EditorPreviewRoot";
    private const string WebSocketUrlArgumentPrefix = "--airi-ws-url=";

    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    private StageBridge _bridge = null!;
    private StageSceneController _sceneController = null!;
    private StageViewController _viewController = null!;
    private StageCameraInputController _cameraInputController = null!;
    private StageAvatarGlowRuntime _avatarGlowRuntime = null!;
    private StageViewRuntime _viewRuntime = null!;
    private string _activeSceneModelId;
    private bool _shutdownRequested;

    /// <inheritdoc/>
    public override void _Ready()
    {
        HideEditorPreviewRoot();
        StageVisualPreset.Apply(this);

        var avatarRoot = ResolveAvatarRoot();
        var camera = ResolveCamera();
        _sceneController = new StageSceneController(avatarRoot, new VrmAvatarLoader());
        InitializeViewRuntime(avatarRoot, camera);
        _avatarGlowRuntime = new StageAvatarGlowRuntime(camera);

        var webSocketUrl = ResolveWebSocketUrl();
        if (string.IsNullOrWhiteSpace(webSocketUrl))
        {
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
            GD.PushError($"Godot stage failed to connect to Electron main: {connectError}.");
            GetTree().Quit();
            return;
        }
    }

    /// <inheritdoc/>
    public override void _Process(double delta)
    {
        if (_bridge == null)
        {
            return;
        }

        _bridge.Poll();
        _viewRuntime?.Process(delta);
        _cameraInputController?.Process(delta);
    }

    /// <inheritdoc/>
    public override void _ExitTree()
    {
        _avatarGlowRuntime?.Dispose();
    }

    /// <inheritdoc/>
    public override void _Input(InputEvent @event)
    {
        _cameraInputController?.HandleInput(@event);
    }

    private void HandleBridgeOpened()
    {
        _bridge.SendEnvelope("stage.ready");
    }

    private void HandleBridgeClosed(string message)
    {
        if (_shutdownRequested)
        {
            GetTree().Quit();
            return;
        }

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

    private Camera3D ResolveCamera()
    {
        var camera = GetNodeOrNull<Camera3D>(CameraNodeName);
        if (camera != null)
        {
            return camera;
        }

        camera = new Camera3D
        {
            Current = true,
            Name = CameraNodeName,
        };
        AddChild(camera);
        return camera;
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
                case "host.view.patch":
                    ApplyViewPatch(envelope.Payload);
                    break;
                case "host.view.request_snapshot":
                    RequestViewSnapshot(envelope.Payload);
                    break;
                case "host.shutdown":
                    _shutdownRequested = true;
                    GetTree().Quit();
                    break;
            }
        }
        catch (Exception error)
        {
            var message = $"Failed to parse Electron message: {error.Message}";
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

            if (_viewRuntime?.HasViewState == true
                && string.Equals(_activeSceneModelId, payload.ModelId, StringComparison.Ordinal))
            {
                _viewRuntime.EmitLoadedSnapshot();
            }
            else
            {
                // TODO:
                // Make avatar apply and view bootstrap one transaction. Today avatar apply commits
                // before bootstrap. If bootstrap fails, scene.error is reported with the new
                // avatar already loaded.
                var avatar = _sceneController.Apply(payload);
                _viewController?.UseAvatar(avatar);
                _avatarGlowRuntime?.UseAvatar(avatar);
                _viewRuntime?.BootstrapForAvatar();
                _activeSceneModelId = payload.ModelId;
            }

            _bridge.SendEnvelope("scene.applied", new
            {
                modelId = payload.ModelId,
            });
        }
        catch (Exception error)
        {
            var message = $"Failed to apply scene input: {error.Message}";
            SendSceneError(message);
        }
    }

    private void ApplyViewPatch(JsonElement? payloadElement)
    {
        if (payloadElement == null)
        {
            _viewRuntime?.EmitInvalidPayload("View patch payload was empty.");
            return;
        }

        var requestId = StageViewJson.TryReadRequestId(payloadElement.Value);
        try
        {
            var payload = StageViewJson.ParsePatchRequest(payloadElement.Value);
            _viewRuntime.ApplyRemotePatch(payload);
        }
        catch (Exception error)
        {
            _viewRuntime?.EmitInvalidPayload(error.Message, requestId);
        }
    }

    private void RequestViewSnapshot(JsonElement? payloadElement)
    {
        if (payloadElement == null)
        {
            _viewRuntime?.EmitInvalidPayload("View snapshot request payload was empty.");
            return;
        }

        var requestId = StageViewJson.TryReadRequestId(payloadElement.Value);
        try
        {
            var payload = StageViewJson.ParseSnapshotRequest(payloadElement.Value);
            _viewRuntime.RequestSnapshot(payload);
        }
        catch (Exception error)
        {
            _viewRuntime?.EmitInvalidPayload(error.Message, requestId);
        }
    }

    private static string ResolveWebSocketUrl()
    {
        return ResolveArgumentValue(WebSocketUrlArgumentPrefix);
    }

    private static string ResolveArgumentValue(string prefix)
    {
        var arguments = OS.GetCmdlineUserArgs();
        if (arguments.Length == 0)
        {
            arguments = OS.GetCmdlineArgs();
        }

        foreach (var argument in arguments)
        {
            if (argument.StartsWith(prefix, StringComparison.Ordinal))
            {
                return argument[prefix.Length..];
            }
        }

        return string.Empty;
    }

    private void InitializeViewRuntime(Node3D avatarRoot, Camera3D camera)
    {
        var cameraController = new StageCameraPoseController(camera);
        _viewController = new StageViewController(avatarRoot, cameraController);
        _viewRuntime = new StageViewRuntime(_viewController);
        _viewRuntime.SnapshotReady += payload =>
            _bridge.SendEnvelope("stage.view.snapshot", payload);
        _viewRuntime.ErrorReady += payload => _bridge.SendEnvelope("stage.view.error", payload);
        _cameraInputController = new StageCameraInputController(_viewRuntime, cameraController);
    }

    private void SendSceneError(string message)
    {
        _bridge.SendEnvelope("scene.error", new
        {
            message,
        });
    }
}
