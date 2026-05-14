using System;
using System.IO;
using System.Text.Json;
using Godot;

public partial class StageRoot : Node3D
{
    private const string WebSocketUrlArgumentPrefix = "--airi-ws-url=";

    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly WebSocketPeer _socket = new();

    private Label3D _statusLabel = null!;
    private bool _readyAnnounced;
    private bool _shutdownRequested;

    public override void _Ready()
    {
        _statusLabel = CreateStatusLabel();
        AddChild(_statusLabel);

        var webSocketUrl = ResolveWebSocketUrl();
        if (string.IsNullOrWhiteSpace(webSocketUrl))
        {
            UpdateStatus("Missing Electron bridge URL.");
            GD.PushError("Godot stage missing --airi-ws-url argument.");
            GetTree().Quit();
            return;
        }

        var connectError = _socket.ConnectToUrl(webSocketUrl);
        if (connectError != Error.Ok)
        {
            UpdateStatus("Failed to connect to Electron main.");
            GD.PushError($"Godot stage failed to connect to {webSocketUrl}: {connectError}.");
            GetTree().Quit();
            return;
        }

        UpdateStatus("Connecting to Electron main...");
        GD.Print($"StageRoot connecting to {webSocketUrl}");
    }

    public override void _Process(double delta)
    {
        _socket.Poll();

        switch (_socket.GetReadyState())
        {
            case WebSocketPeer.State.Open:
                if (!_readyAnnounced)
                {
                    SendEnvelope("stage.ready");
                    _readyAnnounced = true;
                    UpdateStatus("Connected to Electron main.");
                }

                while (_socket.GetAvailablePacketCount() > 0)
                {
                    HandleMessage(_socket.GetPacket().GetStringFromUtf8());
                }
                break;
            case WebSocketPeer.State.Closed:
                if (_shutdownRequested)
                {
                    GetTree().Quit();
                    return;
                }

                var message = $"Electron bridge closed ({_socket.GetCloseCode()}).";
                UpdateStatus(message);
                GD.PushWarning(message);
                GetTree().Quit();
                break;
        }
    }

    private Label3D CreateStatusLabel()
    {
        return new Label3D
        {
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
            FontSize = 56,
            Modulate = new Color(0.95f, 0.98f, 1.0f),
            PixelSize = 0.0035f,
            Position = new Vector3(0.0f, 1.35f, 0.0f),
            Text = "Godot Stage (experimental)",
        };
    }

    private void HandleMessage(string rawMessage)
    {
        try
        {
            var envelope = JsonSerializer.Deserialize<GodotEnvelope>(rawMessage, _jsonOptions);
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
            SendEnvelope("scene.error", new
            {
                message,
            });
        }
    }

    private void ApplySceneInput(JsonElement? payloadElement)
    {
        if (payloadElement == null)
        {
            SendEnvelope("scene.error", new
            {
                message = "Scene input payload was empty.",
            });
            return;
        }

        try
        {
            var payload = payloadElement.Value.Deserialize<SceneApplyPayload>(_jsonOptions);
            if (payload == null)
            {
                throw new InvalidOperationException("Scene input payload could not be parsed.");
            }

            var fileName = Path.GetFileName(payload.Path);
            UpdateStatus($"Connected to Electron main.\nModel: {payload.Name}\nAsset: {fileName}");
            SendEnvelope("scene.applied", new
            {
                modelId = payload.ModelId,
            });
        }
        catch (Exception error)
        {
            var message = $"Failed to apply scene input: {error.Message}";
            UpdateStatus(message);
            SendEnvelope("scene.error", new
            {
                message,
            });
        }
    }

    private static string ResolveWebSocketUrl()
    {
        foreach (var argument in OS.GetCmdlineUserArgs())
        {
            if (argument.StartsWith(WebSocketUrlArgumentPrefix, StringComparison.Ordinal))
            {
                return argument[WebSocketUrlArgumentPrefix.Length..];
            }
        }

        return string.Empty;
    }

    private void SendEnvelope(string type, object payload = null)
    {
        if (_socket.GetReadyState() != WebSocketPeer.State.Open)
        {
            return;
        }

        _socket.SendText(JsonSerializer.Serialize(new
        {
            type,
            payload,
        }, _jsonOptions));
    }

    private void UpdateStatus(string message)
    {
        _statusLabel.Text = $"Godot Stage (experimental)\n{message}";
    }

    private sealed record GodotEnvelope(string Type, JsonElement? Payload);

    private sealed record SceneApplyPayload(
        string ModelId,
        string Format,
        string Name,
        string Path
    );
}
