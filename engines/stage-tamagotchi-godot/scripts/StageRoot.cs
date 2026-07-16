using System;
using System.Collections.Generic;
using System.IO;
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
    private const int DevRenderExportSettleFrames = 2;

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
    private StageRenderEffectsRuntime _renderEffectsRuntime = null!;
    private StageViewRuntime _viewRuntime = null!;
    private StageDevObservationAdapter _devObservationAdapter;
    private string _activeSceneModelId;
    private StageSceneApplyPayload _activeScenePayload;
    private StageViewCapturePngRequestPayload _pendingViewCapture;
    private int _pendingViewCaptureFrames;
    private DevRenderExportRun _pendingDevRenderExport;
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
        _renderEffectsRuntime = new StageRenderEffectsRuntime(camera);

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

        StartDevObservationAdapterIfEnabled();
    }

    /// <inheritdoc/>
    public override void _Process(double delta)
    {
        if (_bridge == null)
        {
            return;
        }

        _bridge.Poll();
        _devObservationAdapter?.Poll();
        _viewRuntime?.Process(delta);
        _cameraInputController?.Process(delta);
        ProcessPendingViewCapture();
        ProcessPendingDevRenderExport();
    }

    /// <inheritdoc/>
    public override void _ExitTree()
    {
        _devObservationAdapter?.Dispose();
        _renderEffectsRuntime?.Dispose();
    }

    /// <inheritdoc/>
    public override void _Input(InputEvent @event)
    {
        _cameraInputController?.HandleInput(@event);
    }

    private void HandleBridgeOpened()
    {
        if (_devObservationAdapter != null)
        {
            _devObservationAdapter.AiriBridgeConnected = true;
        }

        _bridge.SendEnvelope("stage.ready");
    }

    private void HandleBridgeClosed(string message)
    {
        if (_devObservationAdapter != null)
        {
            _devObservationAdapter.AiriBridgeConnected = false;
        }

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
                case "host.view.capture_png":
                    QueueViewPngCapture(envelope.Payload);
                    break;
                case "host.render.set_debug_view":
                    SetRenderDebugView(envelope.Payload);
                    break;
                case "host.render.set_avatar_edge_light":
                    SetAvatarEdgeLight(envelope.Payload);
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
                _renderEffectsRuntime?.UseAvatar(avatar);
                _viewRuntime?.BootstrapForAvatar();
                _activeSceneModelId = payload.ModelId;
            }

            _activeScenePayload = payload;

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

    private void QueueViewPngCapture(JsonElement? payloadElement)
    {
        if (payloadElement == null)
        {
            SendViewCaptureError("View PNG capture request payload was empty.");
            return;
        }

        var requestId = StageViewJson.TryReadRequestId(payloadElement.Value);
        try
        {
            if (_pendingViewCapture != null)
            {
                throw new InvalidOperationException("A viewport PNG capture is already pending.");
            }

            var payload = StageViewJson.ParseCapturePngRequest(payloadElement.Value);
            _pendingViewCapture = payload;
            _pendingViewCaptureFrames = payload.SettleFrames;
        }
        catch (Exception error)
        {
            SendViewCaptureError(error.Message, requestId);
        }
    }

    private void SetRenderDebugView(JsonElement? payloadElement)
    {
        if (payloadElement == null)
        {
            SendRenderDebugViewError("Render debug view request payload was empty.");
            return;
        }

        var requestId = StageViewJson.TryReadRequestId(payloadElement.Value);
        try
        {
            var payload = StageViewJson.ParseRenderDebugViewRequest(payloadElement.Value);
            var appliedView = _renderEffectsRuntime.SetDebugView(payload.View);
            _bridge.SendEnvelope("stage.render.debug_view", new StageRenderDebugViewPayload(
                payload.RequestId,
                appliedView
            ));
        }
        catch (Exception error)
        {
            SendRenderDebugViewError(error.Message, requestId);
        }
    }

    private void SetAvatarEdgeLight(JsonElement? payloadElement)
    {
        if (payloadElement == null)
        {
            SendAvatarEdgeLightError("Avatar edge-light request payload was empty.");
            return;
        }

        var requestId = StageViewJson.TryReadRequestId(payloadElement.Value);
        try
        {
            var payload = StageViewJson.ParseRenderAvatarEdgeLightRequest(payloadElement.Value);
            var enabled = _renderEffectsRuntime.SetAvatarEdgeLightEnabled(payload.Enabled);
            _bridge.SendEnvelope("stage.render.avatar_edge_light", new StageRenderAvatarEdgeLightPayload(
                payload.RequestId,
                enabled
            ));
        }
        catch (Exception error)
        {
            SendAvatarEdgeLightError(error.Message, requestId);
        }
    }

    private void ProcessPendingViewCapture()
    {
        if (_pendingViewCapture == null)
        {
            return;
        }

        if (_pendingViewCaptureFrames > 0)
        {
            _pendingViewCaptureFrames--;
            return;
        }

        var payload = _pendingViewCapture;
        _pendingViewCapture = null;
        _pendingViewCaptureFrames = 0;
        CaptureViewPng(payload);
    }

    private void CaptureViewPng(StageViewCapturePngRequestPayload payload)
    {
        try
        {
            var image = GetViewport().GetTexture().GetImage();
            var directory = Path.GetDirectoryName(payload.Path);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var saveError = image.SavePng(payload.Path);
            if (saveError != Error.Ok)
            {
                throw new InvalidOperationException($"Godot failed to save viewport PNG: {saveError}.");
            }

            _bridge.SendEnvelope("stage.view.capture_png", new StageViewCapturePngPayload(
                payload.RequestId,
                payload.Path,
                image.GetWidth(),
                image.GetHeight()
            ));
        }
        catch (Exception error)
        {
            SendViewCaptureError(error.Message, payload.RequestId);
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

    private void StartDevObservationAdapterIfEnabled()
    {
        if (!StageDevObservationAdapter.IsEnabled())
        {
            return;
        }

        _devObservationAdapter = new StageDevObservationAdapter(
            _jsonOptions,
            ProjectSettings.GlobalizePath("res://"),
            new[]
            {
                StageRenderDebugViewNames.Final,
                StageRenderDebugViewNames.SceneCopy,
                StageRenderDebugViewNames.AvatarMask,
                StageRenderDebugViewNames.AvatarEdgeMask,
                StageRenderDebugViewNames.AfterAvatarEdgeLight,
                StageRenderDebugViewNames.AfterAvatarGlow,
            }
        );
        _devObservationAdapter.RenderExportRequested += QueueDevRenderExport;

        try
        {
            _devObservationAdapter.Start();
        }
        catch (Exception error)
        {
            GD.PushWarning(error.Message);
            _devObservationAdapter.Dispose();
            _devObservationAdapter = null;
        }
    }

    private void QueueDevRenderExport(StageDevObservationRenderExportRequest request)
    {
        if (_pendingDevRenderExport != null)
        {
            _devObservationAdapter?.SendRenderExportError(
                request.RequestId,
                "export_busy",
                "A render export is already pending."
            );
            return;
        }

        if (_renderEffectsRuntime == null)
        {
            _devObservationAdapter?.SendRenderExportError(
                request.RequestId,
                "not_ready",
                "Render effects runtime is not ready."
            );
            return;
        }

        foreach (var stage in request.Stages)
        {
            if (!StageRenderDebugViewNames.TryParse(stage, out _))
            {
                _devObservationAdapter?.SendRenderExportError(
                    request.RequestId,
                    "invalid_payload",
                    $"Unknown render stage: {stage}."
                );
                return;
            }
        }

        _pendingDevRenderExport = new DevRenderExportRun(
            request,
            _renderEffectsRuntime.CurrentDebugView
        );
    }

    private void ProcessPendingDevRenderExport()
    {
        if (_pendingDevRenderExport == null)
        {
            return;
        }

        try
        {
            if (_pendingDevRenderExport.ActiveStage == null)
            {
                BeginNextDevRenderExportStage();
                return;
            }

            if (_pendingDevRenderExport.SettleFramesRemaining > 0)
            {
                _pendingDevRenderExport.SettleFramesRemaining--;
                return;
            }

            CaptureActiveDevRenderExportStage();
            if (_pendingDevRenderExport.NextStageIndex >= _pendingDevRenderExport.Request.Stages.Length)
            {
                CompleteDevRenderExport();
                return;
            }

            BeginNextDevRenderExportStage();
        }
        catch (Exception error)
        {
            FailDevRenderExport("export_failed", error.Message);
        }
    }

    private void BeginNextDevRenderExportStage()
    {
        var stage = _pendingDevRenderExport.Request.Stages[_pendingDevRenderExport.NextStageIndex];
        _pendingDevRenderExport.NextStageIndex++;
        _renderEffectsRuntime.SetDebugView(stage);
        _pendingDevRenderExport.ActiveStage = stage;
        _pendingDevRenderExport.SettleFramesRemaining = DevRenderExportSettleFrames;
    }

    private void CaptureActiveDevRenderExportStage()
    {
        var stage = _pendingDevRenderExport.ActiveStage;
        var outputDir = _pendingDevRenderExport.Request.OutputDir;
        Directory.CreateDirectory(outputDir);

        var image = GetViewport().GetTexture().GetImage();
        var path = Path.Combine(outputDir, $"{stage}.png");
        var saveError = image.SavePng(path);
        if (saveError != Error.Ok)
        {
            throw new InvalidOperationException($"Godot failed to save render stage {stage}: {saveError}.");
        }

        _pendingDevRenderExport.ExportedFiles.Add(new StageDevObservationExportedFile(
            stage,
            path,
            image.GetWidth(),
            image.GetHeight()
        ));
        _pendingDevRenderExport.ActiveStage = null;
    }

    private void CompleteDevRenderExport()
    {
        var export = _pendingDevRenderExport;
        _pendingDevRenderExport = null;
        RestoreRenderDebugView(export.RestoreDebugView);
        _devObservationAdapter?.SendRenderExportResponse(new StageDevObservationRenderExportResult(
            export.Request.RequestId,
            export.Request.OutputDir,
            export.ExportedFiles.ToArray(),
            BuildDevObservationContext()
        ));
    }

    private StageDevObservationContext BuildDevObservationContext()
    {
        return new StageDevObservationContext(
            _viewRuntime?.CreateSnapshot("dev-render-observation"),
            _activeScenePayload,
            _renderEffectsRuntime?.CurrentDebugView,
            DateTimeOffset.UtcNow.ToString("O")
        );
    }

    private void FailDevRenderExport(string code, string message)
    {
        var export = _pendingDevRenderExport;
        _pendingDevRenderExport = null;
        if (export != null)
        {
            RestoreRenderDebugView(export.RestoreDebugView);
            _devObservationAdapter?.SendRenderExportError(export.Request.RequestId, code, message);
        }
    }

    private void RestoreRenderDebugView(string debugView)
    {
        try
        {
            _renderEffectsRuntime?.SetDebugView(debugView);
        }
        catch (Exception error)
        {
            GD.PushWarning($"Failed to restore render debug view {debugView}: {error.Message}");
        }
    }

    private void SendSceneError(string message)
    {
        _bridge.SendEnvelope("scene.error", new
        {
            message,
        });
    }

    private void SendViewCaptureError(string message, string requestId = null)
    {
        _bridge.SendEnvelope("stage.view.capture_error", new StageViewErrorPayload(
            "view-capture-failed",
            message,
            requestId
        ));
    }

    private void SendRenderDebugViewError(string message, string requestId = null)
    {
        _bridge.SendEnvelope("stage.render.debug_view_error", new StageViewErrorPayload(
            "render-debug-view-failed",
            message,
            requestId
        ));
    }

    private void SendAvatarEdgeLightError(string message, string requestId = null)
    {
        _bridge.SendEnvelope("stage.render.avatar_edge_light_error", new StageViewErrorPayload(
            "avatar-edge-light-failed",
            message,
            requestId
        ));
    }

    private sealed class DevRenderExportRun
    {
        public DevRenderExportRun(StageDevObservationRenderExportRequest request, string restoreDebugView)
        {
            Request = request;
            RestoreDebugView = restoreDebugView;
        }

        public StageDevObservationRenderExportRequest Request
        {
            get;
        }
        public string RestoreDebugView
        {
            get;
        }
        public int NextStageIndex
        {
            get; set;
        }
        public string ActiveStage
        {
            get; set;
        }
        public int SettleFramesRemaining
        {
            get; set;
        }
        public List<StageDevObservationExportedFile> ExportedFiles { get; } = new();
    }
}
