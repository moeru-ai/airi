/// <summary>
/// Scene input payload sent by Electron main after it materializes a selected VRM model.
/// </summary>
/// <param name="ModelId">Stable selected-model id from the stage settings store.</param>
/// <param name="Format">Supported asset format. G1.1 accepts <c>vrm</c> only.</param>
/// <param name="Name">Human-readable model name for the runtime status UI.</param>
/// <param name="Path">Native absolute file path under Electron's userData materialization directory.</param>
public sealed record StageSceneApplyPayload(
    string ModelId,
    string Format,
    string Name,
    string Path
);
