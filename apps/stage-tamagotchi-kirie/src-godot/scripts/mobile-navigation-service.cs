using Eventa;

/// <summary>
/// Routes Android window requests to the persistent main renderer.
/// The renderer owns route history. Disposal removes all host invoke handlers.
/// </summary>
internal sealed class MobileNavigationService : IDisposable
{
    private readonly IEventContext _context;
    private readonly IDisposable[] _registrations;
    private bool _disposed;

    public MobileNavigationService(IEventContext context)
    {
        _context = context;
        _registrations =
        [
            context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenChat,
                (EmptyPayload _, CancellationToken _) => Navigate("/chat")),
            context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenSettings,
                (OpenSettingsPayload payload, CancellationToken _) => Navigate(payload.ResolveRoute())),
            context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenOnboarding,
                (EmptyPayload _, CancellationToken _) => Navigate("/onboarding")),
            context.RegisterInvokeHandler(
                AiriDesktopEvents.CloseOnboarding,
                (EmptyPayload _, CancellationToken _) => Navigate("/", replace: true)),
            context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenNotice,
                (NoticeOpenPayload _, CancellationToken _) =>
                    throw new PlatformNotSupportedException("Desktop notices are not available on Android.")),
            context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenMainDevtools,
                (EmptyPayload _, CancellationToken _) =>
                    throw new PlatformNotSupportedException("The CEF inspector is not available on Android.")),
            context.RegisterInvokeHandler(
                AiriDesktopEvents.OpenDevtoolsWindow,
                (OpenDevtoolsWindowPayload _, CancellationToken _) =>
                    throw new PlatformNotSupportedException("Developer windows are not available on Android.")),
        ];
    }

    public void RequestBack()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _context.Emit(AiriDesktopEvents.MobileBackRequested, new EmptyPayload());
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        foreach (var registration in _registrations)
        {
            registration.Dispose();
        }
    }

    private Task<EmptyPayload> Navigate(string route, bool replace = false)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _context.Emit(AiriDesktopEvents.MobileNavigate, new MobileNavigatePayload(route, replace));
        return Task.FromResult(new EmptyPayload());
    }
}
