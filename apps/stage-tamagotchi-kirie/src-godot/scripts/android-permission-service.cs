using Godot;

internal sealed class AndroidPermissionService : IDisposable
{
    private const string AndroidPluginName = "AiriAndroid";

    private readonly GodotObject _plugin;
    private readonly Callable _permissionResultCallable;
    private readonly Dictionary<string, TaskCompletionSource<bool>> _pending = [];
    private bool _disposed;

    public AndroidPermissionService()
    {
        if (!Engine.HasSingleton(AndroidPluginName))
        {
            throw new InvalidOperationException("The AIRI Android plugin is unavailable.");
        }

        _plugin = Engine.GetSingleton(AndroidPluginName);
        _permissionResultCallable = Callable.From<string, bool>(OnPermissionResult);
        _plugin.Connect("permission_result", _permissionResultCallable);
    }

    public bool Check(string permission)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        return _plugin.Call("checkPermission", permission).AsBool();
    }

    public async Task<bool> Request(string permission, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (Check(permission))
        {
            return true;
        }

        if (!_pending.TryGetValue(permission, out var completion))
        {
            completion = new TaskCompletionSource<bool>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            _pending.Add(permission, completion);
            _plugin.Call("requestPermission", permission);
        }

        return await completion.Task.WaitAsync(cancellationToken);
    }

    public void OpenSettings(string permission)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _plugin.Call("openPermissionSettings", permission);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _plugin.Disconnect("permission_result", _permissionResultCallable);
        foreach (var completion in _pending.Values)
        {
            completion.TrySetCanceled();
        }
        _pending.Clear();
    }

    private void OnPermissionResult(string permission, bool granted)
    {
        if (_pending.Remove(permission, out var completion))
        {
            completion.TrySetResult(granted);
        }
    }
}
