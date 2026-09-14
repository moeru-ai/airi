using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Eventa;
using Godot;
using CryptoRandom = System.Security.Cryptography.RandomNumberGenerator;
using NetHttpClient = System.Net.Http.HttpClient;

internal sealed class AuthService : IDisposable
{
    private const string AuthorizePath = "/api/auth/oauth2/authorize";
    private const string TokenPath = "/api/auth/oauth2/token";
    private const string Scopes = "openid profile email offline_access";

    private readonly NetHttpClient _http = new();
    private readonly ConcurrentQueue<AuthResult> _pending = new();
    private readonly HashSet<AuthBinding> _bindings = [];
    private LoginAttempt? _attempt;
    private long _generation;
    private bool _disposed;

    public IDisposable Attach(IEventContext context)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var binding = new AuthBinding(this, context);
        _bindings.Add(binding);
        return binding;
    }

    public void ProcessPending()
    {
        while (_pending.TryDequeue(out var result))
        {
            if (result.Generation != _generation)
            {
                continue;
            }

            var binding = result.Binding;
            _attempt?.Dispose();
            _attempt = null;
            if (!binding.IsActive)
            {
                continue;
            }

            if (result.Tokens is not null)
            {
                binding.Context.Emit(AiriDesktopEvents.AuthCallback, result.Tokens);
                continue;
            }

            binding.Context.Emit(
                AiriDesktopEvents.AuthCallbackError,
                new AuthErrorPayload(result.Error ?? "OIDC sign-in failed"));
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        foreach (var binding in _bindings.ToArray())
        {
            binding.Dispose();
        }

        CancelCurrentAttempt();
        _http.Dispose();
    }

    private void StartLogin(AuthBinding binding)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        CancelCurrentAttempt();
        var generation = ++_generation;

        try
        {
            var configuration = binding.Configuration
                ?? throw new InvalidOperationException("The renderer must configure authentication before sign-in.");
            var state = GenerateSecret();
            var codeVerifier = GenerateSecret();
            var codeChallenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(codeVerifier)));
            var loopback = LoopbackAuthServer.Start(state);
            var attempt = new LoginAttempt(
                generation,
                binding,
                configuration,
                codeVerifier,
                loopback);
            _attempt = attempt;

            var authorizationUrl = BuildAuthorizationUrl(
                configuration,
                loopback.Port,
                state,
                codeChallenge);
            var openResult = Godot.OS.ShellOpen(authorizationUrl);
            if (openResult != Error.Ok)
            {
                throw new InvalidOperationException($"The system browser could not open the sign-in URL: {openResult}.");
            }

            attempt.BackgroundTask = ObserveAttemptAsync(attempt);
        }
        catch (Exception error)
        {
            _attempt?.Dispose();
            _attempt = null;
            _pending.Enqueue(new AuthResult(generation, binding, null, error.Message));
        }
    }

    private void Detach(AuthBinding binding)
    {
        _bindings.Remove(binding);
        if (_attempt?.Binding == binding)
        {
            CancelCurrentAttempt();
        }
    }

    private void CancelCurrentAttempt()
    {
        _generation++;
        _attempt?.Dispose();
        _attempt = null;
    }

    private async Task ObserveAttemptAsync(LoginAttempt attempt)
    {
        try
        {
            var code = await attempt.Server.Result
                .WaitAsync(attempt.Cancellation.Token)
                .ConfigureAwait(false);
            var tokens = await ExchangeCodeAsync(
                    code,
                    attempt.CodeVerifier,
                    attempt.Configuration,
                    attempt.Cancellation.Token)
                .ConfigureAwait(false);
            _pending.Enqueue(new AuthResult(attempt.Generation, attempt.Binding, tokens, null));
        }
        catch (OperationCanceledException) when (attempt.Cancellation.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            _pending.Enqueue(new AuthResult(attempt.Generation, attempt.Binding, null, error.Message));
        }
    }

    private async Task<AuthTokensPayload> ExchangeCodeAsync(
        string code,
        string codeVerifier,
        AuthConfiguration configuration,
        CancellationToken cancellationToken)
    {
        var serverUrl = configuration.ServerUrl;
        var redirectUri = new Uri(serverUrl, "/api/auth/oidc/electron-callback").AbsoluteUri;
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["client_id"] = configuration.ClientId,
            ["code_verifier"] = codeVerifier,
            ["resource"] = serverUrl.AbsoluteUri.TrimEnd('/'),
        });
        using var response = await _http.PostAsync(
                new Uri(serverUrl, TokenPath),
                content,
                cancellationToken)
            .ConfigureAwait(false);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Token exchange failed ({(int)response.StatusCode}): {responseText}");
        }

        using var document = JsonDocument.Parse(responseText);
        var root = document.RootElement;
        var accessToken = ReadRequiredString(root, "access_token");
        var expiresIn = ReadRequiredInt32(root, "expires_in");
        return new AuthTokensPayload(
            accessToken,
            ReadOptionalString(root, "refresh_token"),
            ReadOptionalString(root, "id_token"),
            expiresIn);
    }

    private static string BuildAuthorizationUrl(
        AuthConfiguration configuration,
        int port,
        string state,
        string codeChallenge)
    {
        var serverUrl = configuration.ServerUrl;
        var redirectUri = new Uri(serverUrl, "/api/auth/oidc/electron-callback").AbsoluteUri;
        var query = new Dictionary<string, string>
        {
            ["response_type"] = "code",
            ["client_id"] = configuration.ClientId,
            ["redirect_uri"] = redirectUri,
            ["scope"] = Scopes,
            ["state"] = $"{port}:{state}",
            ["code_challenge"] = codeChallenge,
            ["code_challenge_method"] = "S256",
            ["prompt"] = "login",
            ["resource"] = serverUrl.AbsoluteUri.TrimEnd('/'),
        };
        var encodedQuery = string.Join('&', query.Select(pair =>
            $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}"));
        return $"{new Uri(serverUrl, AuthorizePath).AbsoluteUri}?{encodedQuery}";
    }

    private static AuthConfiguration ValidateConfiguration(AuthConfigurationPayload payload)
    {
        var clientId = payload.ClientId.Trim();
        if (clientId.Length == 0)
        {
            throw new ArgumentException("The authentication client ID must not be empty.", nameof(payload));
        }

        if (!Uri.TryCreate(payload.ServerUrl.Trim(), UriKind.Absolute, out var serverUrl)
            || !StringComparer.OrdinalIgnoreCase.Equals(serverUrl.Scheme, Uri.UriSchemeHttps))
        {
            throw new ArgumentException("The authentication server URL must be absolute HTTPS.", nameof(payload));
        }

        return new AuthConfiguration(clientId, serverUrl);
    }

    private static string GenerateSecret()
    {
        return Base64Url(CryptoRandom.GetBytes(32));
    }

    private static string Base64Url(byte[] value)
    {
        return Convert.ToBase64String(value)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string ReadRequiredString(JsonElement value, string propertyName)
    {
        var result = ReadOptionalString(value, propertyName);
        return !string.IsNullOrEmpty(result)
            ? result
            : throw new InvalidOperationException($"The token response is missing {propertyName}.");
    }

    private static string? ReadOptionalString(JsonElement value, string propertyName)
    {
        return value.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
                ? property.GetString()
                : null;
    }

    private static int ReadRequiredInt32(JsonElement value, string propertyName)
    {
        return value.TryGetProperty(propertyName, out var property)
            && property.TryGetInt32(out var result)
                ? result
                : throw new InvalidOperationException($"The token response is missing {propertyName}.");
    }

    private sealed record AuthResult(
        long Generation,
        AuthBinding Binding,
        AuthTokensPayload? Tokens,
        string? Error);

    private sealed record AuthConfiguration(string ClientId, Uri ServerUrl);

    private sealed class LoginAttempt(
        long generation,
        AuthBinding binding,
        AuthConfiguration configuration,
        string codeVerifier,
        LoopbackAuthServer server) : IDisposable
    {
        private int _disposeState;

        public long Generation { get; } = generation;
        public AuthBinding Binding { get; } = binding;
        public AuthConfiguration Configuration { get; } = configuration;
        public string CodeVerifier { get; } = codeVerifier;
        public LoopbackAuthServer Server { get; } = server;
        public CancellationTokenSource Cancellation { get; } = new();
        public Task? BackgroundTask { get; set; }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposeState, 1) != 0)
            {
                return;
            }

            Cancellation.Cancel();
            Server.Dispose();
            Cancellation.Dispose();
        }
    }

    private sealed class AuthBinding : IDisposable
    {
        private readonly AuthService _service;
        private readonly IDisposable _configureRegistration;
        private readonly IDisposable _startRegistration;
        private readonly IDisposable _logoutRegistration;
        private int _disposeState;

        public AuthBinding(AuthService service, IEventContext context)
        {
            _service = service;
            Context = context;
            _configureRegistration = context.RegisterInvokeHandler(
                AiriDesktopEvents.AuthConfigure,
                (AuthConfigurationPayload payload, CancellationToken _) =>
                {
                    Configuration = ValidateConfiguration(payload);
                    return Task.FromResult(new EmptyPayload());
                });
            _startRegistration = context.RegisterInvokeHandler(
                AiriDesktopEvents.AuthStartLogin,
                (EmptyPayload _, CancellationToken _) =>
                {
                    service.StartLogin(this);
                    return Task.FromResult(new EmptyPayload());
                });
            _logoutRegistration = context.RegisterInvokeHandler(
                AiriDesktopEvents.AuthLogout,
                (EmptyPayload _, CancellationToken _) =>
                {
                    service.CancelCurrentAttempt();
                    return Task.FromResult(new EmptyPayload());
                });
        }

        public IEventContext Context { get; }
        public AuthConfiguration? Configuration { get; private set; }
        public bool IsActive => _disposeState == 0;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposeState, 1) != 0)
            {
                return;
            }

            _logoutRegistration.Dispose();
            _startRegistration.Dispose();
            _configureRegistration.Dispose();
            _service.Detach(this);
        }
    }
}
