using System.Text.Json;
using Eventa;

/// <summary>Opens and closes the window of one chat mode.</summary>
/// <param name="IsOpen">Whether the chat of this mode is open now, shown or hidden.</param>
/// <param name="Open">Shows the chat in this mode, and creates the window when needed.</param>
/// <param name="Close">Closes the window of this mode.</param>
/// <param name="RendererContext">The context of the window's mounted page, or `null` while the
/// window is closed or its page has not mounted.</param>
internal sealed record ChatModeWindow(
    Func<bool> IsOpen,
    Action Open,
    Action Close,
    Func<IEventContext?> RendererContext);

/// <summary>
/// Moves the chat between the windows of the chat modes, without losing the unsent draft on a
/// switch. It matches `apps/stage-tamagotchi/src/main/windows/chat/mode-switch.ts`.
///
/// Every piece of chat window work runs one at a time. A switch starts from the window where the
/// user chose the mode, and runs as one transaction:
///
/// 1. Collect the draft from that window.
/// 2. Save the new mode and open its window.
/// 3. Wait until the new window has put the draft back.
/// 4. Close every other chat window.
///
/// A failure at any step restores the saved mode, and closes the new window unless it was open
/// before. The window that asked is still open, so it still holds the draft.
///
/// All work runs on the Godot main thread. An await resumes there through the Godot
/// synchronization context.
/// </summary>
internal sealed class ChatModeSwitch
{
    /// <summary>
    /// Longest wait for the window that a switch opens to mount and put the draft back. Restoring
    /// waits up to 5 seconds for the synchronized chat session, so this leaves the page room to
    /// start. A window that misses it is closed.
    /// </summary>
    private static readonly TimeSpan HandoverTimeout = TimeSpan.FromSeconds(10);

    /// <summary>Longest wait for the window that a switch closes to give up its draft.</summary>
    private static readonly TimeSpan CollectTimeout = TimeSpan.FromSeconds(10);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Func<string> _getMode;
    private readonly Action<string> _setMode;
    private readonly IReadOnlyDictionary<string, ChatModeWindow> _windows;
    private DraftHandover? _handover;

    public ChatModeSwitch(
        Func<string> getMode,
        Action<string> setMode,
        IReadOnlyDictionary<string, ChatModeWindow> windows)
    {
        _getMode = getMode;
        _setMode = setMode;
        _windows = windows;
    }

    /// <summary>
    /// Runs chat window work after the work queued before it, even if that failed.
    /// </summary>
    public async Task RunAsync(Action work)
    {
        await _gate.WaitAsync();
        try
        {
            work();
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Shows the window of the saved mode, for a caller that does not change the mode, and closes
    /// the other windows. No draft moves.
    /// </summary>
    public Task ShowAsync()
    {
        return RunAsync(() =>
        {
            var mode = _getMode();
            _windows[mode].Open();
            CloseOtherWindows(mode);
        });
    }

    /// <summary>
    /// Saves <paramref name="mode"/> and moves the chat from the window of
    /// <paramref name="from"/>, where the user chose it, to the window of
    /// <paramref name="mode"/>. The draft goes with it.
    /// </summary>
    public async Task SwitchToAsync(string mode, string from)
    {
        await _gate.WaitAsync();
        try
        {
            await SwitchWindowsAsync(mode, from);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// The draft for a window of <paramref name="mode"/> while a switch opens it, otherwise
    /// `null`.
    /// </summary>
    public JsonElement? TakeDraft(string mode)
    {
        if (_handover?.Target != mode)
        {
            return null;
        }

        _handover.Taken = true;
        return _handover.Draft;
    }

    /// <summary>
    /// Records whether a window of <paramref name="mode"/> restored its draft. A report from any
    /// other window is ignored, and so is a report from a take that came before the switch, such
    /// as the take of a page that mounted earlier.
    /// </summary>
    public void SettleDraft(string mode, bool restored)
    {
        if (_handover is { } handover && handover.Target == mode && handover.Taken)
        {
            handover.Settled.TrySetResult(restored);
        }
    }

    private async Task SwitchWindowsAsync(string mode, string from)
    {
        if (mode == from)
        {
            return;
        }

        var next = _windows[mode];
        var savedMode = _getMode();
        var draft = await CollectDraftAsync(_windows[from]);
        var handover = new DraftHandover(mode, draft);
        _handover = handover;
        var wasOpen = next.IsOpen();
        _setMode(mode);

        try
        {
            next.Open();
            // A page that has not mounted yet misses the offer, and takes the draft when it
            // mounts.
            next.RendererContext()?.Emit(ChatWindowContracts.DraftOffered, new EmptyPayload());
            if (!await handover.Settled.Task.WaitAsync(HandoverTimeout))
            {
                throw new InvalidOperationException(
                    "The new chat window could not restore the draft.");
            }
        }
        catch
        {
            // The switch closes only a window that it opened.
            if (!wasOpen)
            {
                next.Close();
            }

            _setMode(savedMode);
            throw;
        }
        finally
        {
            _handover = null;
        }

        CloseOtherWindows(mode);
    }

    /// <summary>
    /// The conversation and unsent draft of a window, or `null` when the window is closed or shows
    /// no conversation. Throws when the window cannot answer in time.
    /// </summary>
    private static async Task<JsonElement?> CollectDraftAsync(ChatModeWindow window)
    {
        if (window.RendererContext() is not { } context)
        {
            return null;
        }

        using var timeout = new CancellationTokenSource(CollectTimeout);
        var reply = await context
            .CreateInvokeClient(ChatWindowContracts.CollectDraft)
            .InvokeAsync(new EmptyPayload(), timeout.Token);
        return reply.Draft;
    }

    /// <summary>Closes every chat window other than the one of <paramref name="mode"/>.</summary>
    private void CloseOtherWindows(string mode)
    {
        foreach (var (other, window) in _windows)
        {
            if (other != mode)
            {
                window.Close();
            }
        }
    }

    /// <summary>
    /// The draft that the running switch carries into the window it opens. `Target` is the
    /// correlation key: only a window of that mode takes the draft or settles it, so the window
    /// being closed cannot take it back.
    /// </summary>
    private sealed class DraftHandover(string target, JsonElement? draft)
    {
        public string Target { get; } = target;

        public JsonElement? Draft { get; } = draft;

        /// <summary>
        /// Whether the target window took the draft. Its report counts only after that.
        /// </summary>
        public bool Taken { get; set; }

        public TaskCompletionSource<bool> Settled { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
}
