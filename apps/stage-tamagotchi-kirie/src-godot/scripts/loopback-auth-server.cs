using System.Net;
using System.Net.Sockets;
using System.Text;

internal sealed class LoopbackAuthServer : IDisposable
{
    private static readonly TimeSpan LoginTimeout = TimeSpan.FromMinutes(5);

    private readonly HttpListener _listener;
    private readonly string _expectedState;
    private readonly CancellationTokenSource _closed = new();
    private readonly CancellationTokenSource _timeout = new(LoginTimeout);
    private readonly TaskCompletionSource<string> _result =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly Task _serveTask;
    private int _disposeState;

    private LoopbackAuthServer(HttpListener listener, int port, string expectedState)
    {
        _listener = listener;
        Port = port;
        _expectedState = expectedState;
        _serveTask = ServeAsync();
    }

    public int Port { get; }

    public Task<string> Result => _result.Task;

    public static LoopbackAuthServer Start(string expectedState)
    {
        ArgumentException.ThrowIfNullOrEmpty(expectedState);

        for (var attempt = 0; attempt < 10; attempt++)
        {
            var port = FindAvailablePort();
            var listener = new HttpListener();
            listener.Prefixes.Add($"http://127.0.0.1:{port}/");
            try
            {
                listener.Start();
                return new LoopbackAuthServer(listener, port, expectedState);
            }
            catch (HttpListenerException) when (attempt < 9)
            {
                listener.Close();
            }
        }

        throw new InvalidOperationException("AIRI could not bind a loopback port for sign-in.");
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposeState, 1) != 0)
        {
            return;
        }
        _closed.Cancel();
        _listener.Close();
        _result.TrySetCanceled(_closed.Token);
        _serveTask.GetAwaiter().GetResult();
        _timeout.Dispose();
        _closed.Dispose();
    }

    private static int FindAvailablePort()
    {
        using var reservation = new TcpListener(IPAddress.Loopback, 0)
        {
            ExclusiveAddressUse = true,
        };
        reservation.Start();
        return ((IPEndPoint)reservation.LocalEndpoint).Port;
    }

    private async Task ServeAsync()
    {
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(
            _closed.Token,
            _timeout.Token);
        try
        {
            while (!cancellation.IsCancellationRequested && !_result.Task.IsCompleted)
            {
                var context = await _listener.GetContextAsync()
                    .WaitAsync(cancellation.Token)
                    .ConfigureAwait(false);
                await HandleAsync(context).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (_closed.IsCancellationRequested)
        {
            _result.TrySetCanceled(_closed.Token);
        }
        catch (OperationCanceledException) when (_timeout.IsCancellationRequested)
        {
            _result.TrySetException(new TimeoutException("Sign-in timed out because no callback was received."));
        }
        catch (ObjectDisposedException) when (_closed.IsCancellationRequested)
        {
            _result.TrySetCanceled(_closed.Token);
        }
        catch (HttpListenerException) when (_closed.IsCancellationRequested)
        {
            _result.TrySetCanceled(_closed.Token);
        }
        catch (Exception error)
        {
            _result.TrySetException(error);
        }
        finally
        {
            if (_listener.IsListening)
            {
                _listener.Stop();
            }
        }
    }

    private async Task HandleAsync(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;
        AddCorsHeaders(response);

        if (StringComparer.Ordinal.Equals(request.HttpMethod, "OPTIONS"))
        {
            response.StatusCode = (int)HttpStatusCode.NoContent;
            response.Close();
            return;
        }

        if (!StringComparer.Ordinal.Equals(request.HttpMethod, "GET")
            || !StringComparer.Ordinal.Equals(request.Url?.AbsolutePath, "/callback"))
        {
            await WriteHtmlAsync(response, HttpStatusCode.NotFound, "Not found").ConfigureAwait(false);
            return;
        }

        var state = request.QueryString["state"] ?? string.Empty;
        if (!StringComparer.Ordinal.Equals(state, _expectedState))
        {
            await WriteHtmlAsync(response, HttpStatusCode.BadRequest, "Invalid state").ConfigureAwait(false);
            return;
        }

        var error = request.QueryString["error"];
        if (!string.IsNullOrEmpty(error))
        {
            var description = request.QueryString["error_description"];
            await WriteHtmlAsync(
                    response,
                    HttpStatusCode.OK,
                    "Authentication failed. You can close this window.")
                .ConfigureAwait(false);
            _result.TrySetException(new InvalidOperationException(
                string.IsNullOrEmpty(description) ? error : description));
            return;
        }

        var code = request.QueryString["code"] ?? string.Empty;
        if (code.Length == 0)
        {
            await WriteHtmlAsync(response, HttpStatusCode.BadRequest, "Missing parameters").ConfigureAwait(false);
            return;
        }

        await WriteHtmlAsync(
                response,
                HttpStatusCode.OK,
                "Authentication successful. You can close this window and return to AIRI.")
            .ConfigureAwait(false);
        _result.TrySetResult(code);
    }

    private static void AddCorsHeaders(HttpListenerResponse response)
    {
        response.Headers["Access-Control-Allow-Origin"] = "*";
        response.Headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    }

    private static async Task WriteHtmlAsync(
        HttpListenerResponse response,
        HttpStatusCode status,
        string message)
    {
        var body = Encoding.UTF8.GetBytes($"<html><body><h2>{WebUtility.HtmlEncode(message)}</h2></body></html>");
        response.StatusCode = (int)status;
        response.ContentType = "text/html; charset=utf-8";
        response.ContentLength64 = body.Length;
        await response.OutputStream.WriteAsync(body).ConfigureAwait(false);
        response.Close();
    }
}
