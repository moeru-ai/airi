using System.Text.Json.Serialization;
using Eventa;
using GdKirie.EventaAdapter;

internal sealed record InlayEscapeWatchPayload(bool Enabled);

internal static class InlayContracts
{
    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> Open =
        new("eventa:invoke:electron:windows:inlay:open");
    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> ReturnHome =
        new("eventa:invoke:electron:windows:inlay:return-home");
    public static readonly EventDefinition<EmptyPayload> Ready =
        new("eventa:event:airi:inlay:ready");

    public static readonly InvokeEventDefinition<bool, InlayEscapeWatchPayload> WatchEscape =
        new("eventa:invoke:airi:inlay:watch-escape");
    public static readonly EventDefinition<EmptyPayload> Escape =
        new("eventa:event:airi:inlay:escape");

    public static KirieEventaJsonRegistry Register(KirieEventaJsonRegistry registry)
    {
        return registry
            .RegisterInvoke(Open, AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(ReturnHome, AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterEvent(Ready, AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(WatchEscape, AiriDesktopJsonContext.Default.Boolean,
                InlayJsonContext.Default.InlayEscapeWatchPayload)
            .RegisterEvent(Escape, AiriDesktopJsonContext.Default.EmptyPayload);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(InlayEscapeWatchPayload))]
internal sealed partial class InlayJsonContext : JsonSerializerContext;
