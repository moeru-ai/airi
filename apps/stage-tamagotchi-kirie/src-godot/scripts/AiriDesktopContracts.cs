using System.Text.Json.Serialization;
using Eventa;
using GdKirie.EventaAdapter;

internal sealed record EmptyPayload;

internal static class AiriDesktopEvents
{
    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> OpenOnboarding =
        new("eventa:invoke:electron:windows:onboarding:open");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> CloseOnboarding =
        new("eventa:invoke:electron:windows:onboarding:close");
}

internal static class AiriDesktopContracts
{
    public static KirieEventaJsonRegistry Register(KirieEventaJsonRegistry registry)
    {
        return registry
            .RegisterInvoke(
                AiriDesktopEvents.OpenOnboarding,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.CloseOnboarding,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(EmptyPayload))]
internal sealed partial class AiriDesktopJsonContext : JsonSerializerContext;
