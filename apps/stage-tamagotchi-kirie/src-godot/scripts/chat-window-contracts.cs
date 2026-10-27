using System.Text.Json.Serialization;
using Eventa;
using GdKirie.EventaAdapter;

/// <summary>
/// The chat choices that every chat renderer reads. `Mode` is `legacy` or `floating`.
/// </summary>
internal sealed record ChatWindowPreferencesPayload(
    string Mode,
    string Placement,
    bool Danmaku,
    bool Pinned);

/// <summary>The chat choices that a control changes. A missing value keeps the saved one.</summary>
internal sealed record ChatWindowPreferencesChangePayload(
    string? Mode,
    string? Placement,
    bool? Danmaku,
    bool? Pinned);

/// <summary>
/// What the Controls Island chat button shows. Only the floating chat has a pressed state.
/// </summary>
internal sealed record ChatButtonStatePayload(string Mode, bool FloatingShown);

/// <summary>What the floating chat renderer needs to lay itself out.</summary>
/// <param name="Side">The side of the main window that an attached chat sits on. It is `left` for a
/// free chat.</param>
/// <param name="ResizeEdges">The edges and corners that resize the chat, as `n`, `se`, and so
/// on.</param>
/// <param name="Folded">The chat button folded the chat. The renderer hides the content and then
/// reports it.</param>
/// <param name="Relocating">An attached chat moves to the other side of the main window while its
/// content is hidden.</param>
/// <param name="Pinned">The chat stays above other windows. The renderer passes clicks through only
/// while it does.</param>
internal sealed record ChatFloatingStatePayload(
    string Placement,
    bool Danmaku,
    string Side,
    string[] ResizeEdges,
    bool Folded,
    bool Relocating,
    bool Pinned);

/// <summary>A move of the floating chat from the keyboard, in logical pixels.</summary>
internal sealed record ChatFloatingMoveByPayload(int DeltaX, int DeltaY);

/// <summary>
/// A resize of the floating chat from the keyboard, in logical pixels, from one of its resize
/// edges.
/// </summary>
internal sealed record ChatFloatingResizeByPayload(int DeltaX, int DeltaY, string Direction);

/// <summary>
/// Matches the chat window contracts of the renderer. The IDs keep the Electron names of the shared
/// UI.
/// </summary>
internal static class ChatWindowContracts
{
    public static readonly InvokeEventDefinition<ChatButtonStatePayload, EmptyPayload>
        GetChatButtonState = new("eventa:invoke:electron:windows:chat:get-button-state");

    public static readonly EventDefinition<ChatButtonStatePayload> ChatButtonStateChanged =
        new("eventa:event:electron:windows:chat:button-state-changed");

    public static readonly InvokeEventDefinition<ChatWindowPreferencesPayload, EmptyPayload>
        GetPreferences = new("eventa:invoke:electron:windows:chat:get-preferences");

    public static readonly InvokeEventDefinition<EmptyPayload, ChatWindowPreferencesChangePayload>
        SetPreferences = new("eventa:invoke:electron:windows:chat:set-preferences");

    public static readonly InvokeEventDefinition<ChatFloatingStatePayload, EmptyPayload>
        GetFloatingState = new("eventa:invoke:electron:windows:chat-floating:get-state");

    public static readonly EventDefinition<ChatFloatingStatePayload> FloatingStateChanged =
        new("eventa:event:electron:windows:chat-floating:state-changed");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> FloatingContentHidden =
        new("eventa:invoke:electron:windows:chat-floating:content-hidden");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> FloatingFold =
        new("eventa:invoke:electron:windows:chat-floating:fold");

    public static readonly InvokeEventDefinition<EmptyPayload, ChatFloatingMoveByPayload>
        FloatingMoveBy = new("eventa:invoke:electron:windows:chat-floating:move-by");

    public static readonly InvokeEventDefinition<EmptyPayload, ChatFloatingResizeByPayload>
        FloatingResizeBy = new("eventa:invoke:electron:windows:chat-floating:resize-by");

    public static KirieEventaJsonRegistry Register(KirieEventaJsonRegistry registry)
    {
        var empty = AiriDesktopJsonContext.Default.EmptyPayload;
        var json = ChatWindowJsonContext.Default;
        return registry
            .RegisterInvoke(GetChatButtonState, json.ChatButtonStatePayload, empty)
            .RegisterEvent(ChatButtonStateChanged, json.ChatButtonStatePayload)
            .RegisterInvoke(GetPreferences, json.ChatWindowPreferencesPayload, empty)
            .RegisterInvoke(SetPreferences, empty, json.ChatWindowPreferencesChangePayload)
            .RegisterInvoke(GetFloatingState, json.ChatFloatingStatePayload, empty)
            .RegisterEvent(FloatingStateChanged, json.ChatFloatingStatePayload)
            .RegisterInvoke(FloatingContentHidden, empty, empty)
            .RegisterInvoke(FloatingFold, empty, empty)
            .RegisterInvoke(FloatingMoveBy, empty, json.ChatFloatingMoveByPayload)
            .RegisterInvoke(FloatingResizeBy, empty, json.ChatFloatingResizeByPayload);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ChatWindowPreferencesPayload))]
[JsonSerializable(typeof(ChatWindowPreferencesChangePayload))]
[JsonSerializable(typeof(ChatButtonStatePayload))]
[JsonSerializable(typeof(ChatFloatingStatePayload))]
[JsonSerializable(typeof(ChatFloatingMoveByPayload))]
[JsonSerializable(typeof(ChatFloatingResizeByPayload))]
internal sealed partial class ChatWindowJsonContext : JsonSerializerContext;
