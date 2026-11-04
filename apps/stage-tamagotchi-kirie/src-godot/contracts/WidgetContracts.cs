using System.Text.Json;
using System.Text.Json.Serialization;
using Eventa;
using GdKirie.EventaAdapter;

internal sealed record WidgetIdPayload(string? Id);
internal sealed record WidgetWindowSizePayload(
    int? Width, int? Height, int? MinWidth, int? MinHeight, int? MaxWidth, int? MaxHeight);
internal sealed record WidgetMutationPayload(
    string? Id,
    string? ComponentName,
    Dictionary<string, JsonElement>? ComponentProps,
    bool? AlwaysOnTop,
    JsonElement? Size,
    WidgetWindowSizePayload? WindowSize,
    double? TtlMs);
internal sealed record WidgetSnapshotPayload(
    string Id,
    string ComponentName,
    Dictionary<string, JsonElement> ComponentProps,
    bool AlwaysOnTop,
    JsonElement Size,
    WidgetWindowSizePayload? WindowSize,
    double TtlMs);

/// <summary>Matches the renderer's widget contracts.</summary>
internal static class WidgetContracts
{
    public static readonly InvokeEventDefinition<string, WidgetMutationPayload> Add =
        new("eventa:invoke:airi:windows:widgets:add");
    public static readonly InvokeEventDefinition<EmptyPayload, WidgetMutationPayload> Update =
        new("eventa:invoke:airi:windows:widgets:update");
    public static readonly InvokeEventDefinition<WidgetSnapshotPayload?, WidgetIdPayload> Fetch =
        new("eventa:invoke:airi:windows:widgets:fetch");
    public static readonly InvokeEventDefinition<string, WidgetIdPayload> Prepare =
        new("eventa:invoke:airi:windows:widgets:prepare");
    public static readonly InvokeEventDefinition<EmptyPayload, WidgetIdPayload> Open =
        new("eventa:invoke:airi:windows:widgets:open");
    public static readonly InvokeEventDefinition<EmptyPayload, WidgetIdPayload> Hide =
        new("eventa:invoke:airi:windows:widgets:hide");
    public static readonly InvokeEventDefinition<EmptyPayload, WidgetIdPayload> Remove =
        new("eventa:invoke:airi:windows:widgets:remove");
    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> Clear =
        new("eventa:invoke:airi:windows:widgets:clear");
    public static readonly EventDefinition<WidgetIdPayload> CloseRequested =
        new("eventa:event:airi:widgets:close-requested");
    public static readonly EventDefinition<WidgetSnapshotPayload> Render =
        new("eventa:event:airi:windows:widgets:render");

    public static KirieEventaJsonRegistry Register(KirieEventaJsonRegistry registry)
    {
        return registry
            .RegisterInvoke(Add, WidgetJsonContext.Default.String, WidgetJsonContext.Default.WidgetMutationPayload)
            .RegisterInvoke(Update, AiriDesktopJsonContext.Default.EmptyPayload, WidgetJsonContext.Default.WidgetMutationPayload)
            .RegisterInvoke(Fetch, WidgetJsonContext.Default.WidgetSnapshotPayload, WidgetJsonContext.Default.WidgetIdPayload)
            .RegisterInvoke(Prepare, WidgetJsonContext.Default.String, WidgetJsonContext.Default.WidgetIdPayload)
            .RegisterInvoke(Open, AiriDesktopJsonContext.Default.EmptyPayload, WidgetJsonContext.Default.WidgetIdPayload)
            .RegisterInvoke(Hide, AiriDesktopJsonContext.Default.EmptyPayload, WidgetJsonContext.Default.WidgetIdPayload)
            .RegisterInvoke(Remove, AiriDesktopJsonContext.Default.EmptyPayload, WidgetJsonContext.Default.WidgetIdPayload)
            .RegisterInvoke(Clear, AiriDesktopJsonContext.Default.EmptyPayload, AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterEvent(CloseRequested, WidgetJsonContext.Default.WidgetIdPayload)
            .RegisterEvent(Render, WidgetJsonContext.Default.WidgetSnapshotPayload);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(WidgetIdPayload))]
[JsonSerializable(typeof(WidgetMutationPayload))]
[JsonSerializable(typeof(WidgetSnapshotPayload))]
[JsonSerializable(typeof(string))]
internal sealed partial class WidgetJsonContext : JsonSerializerContext;
