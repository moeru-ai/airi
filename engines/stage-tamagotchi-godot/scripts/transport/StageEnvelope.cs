using System.Text.Json;

/// <summary>
/// Message envelope exchanged between Electron main and the Godot sidecar.
/// </summary>
/// <param name="Type">Stable message type string, such as <c>host.scene.apply</c>.</param>
/// <param name="Payload">Optional JSON payload owned by the message type.</param>
public sealed record StageEnvelope(string Type, JsonElement? Payload);
