using Xunit;

public class MicrophonePermissionCoordinatorTests
{
    [Fact]
    public void CoalescesConcurrentRequestsIntoOnePrompt()
    {
        // ROOT CAUSE:
        //
        // CEF can issue concurrent requests while one AIRI permission prompt is open.
        // Showing one modal per raw request creates conflicting decisions and exposes
        // native request identifiers to the renderer.
        //
        // We fixed this by keeping native requests in one host-owned prompt generation.
        using var permissions = new MicrophonePermissionCoordinator(
            MicrophonePermissionState.NotDetermined,
            TimeSpan.FromMinutes(2));
        var decisions = new List<bool>();

        MicrophonePermissionPromptPayload? prompt = permissions.Request(decisions.Add, 10);
        MicrophonePermissionPromptPayload? duplicatePrompt = permissions.Request(decisions.Add, 20);

        Assert.NotNull(prompt);
        Assert.Null(duplicatePrompt);

        permissions.Resolve(prompt.PromptId, MicrophonePermissionState.Granted);

        Assert.Equal([true, true], decisions);
    }

    [Fact]
    public void AppliesPersistedDenialUntilReset()
    {
        using var permissions = new MicrophonePermissionCoordinator(
            MicrophonePermissionState.Denied,
            TimeSpan.FromMinutes(2));
        bool? decision = null;

        MicrophonePermissionPromptPayload? prompt = permissions.Request(value => decision = value, 10);

        Assert.Null(prompt);
        Assert.False(decision);

        permissions.Reset();
        prompt = permissions.Request(value => decision = value, 20);

        Assert.NotNull(prompt);
    }

    [Fact]
    public void DeniesExpiredPromptWithoutPersistingState()
    {
        using var permissions = new MicrophonePermissionCoordinator(
            MicrophonePermissionState.NotDetermined,
            TimeSpan.FromMilliseconds(100));
        bool? decision = null;
        MicrophonePermissionPromptPayload? prompt = permissions.Request(value => decision = value, 10);

        Assert.Null(permissions.Expire(109));
        Assert.Equal(prompt!.PromptId, permissions.Expire(110));
        Assert.False(decision);
        Assert.Equal(MicrophonePermissionState.NotDetermined, permissions.State);
    }

    [Fact]
    public void DeniesPendingRequestsOnShutdown()
    {
        var permissions = new MicrophonePermissionCoordinator(
            MicrophonePermissionState.NotDetermined,
            TimeSpan.FromMinutes(2));
        bool? decision = null;
        permissions.Request(value => decision = value, 10);

        permissions.Dispose();

        Assert.False(decision);
    }
}
