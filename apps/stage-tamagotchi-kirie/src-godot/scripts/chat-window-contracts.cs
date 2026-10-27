using System.Text.Json;
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
/// The unsent draft that a chat mode switch carries from one chat window to the other.
/// </summary>
/// <param name="Draft">The `ChatDraftHandover` of the renderer, which the host passes on without
/// reading it. It is `null` when there is no draft. The adapter drops a reply without a body, so
/// the draft travels inside this object.</param>
internal sealed record ChatDraftPayload(JsonElement? Draft);

/// <summary>Whether the chat window that took a draft put it back into its composer.</summary>
internal sealed record ChatDraftSettledPayload(bool Restored);

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

    /// <summary>The host asks the chat window that a mode switch closes for its draft.</summary>
    public static readonly InvokeEventDefinition<ChatDraftPayload, EmptyPayload> CollectDraft =
        new("eventa:invoke:electron:windows:chat:collect-draft");

    /// <summary>The chat window that a mode switch opens takes the draft when it mounts.</summary>
    public static readonly InvokeEventDefinition<ChatDraftPayload, EmptyPayload> TakeDraft =
        new("eventa:invoke:electron:windows:chat:take-draft");

    /// <summary>Tells a mounted chat window that a mode switch carries a draft to it.</summary>
    public static readonly EventDefinition<EmptyPayload> DraftOffered =
        new("eventa:event:electron:windows:chat:draft-offered");

    /// <summary>
    /// The chat window reports what happened to the draft it took. A window with no draft to take
    /// reports `true`, which also tells the switch that the page mounted.
    /// </summary>
    public static readonly InvokeEventDefinition<EmptyPayload, ChatDraftSettledPayload>
        DraftSettled = new("eventa:invoke:electron:windows:chat:draft-settled");

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
            .RegisterInvoke(FloatingResizeBy, empty, json.ChatFloatingResizeByPayload)
            .RegisterInvoke(CollectDraft, json.ChatDraftPayload, empty)
            .RegisterInvoke(TakeDraft, json.ChatDraftPayload, empty)
            .RegisterEvent(DraftOffered, empty)
            .RegisterInvoke(DraftSettled, empty, json.ChatDraftSettledPayload);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ChatWindowPreferencesPayload))]
[JsonSerializable(typeof(ChatWindowPreferencesChangePayload))]
[JsonSerializable(typeof(ChatButtonStatePayload))]
[JsonSerializable(typeof(ChatFloatingStatePayload))]
[JsonSerializable(typeof(ChatFloatingMoveByPayload))]
[JsonSerializable(typeof(ChatFloatingResizeByPayload))]
[JsonSerializable(typeof(ChatDraftPayload))]
[JsonSerializable(typeof(ChatDraftSettledPayload))]
internal sealed partial class ChatWindowJsonContext : JsonSerializerContext;
