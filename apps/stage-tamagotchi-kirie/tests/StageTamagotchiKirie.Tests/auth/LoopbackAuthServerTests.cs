using System.Net;
using Xunit;
using HttpClient = System.Net.Http.HttpClient;

public class LoopbackAuthServerTests
{
    [Fact]
    public async Task ReturnsCodeForExpectedState()
    {
        using var server = LoopbackAuthServer.Start("state-1");
        using var http = new HttpClient();
        using HttpResponseMessage response = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=ok&state=state-1",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", await server.Result);
    }

    [Fact]
    public async Task RejectsForgedStateWithoutConsumingServer()
    {
        using var server = LoopbackAuthServer.Start("expected-state");
        using var http = new HttpClient();
        using HttpResponseMessage forged = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=forged&state=wrong-state",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);
        Assert.False(server.Result.IsCompleted);

        using HttpResponseMessage valid = await http.GetAsync(
            $"http://127.0.0.1:{server.Port}/callback?code=valid&state=expected-state",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
        Assert.Equal("valid", await server.Result);
    }

    [Fact]
    public async Task SendsRelayCorsWithoutPrivateNetworkHeader()
    {
        using var server = LoopbackAuthServer.Start("state-1");
        using var http = new HttpClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"http://127.0.0.1:{server.Port}/callback?code=ok&state=state-1");
        request.Headers.Add("Origin", "https://example.com");
        using HttpResponseMessage response = await http.SendAsync(
            request,
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("*", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.False(response.Headers.Contains("Access-Control-Allow-Private-Network"));
        Assert.Equal("ok", await server.Result);
    }
}
