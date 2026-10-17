using System.Text.Json.Serialization;
using Eventa;
using GdKirie.EventaAdapter;

internal sealed record ChatWindowPreferences(string Mode, string Placement, bool Pinned)
{
    public static readonly ChatWindowPreferences Default = new("legacy", "attached", false);

    [JsonIgnore]
    public bool IsValid => Mode is "legacy" or "floating"
        && Placement is "attached" or "free" or "danmaku";
}

internal sealed record ChatWindowState(
    ChatWindowPreferences Preferences, string Side, bool Folded, bool Pinned);
internal sealed record ChatButtonState(string Mode, bool FloatingShown);

internal static class ChatWindowContracts
{
    public static readonly InvokeEventDefinition<ChatWindowState, EmptyPayload> GetState =
        new("eventa:invoke:airi:chat-window:get-state");
    public static readonly InvokeEventDefinition<ChatWindowPreferences, EmptyPayload> GetPreferences =
        new("eventa:invoke:electron:windows:chat:get-preferences");
    public static readonly InvokeEventDefinition<EmptyPayload, ChatWindowPreferences> SetPreferences =
        new("eventa:invoke:electron:windows:chat:set-preferences");
    public static readonly InvokeEventDefinition<ChatButtonState, EmptyPayload> GetButtonState =
        new("eventa:invoke:electron:windows:chat:get-button-state");
    public static readonly EventDefinition<ChatButtonState> ButtonStateChanged =
        new("eventa:event:electron:windows:chat:button-state-changed");
    public static readonly EventDefinition<ChatWindowState> StateChanged =
        new("eventa:event:airi:chat-window:state-changed");
    public static readonly EventDefinition<EmptyPayload> Fold =
        new("eventa:event:airi:chat-window:fold");
    public static readonly EventDefinition<EmptyPayload> ContentHidden =
        new("eventa:event:airi:chat-window:content-hidden");

    public static KirieEventaJsonRegistry Register(KirieEventaJsonRegistry registry)
    {
        return registry
            .RegisterInvoke(GetState, ChatWindowJsonContext.Default.ChatWindowState,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(GetPreferences, ChatWindowJsonContext.Default.ChatWindowPreferences,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(SetPreferences, AiriDesktopJsonContext.Default.EmptyPayload,
                ChatWindowJsonContext.Default.ChatWindowPreferences)
            .RegisterInvoke(GetButtonState, ChatWindowJsonContext.Default.ChatButtonState,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterEvent(ButtonStateChanged, ChatWindowJsonContext.Default.ChatButtonState)
            .RegisterEvent(StateChanged, ChatWindowJsonContext.Default.ChatWindowState)
            .RegisterEvent(Fold, AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterEvent(ContentHidden, AiriDesktopJsonContext.Default.EmptyPayload);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ChatWindowPreferences))]
[JsonSerializable(typeof(ChatWindowState))]
[JsonSerializable(typeof(ChatButtonState))]
internal sealed partial class ChatWindowJsonContext : JsonSerializerContext;
