using System.Text.Json;
using Xunit;

public class WidgetContractsTests
{
    private const string MutationJson = """
        {"id":"weather-test","componentName":"weather","componentProps":{"city":"Tokyo"},
        "alwaysOnTop":true,"size":"m","windowSize":{"width":620,"height":760},"ttlMs":1000}
        """;

    [Fact]
    public void ReadsRendererMutationPayload()
    {
        WidgetMutationPayload payload = JsonSerializer.Deserialize(
            MutationJson, WidgetJsonContext.Default.WidgetMutationPayload)!;

        Assert.Equal("Tokyo", payload.ComponentProps!["city"].GetString());
        Assert.Equal(1000d, payload.TtlMs);
        Assert.Equal(620, payload.WindowSize!.Width);
    }

    [Fact]
    public void KeepsOmittedExpiryAndExplicitUnpinInPartialUpdate()
    {
        WidgetMutationPayload partial = JsonSerializer.Deserialize(
            "{\"id\":\"weather-test\",\"alwaysOnTop\":false}",
            WidgetJsonContext.Default.WidgetMutationPayload)!;

        Assert.Null(partial.TtlMs);
        Assert.False(partial.AlwaysOnTop);
    }

    [Fact]
    public void WritesSnapshotPayload()
    {
        WidgetMutationPayload payload = JsonSerializer.Deserialize(
            MutationJson, WidgetJsonContext.Default.WidgetMutationPayload)!;
        var snapshot = new WidgetSnapshotPayload(
            payload.Id!, payload.ComponentName!, payload.ComponentProps!, true,
            payload.Size!.Value, payload.WindowSize, payload.TtlMs!.Value);

        using var serialized = JsonDocument.Parse(JsonSerializer.Serialize(
            snapshot, WidgetJsonContext.Default.WidgetSnapshotPayload));
        JsonElement root = serialized.RootElement;

        Assert.Equal("weather-test", root.GetProperty("id").GetString());
        Assert.Equal("m", root.GetProperty("size").GetString());
        Assert.Equal("Tokyo", root.GetProperty("componentProps").GetProperty("city").GetString());
    }
}
