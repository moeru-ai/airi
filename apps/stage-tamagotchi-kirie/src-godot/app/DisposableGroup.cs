/// <summary>Disposes several handler registrations as one, in order.</summary>
internal sealed class DisposableGroup(params IDisposable[] registrations) : IDisposable
{
    public void Dispose()
    {
        foreach (IDisposable registration in registrations)
        {
            registration.Dispose();
        }
    }
}
