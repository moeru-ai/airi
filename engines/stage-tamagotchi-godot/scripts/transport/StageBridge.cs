using System;
using System.Text.Json;
using Godot;

/// <summary>
/// Owns the localhost WebSocket connection to the Electron host process.
///
/// Use when:
/// - The Godot stage needs to receive host messages.
/// - The Godot stage needs to report ready, applied, or error events.
///
/// Expects:
/// - Electron main has already opened a local WebSocket endpoint.
/// - <see cref="Poll"/> is called from Godot's frame loop.
///
/// Returns:
/// - Message events through <see cref="MessageReceived"/>.
/// - Host-visible status messages through <see cref="SendEnvelope"/>.
///
/// Call stack:
///
/// StageRoot._Process
///   -> <see cref="Poll"/>
///     -> <see cref="MessageReceived"/>
///       -> StageRoot.HandleMessage
/// </summary>
public sealed class StageBridge
{
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly WebSocketPeer _socket = new();

    private bool _closedAnnounced;
    private bool _readyAnnounced;

    public event Action Opened;

    public event Action<string> MessageReceived;

    public event Action<string> Closed;

    /// <summary>
    /// Creates a bridge with the JSON options shared by the runtime message parser.
    ///
    /// Use when:
    /// - Stage runtime starts and needs a host bridge.
    ///
    /// Expects:
    /// - <paramref name="jsonOptions"/> matches the host envelope casing policy.
    ///
    /// Returns:
    /// - A bridge ready to connect to Electron main.
    /// </summary>
    public StageBridge(JsonSerializerOptions jsonOptions)
    {
        _jsonOptions = jsonOptions;
    }

    /// <summary>
    /// Connects to Electron main's localhost WebSocket endpoint.
    ///
    /// Use when:
    /// - The Godot scene has resolved <c>--airi-ws-url</c>.
    ///
    /// Expects:
    /// - The URL points to a local endpoint created by Electron main.
    ///
    /// Returns:
    /// - Godot's connection error code.
    /// </summary>
    public Error Connect(string webSocketUrl)
    {
        return _socket.ConnectToUrl(webSocketUrl);
    }

    /// <summary>
    /// Pumps the WebSocket connection and dispatches received host messages.
    ///
    /// Use when:
    /// - Called from <see cref="Node._Process"/>.
    ///
    /// Expects:
    /// - <see cref="Connect"/> has already been called.
    ///
    /// Returns:
    /// - Events emitted through <see cref="Opened"/>, <see cref="MessageReceived"/>, and <see cref="Closed"/>.
    /// </summary>
    public void Poll()
    {
        _socket.Poll();

        switch (_socket.GetReadyState())
        {
            case WebSocketPeer.State.Open:
                AnnounceReadyOnce();
                DrainMessages();
                break;
            case WebSocketPeer.State.Closed:
                AnnounceClosedOnce();
                break;
        }
    }

    /// <summary>
    /// Sends a typed JSON envelope to Electron main.
    ///
    /// Use when:
    /// - Godot reports runtime status back to the host.
    ///
    /// Expects:
    /// - The WebSocket is already open; otherwise the message is ignored.
    ///
    /// Returns:
    /// - No value. The message is queued through Godot's WebSocket peer.
    /// </summary>
    public void SendEnvelope(string type, object payload = null)
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

    private void AnnounceReadyOnce()
    {
        if (_readyAnnounced)
        {
            return;
        }

        _readyAnnounced = true;
        Opened?.Invoke();
    }

    private void DrainMessages()
    {
        while (_socket.GetAvailablePacketCount() > 0)
        {
            MessageReceived?.Invoke(_socket.GetPacket().GetStringFromUtf8());
        }
    }

    private void AnnounceClosedOnce()
    {
        if (_closedAnnounced)
        {
            return;
        }

        _closedAnnounced = true;
        Closed?.Invoke($"Electron bridge closed ({_socket.GetCloseCode()}).");
    }
}
