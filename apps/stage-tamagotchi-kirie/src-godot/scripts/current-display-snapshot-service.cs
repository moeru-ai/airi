using Eventa;
using GdKirie.EventaAdapter;
using Godot;

internal static class CurrentDisplaySnapshotService
{
    /// <summary>
    /// Attaches the AIRI display snapshot handler to the main renderer's Eventa context.
    /// The returned registration owns the handler lifetime and must be disposed by the caller.
    /// </summary>
    public static IDisposable Attach(IEventContext context, Window hostWindow)
    {
        return context.RegisterInvokeHandler(
            AiriDesktopEvents.GetCurrentDisplaySnapshot,
            (EmptyPayload _, CancellationToken _) =>
                Task.FromResult(Capture(hostWindow)));
    }

    private static DesktopDisplaySnapshotPayload Capture(Window hostWindow)
    {
        var screen = hostWindow.CurrentScreen;
        var bounds = new Rect2I(
            DisplayServer.ScreenGetPosition(screen),
            DisplayServer.ScreenGetSize(screen));
        var workArea = DisplayServer.ScreenGetUsableRect(screen);
        var scale = DesktopWindowSizing.GetDisplayScale(hostWindow);

        return new DesktopDisplaySnapshotPayload(
            ToPayload(bounds),
            ToPayload(workArea),
            scale);
    }

    private static DesktopDisplayBoundsPayload ToPayload(Rect2I bounds)
    {
        return new DesktopDisplayBoundsPayload(
            bounds.Position.X,
            bounds.Position.Y,
            bounds.Size.X,
            bounds.Size.Y);
    }
}
