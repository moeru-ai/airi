using System;
using System.IO;
using System.Text.Json;

/// <summary>
/// Load and save Godot-owned stage view state under the AIRI-provided storage root.
///
/// This preserves the persistence mechanism for the future Godot-hosted architecture.
/// The current Electron-sidecar runtime does not wire this store into the active view-state
/// lifecycle; sidecar view state starts with the Godot process and ends when it exits.
/// </summary>
public sealed class StageViewStateStore
{
    private const string StateDirectoryName = "state";
    private const string StateFileName = "stage-view-state.json";

    private readonly JsonSerializerOptions _jsonOptions;
    private readonly string _stateDirectory;
    private readonly string _statePath;

    public StageViewStateStore(string storageRoot, JsonSerializerOptions jsonOptions)
    {
        if (string.IsNullOrWhiteSpace(storageRoot) || !Path.IsPathFullyQualified(storageRoot))
        {
            throw new InvalidOperationException("AIRI storage root must be a non-empty absolute path.");
        }

        _jsonOptions = jsonOptions;
        _stateDirectory = Path.Combine(storageRoot, StateDirectoryName);
        _statePath = Path.Combine(_stateDirectory, StateFileName);
    }

    public StageViewStateLoadResult Load()
    {
        Directory.CreateDirectory(_stateDirectory);

        if (!File.Exists(_statePath))
        {
            return StageViewStateLoadResult.Ok(StageViewStateRules.CreateDefault());
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(_statePath));
            return StageViewStateLoadResult.Ok(StageViewJson.ParseState(document.RootElement));
        }
        catch (Exception error)
        {
            PreserveInvalidFile();
            return StageViewStateLoadResult.Fallback(
                StageViewStateRules.CreateDefault(),
                $"Invalid Godot stage view state file: {error.Message}"
            );
        }
    }

    public void Save(StageViewState state)
    {
        Directory.CreateDirectory(_stateDirectory);

        var tempPath = Path.Combine(
            _stateDirectory,
            $"{StateFileName}.{Guid.NewGuid():N}.tmp"
        );

        try
        {
            File.WriteAllText(tempPath, JsonSerializer.Serialize(state, _jsonOptions));

            if (File.Exists(_statePath))
            {
                File.Replace(tempPath, _statePath, null);
            }
            else
            {
                File.Move(tempPath, _statePath);
            }
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private void PreserveInvalidFile()
    {
        try
        {
            var invalidPath = $"{_statePath}.invalid.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
            File.Move(_statePath, invalidPath, true);
        }
        catch
        {
            // Keeping the stage alive is more important than preserving invalid evidence.
        }
    }
}

/// <summary>
/// Result of loading Godot view state from the retained store mechanism.
/// </summary>
public sealed record StageViewStateLoadResult(
    StageViewState State,
    string ErrorMessage
)
{
    public static StageViewStateLoadResult Ok(StageViewState state) => new(state, null);

    public static StageViewStateLoadResult Fallback(StageViewState state, string errorMessage) =>
        new(state, errorMessage);
}
