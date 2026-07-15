using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using Godot;

/// <summary>
/// Dev-only localhost adapter for AUV observation tools.
/// </summary>
public sealed class StageDevObservationAdapter : IDisposable
{
    private const string EnableEnvironmentVariable = "AIRI_GODOT_STAGE_DEV_MODE";
    private const string Transport = "websocket-json";
    private const string CapabilityQueryMessageType = "capability.query";
    private const string RenderExportStagesMessageType = "render.export_stages";
    private const int FallbackPortStart = 43170;
    private const int FallbackPortEnd = 43199;

    private readonly JsonSerializerOptions _jsonOptions;
    private readonly string[] _renderStages;
    private readonly int _processId;
    private readonly string _projectPath;
    private readonly string _token;

    private TcpServer _server;
    private WebSocketPeer _peer;
    private string _instancePath;
    private bool _disposed;

    public bool AiriBridgeConnected
    {
        get;
        set;
    }

    public event Action<StageDevObservationRenderExportRequest> RenderExportRequested;

    public StageDevObservationAdapter(
        JsonSerializerOptions jsonOptions,
        string projectPath,
        string[] renderStages
    )
    {
        _jsonOptions = jsonOptions;
        _projectPath = projectPath;
        _renderStages = renderStages;
        _processId = Process.GetCurrentProcess().Id;
        _token = Guid.NewGuid().ToString("N");
    }

    public static bool IsEnabled()
    {
        var rawValue = System.Environment.GetEnvironmentVariable(EnableEnvironmentVariable);
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return false;
        }

        var normalizedValue = rawValue.Trim().ToLowerInvariant();
        return normalizedValue == "1"
            || normalizedValue == "true"
            || normalizedValue == "yes"
            || normalizedValue == "on";
    }

    public void Start()
    {
        if (_disposed || _server != null)
        {
            return;
        }

        _server = new TcpServer();
        var listenError = _server.Listen(0, "127.0.0.1");
        if (listenError != Error.Ok || _server.GetLocalPort() <= 0)
        {
            _server.Dispose();
            _server = new TcpServer();
            listenError = ListenOnFallbackPort();
        }

        if (listenError != Error.Ok)
        {
            throw new InvalidOperationException($"Failed to start Godot dev observation adapter: {listenError}.");
        }

        WriteDiscoveryRecord(_server.GetLocalPort());
        GD.Print($"AIRI Godot dev observation adapter listening on 127.0.0.1:{_server.GetLocalPort()}.");
    }

    public void Poll()
    {
        if (_disposed || _server == null)
        {
            return;
        }

        AcceptPendingConnection();
        PollPeer();
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        CleanupDiscoveryRecord();

        if (_peer != null)
        {
            _peer.Close();
            _peer.Dispose();
            _peer = null;
        }

        if (_server != null)
        {
            _server.Dispose();
            _server = null;
        }
    }

    private Error ListenOnFallbackPort()
    {
        for (var port = FallbackPortStart; port <= FallbackPortEnd; port++)
        {
            var listenError = _server.Listen((ushort)port, "127.0.0.1");
            if (listenError == Error.Ok)
            {
                return Error.Ok;
            }
        }

        return Error.CantCreate;
    }

    private void AcceptPendingConnection()
    {
        if (!_server.IsConnectionAvailable())
        {
            return;
        }

        var stream = _server.TakeConnection();
        var nextPeer = new WebSocketPeer();
        var acceptError = nextPeer.AcceptStream(stream);
        if (acceptError != Error.Ok)
        {
            GD.PushWarning($"AIRI Godot dev observation adapter rejected connection: {acceptError}.");
            nextPeer.Dispose();
            stream.Dispose();
            return;
        }

        if (_peer != null)
        {
            _peer.Close();
            _peer.Dispose();
        }

        _peer = nextPeer;
    }

    private void PollPeer()
    {
        if (_peer == null)
        {
            return;
        }

        _peer.Poll();
        switch (_peer.GetReadyState())
        {
            case WebSocketPeer.State.Open:
                DrainPeerMessages();
                break;
            case WebSocketPeer.State.Closed:
                _peer.Dispose();
                _peer = null;
                break;
        }
    }

    private void DrainPeerMessages()
    {
        while (_peer.GetAvailablePacketCount() > 0)
        {
            var rawMessage = _peer.GetPacket().GetStringFromUtf8();
            HandleMessage(rawMessage);
        }
    }

    private void HandleMessage(string rawMessage)
    {
        StageDevObservationRequest request = null;
        try
        {
            request = JsonSerializer.Deserialize<StageDevObservationRequest>(rawMessage, _jsonOptions);
            if (request == null || string.IsNullOrWhiteSpace(request.Type))
            {
                SendError(null, "invalid_request", "Request must include a type.");
                return;
            }

            if (!string.Equals(request.Token, _token, StringComparison.Ordinal))
            {
                SendError(request.RequestId, "unauthorized", "Request token does not match this Godot dev instance.");
                return;
            }

            switch (request.Type)
            {
                case CapabilityQueryMessageType:
                    SendCapabilityResponse(request.RequestId);
                    break;
                case RenderExportStagesMessageType:
                    QueueRenderExport(request);
                    break;
                default:
                    SendError(request.RequestId, "unknown_message_type", $"Unsupported message type: {request.Type}.");
                    break;
            }
        }
        catch (Exception error)
        {
            SendError(request?.RequestId, "invalid_json", error.Message);
        }
    }

    private void SendCapabilityResponse(string requestId)
    {
        SendMessage(new
        {
            type = "capability.query.response",
            requestId,
            status = "ok",
            result = new
            {
                transport = Transport,
                features = new[]
                {
                    CapabilityQueryMessageType,
                    RenderExportStagesMessageType,
                },
                renderStages = _renderStages,
                cameraPresets = Array.Empty<string>(),
                process = new
                {
                    pid = _processId,
                    projectPath = _projectPath,
                    airiBridgeConnected = AiriBridgeConnected,
                },
            },
        });
    }

    private void QueueRenderExport(StageDevObservationRequest request)
    {
        if (RenderExportRequested == null)
        {
            SendError(request.RequestId, "not_ready", "No render export handler is available.");
            return;
        }

        StageDevObservationRenderExportPayload payload;
        try
        {
            payload = request.Payload.Deserialize<StageDevObservationRenderExportPayload>(_jsonOptions);
        }
        catch (Exception error)
        {
            SendError(request.RequestId, "invalid_payload", error.Message);
            return;
        }

        if (payload == null || string.IsNullOrWhiteSpace(payload.OutputDir))
        {
            SendError(request.RequestId, "invalid_payload", "Render export payload must include outputDir.");
            return;
        }

        if (payload.Stages == null || payload.Stages.Length == 0)
        {
            SendError(request.RequestId, "invalid_payload", "Render export payload must include at least one stage.");
            return;
        }

        RenderExportRequested.Invoke(new StageDevObservationRenderExportRequest(
            request.RequestId,
            payload.OutputDir,
            payload.Stages
        ));
    }

    public void SendRenderExportResponse(StageDevObservationRenderExportResult result)
    {
        SendMessage(new
        {
            type = "render.export_stages.response",
            requestId = result.RequestId,
            status = "ok",
            result = new
            {
                outputDir = result.OutputDir,
                exportedFiles = result.ExportedFiles,
                context = result.Context,
            },
        });
    }

    public void SendRenderExportError(string requestId, string code, string message)
    {
        SendMessage(new
        {
            type = "render.export_stages.response",
            requestId,
            status = "error",
            error = new
            {
                code,
                message,
            },
        });
    }

    private void SendError(string requestId, string code, string message)
    {
        SendMessage(new
        {
            type = "error",
            requestId,
            status = "error",
            error = new
            {
                code,
                message,
            },
        });
    }

    private void SendMessage(object message)
    {
        if (_peer?.GetReadyState() != WebSocketPeer.State.Open)
        {
            return;
        }

        _peer.SendText(JsonSerializer.Serialize(message, _jsonOptions));
    }

    private void WriteDiscoveryRecord(int port)
    {
        var discoveryRoot = ResolveDiscoveryRoot();
        var instancesDirectory = Path.Combine(discoveryRoot, "instances");
        Directory.CreateDirectory(instancesDirectory);

        _instancePath = Path.Combine(instancesDirectory, $"{_processId}.json");
        var startedAt = DateTimeOffset.UtcNow.ToString("O");
        var instanceRecord = new
        {
            schemaVersion = 1,
            kind = "airi-godot-stage-dev-observation-instance",
            pid = _processId,
            projectPath = _projectPath,
            transport = Transport,
            endpoint = $"127.0.0.1:{port}",
            token = _token,
            startedAt,
        };
        File.WriteAllText(_instancePath, JsonSerializer.Serialize(instanceRecord, _jsonOptions));

        var currentRecord = new
        {
            schemaVersion = 1,
            kind = "airi-godot-stage-dev-observation-current",
            pid = _processId,
            projectPath = _projectPath,
            instancePath = _instancePath,
            updatedAt = startedAt,
        };
        File.WriteAllText(
            Path.Combine(discoveryRoot, "current.json"),
            JsonSerializer.Serialize(currentRecord, _jsonOptions)
        );
    }

    private void CleanupDiscoveryRecord()
    {
        if (string.IsNullOrWhiteSpace(_instancePath))
        {
            return;
        }

        try
        {
            if (File.Exists(_instancePath))
            {
                File.Delete(_instancePath);
            }

            var currentPath = Path.Combine(ResolveDiscoveryRoot(), "current.json");
            if (IsCurrentDiscoveryRecord(currentPath))
            {
                File.Delete(currentPath);
            }
        }
        catch (Exception error)
        {
            GD.PushWarning($"Failed to clean AIRI Godot dev observation discovery record: {error.Message}");
        }
    }

    private bool IsCurrentDiscoveryRecord(string currentPath)
    {
        if (!File.Exists(currentPath))
        {
            return false;
        }

        var currentRecord = JsonSerializer.Deserialize<StageDevObservationCurrentRecord>(
            File.ReadAllText(currentPath),
            _jsonOptions
        );

        return string.Equals(currentRecord?.InstancePath, _instancePath, StringComparison.Ordinal);
    }

    private static string ResolveDiscoveryRoot()
    {
        var userProfile = System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrWhiteSpace(userProfile))
        {
            userProfile = OS.GetUserDataDir();
        }

        return Path.Combine(userProfile, ".airi", "godot-stage", "dev");
    }

    private sealed record StageDevObservationRequest(string Type, string RequestId, string Token, JsonElement Payload);
    private sealed record StageDevObservationCurrentRecord(string InstancePath);
    private sealed record StageDevObservationRenderExportPayload(string OutputDir, string[] Stages);
}

public sealed record StageDevObservationRenderExportRequest(string RequestId, string OutputDir, string[] Stages);

public sealed record StageDevObservationRenderExportResult(
    string RequestId,
    string OutputDir,
    StageDevObservationExportedFile[] ExportedFiles,
    StageDevObservationContext Context
);

public sealed record StageDevObservationExportedFile(string Stage, string Path, int Width, int Height);

public sealed record StageDevObservationContext(
    StageViewSnapshotPayload ViewSnapshot,
    StageSceneApplyPayload Scene,
    string RenderDebugView,
    string CapturedAt
);
