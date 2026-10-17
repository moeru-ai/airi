using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

/// <summary>Observes Escape while the voice inlay is active. It never consumes or stores keyboard input.</summary>
[SupportedOSPlatform("macos")]
internal sealed class MacOsInlayEscapeObserver : IDisposable
{
    private const string CoreGraphics = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";
    private const string CoreFoundation = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
    private const uint SessionEventTap = 1;
    private const uint HeadInsertEventTap = 0;
    private const uint ListenOnly = 1;
    private const uint Utf8Encoding = 0x08000100;
    private const uint TapDisabledByTimeout = uint.MaxValue - 1;
    private const uint TapDisabledByUserInput = uint.MaxValue;
    private const uint KeyDown = 10;
    private const uint KeyboardEventKeycode = 9;
    private const uint KeyboardEventAutorepeat = 8;
    private const long EscapeKeycode = 53;
    private readonly EventTapCallback _callback;
    private nint _tap;
    private nint _source;
    private nint _mode;
    private nint _runLoop;
    private readonly ManualResetEventSlim _started = new();
    private Thread? _thread;
    private ExceptionDispatchInfo? _failure;
    private volatile bool _stopping;
    private bool _disposed;
    private int _pending;

    public MacOsInlayEscapeObserver()
    {
        if (!CGPreflightListenEventAccess())
        {
            throw new InvalidOperationException(
                "Global Escape needs macOS Input Monitoring permission for Godot. Local Escape remains available.");
        }

        _callback = OnEvent;
        try
        {
            // A listen-only session tap leaves Escape available to the focused application.
            _tap = CGEventTapCreate(SessionEventTap, HeadInsertEventTap, ListenOnly,
                1UL << (int)KeyDown, _callback, nint.Zero);
            if (_tap == nint.Zero)
            {
                throw new InvalidOperationException("Cannot create the passive Escape observer.");
            }
            _source = CFMachPortCreateRunLoopSource(nint.Zero, _tap, 0);
            _mode = CFStringCreateWithCString(nint.Zero, "kCFRunLoopDefaultMode", Utf8Encoding);
            if (_source == nint.Zero || _mode == nint.Zero)
            {
                throw new InvalidOperationException("Cannot create the Escape observer run loop source.");
            }
            // Godot owns its application event loop. This observer supplies its own running CF loop.
            _thread = new Thread(Run) { IsBackground = true, Name = "AIRI voice Escape observer" };
            _thread.Start();
            _started.Wait();
            _failure?.Throw();
        }
        catch
        {
            Dispose();
            throw;
        }
    }

    public bool TakeEscape()
    {
        Interlocked.Exchange(ref _failure, null)?.Throw();
        return Interlocked.Exchange(ref _pending, 0) != 0;
    }

    private void Run()
    {
        try
        {
            _runLoop = CFRunLoopGetCurrent();
            CFRunLoopAddSource(_runLoop, _source, _mode);
            CGEventTapEnable(_tap, true);
            _started.Set();
            while (!_stopping)
            {
                CFRunLoopRunInMode(_mode, 0.1, true);
            }
        }
        catch (Exception error)
        {
            _failure = ExceptionDispatchInfo.Capture(error);
        }
        finally
        {
            _started.Set();
            if (_runLoop != nint.Zero)
            {
                CFRunLoopRemoveSource(_runLoop, _source, _mode);
            }
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }
        _disposed = true;
        _stopping = true;
        if (_runLoop != nint.Zero)
        {
            CFRunLoopStop(_runLoop);
            CFRunLoopWakeUp(_runLoop);
        }
        _thread?.Join();
        _started.Dispose();
        if (_tap != nint.Zero)
        {
            CFMachPortInvalidate(_tap);
            CFRelease(_tap);
            _tap = nint.Zero;
        }
        if (_source != nint.Zero)
        {
            CFRelease(_source);
            _source = nint.Zero;
        }
        if (_mode != nint.Zero)
        {
            CFRelease(_mode);
            _mode = nint.Zero;
        }
        _runLoop = nint.Zero;
        Interlocked.Exchange(ref _pending, 0);
        GC.KeepAlive(_callback);
    }

    private nint OnEvent(nint proxy, uint type, nint eventRef, nint userInfo)
    {
        if (type is TapDisabledByTimeout or TapDisabledByUserInput)
        {
            CGEventTapEnable(_tap, true);
            return eventRef;
        }
        if (type == KeyDown
            && CGEventGetIntegerValueField(eventRef, KeyboardEventKeycode) == EscapeKeycode
            && CGEventGetIntegerValueField(eventRef, KeyboardEventAutorepeat) == 0)
        {
            Interlocked.Exchange(ref _pending, 1);
        }
        return eventRef;
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate nint EventTapCallback(nint proxy, uint type, nint eventRef, nint userInfo);

    [DllImport(CoreGraphics)]
    [return: MarshalAs(UnmanagedType.I1)]
    private static extern bool CGPreflightListenEventAccess();

    [DllImport(CoreGraphics)]
    private static extern nint CGEventTapCreate(
        uint tap, uint place, uint options, ulong mask, EventTapCallback callback, nint userInfo);

    [DllImport(CoreGraphics)]
    private static extern void CGEventTapEnable(nint tap, [MarshalAs(UnmanagedType.I1)] bool enabled);

    [DllImport(CoreGraphics)]
    private static extern long CGEventGetIntegerValueField(nint eventRef, uint field);

    [DllImport(CoreFoundation)]
    private static extern nint CFMachPortCreateRunLoopSource(nint allocator, nint port, nint order);

    [DllImport(CoreFoundation)]
    private static extern nint CFStringCreateWithCString(
        nint allocator, [MarshalAs(UnmanagedType.LPUTF8Str)] string text, uint encoding);

    [DllImport(CoreFoundation)]
    private static extern nint CFRunLoopGetCurrent();

    [DllImport(CoreFoundation)]
    private static extern int CFRunLoopRunInMode(
        nint mode, double seconds, [MarshalAs(UnmanagedType.I1)] bool returnAfterSourceHandled);

    [DllImport(CoreFoundation)]
    private static extern void CFRunLoopStop(nint loop);

    [DllImport(CoreFoundation)]
    private static extern void CFRunLoopWakeUp(nint loop);

    [DllImport(CoreFoundation)]
    private static extern void CFRunLoopAddSource(nint loop, nint source, nint mode);

    [DllImport(CoreFoundation)]
    private static extern void CFRunLoopRemoveSource(nint loop, nint source, nint mode);

    [DllImport(CoreFoundation)]
    private static extern void CFMachPortInvalidate(nint port);

    [DllImport(CoreFoundation)]
    private static extern void CFRelease(nint value);
}
