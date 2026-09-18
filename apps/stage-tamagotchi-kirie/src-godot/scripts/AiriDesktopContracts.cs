using System.Text.Json;
using System.Text.Json.Serialization;
using Eventa;
using GdKirie.EventaAdapter;

internal sealed record EmptyPayload;
internal sealed record OpenSettingsPayload(string? Route);
internal sealed record SettingsNavigatePayload(string Route);
internal sealed record OpenDevtoolsWindowPayload(
    string Key,
    string? Route,
    int? Width,
    int? Height,
    int? X,
    int? Y);
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
internal sealed record DesktopDisplayBoundsPayload(int X, int Y, int Width, int Height);
internal sealed record DesktopDisplaySnapshotPayload(
    DesktopDisplayBoundsPayload Bounds,
    DesktopDisplayBoundsPayload WorkArea,
    float Scale);
internal sealed record MicrophonePermissionStatePayload(string Permission, string State);
internal sealed record MicrophonePermissionPromptPayload(string Permission, string PromptId);
internal sealed record MicrophonePermissionPromptSnapshotPayload(string Permission, string? PromptId);
internal sealed record MicrophonePermissionDecisionPayload(string PromptId, string Decision);
internal sealed record MicrophonePermissionPromptDismissedPayload(string PromptId);

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

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> OpenMainDevtools =
        new("eventa:invoke:electron:windows:main:devtools:open");

    public static readonly InvokeEventDefinition<EmptyPayload, OpenDevtoolsWindowPayload> OpenDevtoolsWindow =
        new("eventa:invoke:electron:windows:devtools:open");

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

    public static readonly InvokeEventDefinition<DesktopDisplaySnapshotPayload, EmptyPayload> GetCurrentDisplaySnapshot =
        new("eventa:invoke:airi:desktop:current-display:get");

    public static readonly InvokeEventDefinition<MicrophonePermissionStatePayload, EmptyPayload>
        GetMicrophonePermissionState =
            new("eventa:invoke:airi:permissions:microphone:get-state");

    public static readonly InvokeEventDefinition<MicrophonePermissionPromptSnapshotPayload, EmptyPayload>
        GetMicrophonePermissionPrompt =
            new("eventa:invoke:airi:permissions:microphone:get-prompt");

    public static readonly InvokeEventDefinition<MicrophonePermissionStatePayload, EmptyPayload>
        ResetMicrophonePermission =
            new("eventa:invoke:airi:permissions:microphone:reset");

    public static readonly InvokeEventDefinition<EmptyPayload, MicrophonePermissionDecisionPayload>
        ResolveMicrophonePermissionPrompt =
            new("eventa:invoke:airi:permissions:microphone:resolve-prompt");

    public static readonly EventDefinition<MicrophonePermissionStatePayload>
        MicrophonePermissionStateChanged =
            new("eventa:event:airi:permissions:microphone:state-changed");

    public static readonly EventDefinition<MicrophonePermissionPromptPayload>
        MicrophonePermissionPromptRequested =
            new("eventa:event:airi:permissions:microphone:prompt-requested");

    public static readonly EventDefinition<MicrophonePermissionPromptDismissedPayload>
        MicrophonePermissionPromptDismissed =
            new("eventa:event:airi:permissions:microphone:prompt-dismissed");
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
            .RegisterInvoke(
                AiriDesktopEvents.OpenMainDevtools,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.OpenDevtoolsWindow,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.OpenDevtoolsWindowPayload)
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
                AiriDesktopJsonContext.Default.AuthConfigurationPayload)
            .RegisterInvoke(
                AiriDesktopEvents.GetCurrentDisplaySnapshot,
                AiriDesktopJsonContext.Default.DesktopDisplaySnapshotPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.GetMicrophonePermissionState,
                AiriDesktopJsonContext.Default.MicrophonePermissionStatePayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.GetMicrophonePermissionPrompt,
                AiriDesktopJsonContext.Default.MicrophonePermissionPromptSnapshotPayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.ResetMicrophonePermission,
                AiriDesktopJsonContext.Default.MicrophonePermissionStatePayload,
                AiriDesktopJsonContext.Default.EmptyPayload)
            .RegisterInvoke(
                AiriDesktopEvents.ResolveMicrophonePermissionPrompt,
                AiriDesktopJsonContext.Default.EmptyPayload,
                AiriDesktopJsonContext.Default.MicrophonePermissionDecisionPayload)
            .RegisterEvent(
                AiriDesktopEvents.MicrophonePermissionStateChanged,
                AiriDesktopJsonContext.Default.MicrophonePermissionStatePayload)
            .RegisterEvent(
                AiriDesktopEvents.MicrophonePermissionPromptRequested,
                AiriDesktopJsonContext.Default.MicrophonePermissionPromptPayload)
            .RegisterEvent(
                AiriDesktopEvents.MicrophonePermissionPromptDismissed,
                AiriDesktopJsonContext.Default.MicrophonePermissionPromptDismissedPayload);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(EmptyPayload))]
[JsonSerializable(typeof(OpenSettingsPayload))]
[JsonSerializable(typeof(SettingsNavigatePayload))]
[JsonSerializable(typeof(OpenDevtoolsWindowPayload))]
[JsonSerializable(typeof(bool))]
[JsonSerializable(typeof(NoticeOpenPayload))]
[JsonSerializable(typeof(NoticePagePayload))]
[JsonSerializable(typeof(NoticePendingPayload))]
[JsonSerializable(typeof(NoticeActionPayload))]
[JsonSerializable(typeof(AuthTokensPayload))]
[JsonSerializable(typeof(AuthErrorPayload))]
[JsonSerializable(typeof(AuthConfigurationPayload))]
[JsonSerializable(typeof(DesktopDisplayBoundsPayload))]
[JsonSerializable(typeof(DesktopDisplaySnapshotPayload))]
[JsonSerializable(typeof(MicrophonePermissionStatePayload))]
[JsonSerializable(typeof(MicrophonePermissionPromptPayload))]
[JsonSerializable(typeof(MicrophonePermissionPromptSnapshotPayload))]
[JsonSerializable(typeof(MicrophonePermissionDecisionPayload))]
[JsonSerializable(typeof(MicrophonePermissionPromptDismissedPayload))]
internal sealed partial class AiriDesktopJsonContext : JsonSerializerContext;
