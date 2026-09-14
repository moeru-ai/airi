using System.Net;

internal static class Program
{
    private static async Task<int> Main()
    {
        try
        {
            await ReturnsCodeForExpectedState();
            await RejectsForgedStateWithoutConsumingServer();
            await SendsRelayCorsWithoutPrivateNetworkHeader();
            Console.WriteLine("StageTamagotchiKirie.Tests passed.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }

    private static async Task ReturnsCodeForExpectedState()
    {
        using var server = LoopbackAuthServer.Start("state-1");
        using var http = new HttpClient();
        using var response = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=ok&state=state-1");

        AssertEqual(HttpStatusCode.OK, response.StatusCode, "valid callback status");
        AssertEqual("ok", await server.Result, "authorization code");
    }

    private static async Task RejectsForgedStateWithoutConsumingServer()
    {
        using var server = LoopbackAuthServer.Start("expected-state");
        using var http = new HttpClient();
        using var forged = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=forged&state=wrong-state");

        AssertEqual(HttpStatusCode.BadRequest, forged.StatusCode, "forged callback status");
        AssertEqual(false, server.Result.IsCompleted, "server state after forged callback");

        using var valid = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=valid&state=expected-state");
        AssertEqual(HttpStatusCode.OK, valid.StatusCode, "valid callback status after forgery");
        AssertEqual("valid", await server.Result, "authorization code after forgery");
    }

    private static async Task SendsRelayCorsWithoutPrivateNetworkHeader()
    {
        using var server = LoopbackAuthServer.Start("state-1");
        using var http = new HttpClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"http://127.0.0.1:{server.Port}/callback?code=ok&state=state-1");
        request.Headers.Add("Origin", "https://api.airi.build");
        using var response = await http.SendAsync(request);

        AssertEqual(HttpStatusCode.OK, response.StatusCode, "relay callback status");
        AssertEqual(
            "*",
            response.Headers.GetValues("Access-Control-Allow-Origin").Single(),
            "relay CORS origin");
        AssertEqual(
            false,
            response.Headers.Contains("Access-Control-Allow-Private-Network"),
            "private-network response header");
        AssertEqual("ok", await server.Result, "relay authorization code");
    }

    private static void AssertEqual<T>(T expected, T actual, string label)
    {
        if (EqualityComparer<T>.Default.Equals(expected, actual))
        {
            return;
        }

        throw new InvalidOperationException(
            $"Expected {label} to be '{expected}', got '{actual}'.");
    }
}
