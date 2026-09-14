using System.Text.Json;
using System.Text.Json.Serialization;
using Eventa;
using GdKirie.EventaAdapter;

internal sealed record EmptyPayload;
internal sealed record OpenSettingsPayload(string? Route);
internal sealed record SettingsNavigatePayload(string Route);
internal sealed record NoticeOpenPayload(
    string? Id,
    string Route,
    string? Type,
    Dictionary<string, JsonElement>? Payload);
internal sealed record NoticePagePayload(string? Id);
internal sealed record NoticePendingPayload(
    string Id,
    string? Type,
    Dictionary<string, JsonElement>? Payload);
internal sealed record NoticeActionPayload(string Id, string Action);
internal sealed record AuthTokensPayload(
    string AccessToken,
    string? RefreshToken,
    string? IdToken,
    int ExpiresIn);
internal sealed record AuthErrorPayload(string Error);
internal sealed record AuthConfigurationPayload(string ClientId, string ServerUrl);

internal static class AiriDesktopEvents
{
    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> OpenOnboarding =
        new("eventa:invoke:electron:windows:onboarding:open");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> CloseOnboarding =
        new("eventa:invoke:electron:windows:onboarding:close");

    public static readonly InvokeEventDefinition<EmptyPayload, OpenSettingsPayload> OpenSettings =
        new("eventa:invoke:electron:windows:settings:open");

    public static readonly EventDefinition<SettingsNavigatePayload> SettingsNavigate =
        new("eventa:event:electron:windows:settings:navigate");

    public static readonly EventDefinition<EmptyPayload> SettingsReady =
        new("eventa:event:electron:windows:settings:ready");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> OpenChat =
        new("eventa:invoke:electron:windows:chat:open");

    public static readonly EventDefinition<EmptyPayload> ChatReady =
        new("eventa:event:electron:windows:chat:ready");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> QuitApp =
        new("eventa:invoke:electron:app:quit");

    public static readonly InvokeEventDefinition<bool, NoticeOpenPayload> OpenNotice =
        new("eventa:invoke:open:electron:windows:notice");

    public static readonly InvokeEventDefinition<EmptyPayload, NoticeActionPayload> NoticeAction =
        new("eventa:invoke:action:electron:windows:notice");

    public static readonly InvokeEventDefinition<NoticePendingPayload?, NoticePagePayload> NoticePageMounted =
        new("eventa:invoke:page-mounted:electron:windows:notice");

    public static readonly InvokeEventDefinition<EmptyPayload, NoticePagePayload> NoticePageUnmounted =
        new("eventa:invoke:page-unmounted:electron:windows:notice");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> AuthStartLogin =
        new("eventa:invoke:electron:auth:start-login");

    public static readonly EventDefinition<AuthTokensPayload> AuthCallback =
        new("eventa:event:electron:auth:callback");

    public static readonly EventDefinition<AuthErrorPayload> AuthCallbackError =
        new("eventa:event:electron:auth:callback-error");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> AuthLogout =
        new("eventa:invoke:electron:auth:logout");

    public static readonly InvokeEventDefinition<EmptyPayload, AuthConfigurationPayload> AuthConfigure =
        new("eventa:invoke:airi:auth:configure");
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
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.OpenSettings,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.OpenSettingsPayload)
            .RegisterEvent(
                AiriDesktopEvents.SettingsNavigate,
                AiriDesktopJsonContext.Default.SettingsNavigatePayload)
            .RegisterEvent(
                AiriDesktopEvents.SettingsReady,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.OpenChat,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterEvent(
                AiriDesktopEvents.ChatReady,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.QuitApp,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.OpenNotice,
                AiriDesktopJsonContext.Default.Boolean,
                AiriDesktopJsonContext.Default.NoticeOpenPayload)
            .RegisterInvoke(
                AiriDesktopEvents.NoticeAction,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.NoticeActionPayload)
            .RegisterInvoke(
                AiriDesktopEvents.NoticePageMounted,
                AiriDesktopJsonContext.Default.NoticePendingPayload,
                AiriDesktopJsonContext.Default.NoticePagePayload)
            .RegisterInvoke(
                AiriDesktopEvents.NoticePageUnmounted,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.NoticePagePayload)
            .RegisterInvoke(
                AiriDesktopEvents.AuthStartLogin,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterEvent(
                AiriDesktopEvents.AuthCallback,
                AiriDesktopJsonContext.Default.AuthTokensPayload)
            .RegisterEvent(
                AiriDesktopEvents.AuthCallbackError,
                AiriDesktopJsonContext.Default.AuthErrorPayload)
            .RegisterInvoke(
                AiriDesktopEvents.AuthLogout,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.AuthConfigure,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.AuthConfigurationPayload);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(EmptyPayload))]
[JsonSerializable(typeof(OpenSettingsPayload))]
[JsonSerializable(typeof(SettingsNavigatePayload))]
[JsonSerializable(typeof(bool))]
[JsonSerializable(typeof(NoticeOpenPayload))]
[JsonSerializable(typeof(NoticePagePayload))]
[JsonSerializable(typeof(NoticePendingPayload))]
[JsonSerializable(typeof(NoticeActionPayload))]
[JsonSerializable(typeof(AuthTokensPayload))]
[JsonSerializable(typeof(AuthErrorPayload))]
[JsonSerializable(typeof(AuthConfigurationPayload))]
internal sealed partial class AiriDesktopJsonContext : JsonSerializerContext;
