using Godot;

/// <summary>
/// The saved size of the floating chat, and its position in the `free` placement.
/// </summary>
/// <param name="Width">Logical pixels, so the size stays the same on a display with another
/// scale.</param>
/// <param name="Height">Logical pixels.</param>
/// <param name="Position">Native screen pixels. An attached chat takes its position from the main
/// window.</param>
internal sealed record FloatingChatBounds(int Width, int Height, Vector2I? Position);

/// <summary>
/// The saved chat choices: the chat mode, the floating placement, the message feed, and the pin.
/// </summary>
internal sealed record ChatWindowSettings(
    string Mode,
    string Placement,
    bool Danmaku,
    bool Pinned,
    FloatingChatBounds Floating);

/// <summary>
/// Loads and saves the chat choices in `user://chat-window.cfg`.
/// The defaults match the Electron app: the floating chat beside the character, so users try it.
/// </summary>
internal sealed class ChatWindowPreferences
{
    public const string LegacyMode = "legacy";
    public const string FloatingMode = "floating";
    public const string AttachedPlacement = "attached";
    public const string FreePlacement = "free";

    public static readonly ChatWindowSettings Default = new(
        FloatingMode,
        AttachedPlacement,
        false,
        true,
        new FloatingChatBounds(380, 560, null));

    private const string ConfigPath = "user://chat-window.cfg";
    private const string ChatSection = "chat";
    private const string FloatingSection = "floating";

    public ChatWindowPreferences()
    {
        Current = Load();
    }

    public ChatWindowSettings Current { get; private set; }

    public static bool IsMode(string? value)
    {
        return value is LegacyMode or FloatingMode;
    }

    public static bool IsPlacement(string? value)
    {
        return value is AttachedPlacement or FreePlacement;
    }

    public void Save(ChatWindowSettings next)
    {
        var config = new ConfigFile();
        config.SetValue(ChatSection, "mode", next.Mode);
        config.SetValue(ChatSection, "placement", next.Placement);
        config.SetValue(ChatSection, "danmaku", next.Danmaku);
        config.SetValue(ChatSection, "pinned", next.Pinned);
        config.SetValue(FloatingSection, "width", next.Floating.Width);
        config.SetValue(FloatingSection, "height", next.Floating.Height);
        if (next.Floating.Position is { } position)
        {
            config.SetValue(FloatingSection, "x", position.X);
            config.SetValue(FloatingSection, "y", position.Y);
        }

        var error = config.Save(ConfigPath);
        if (error != Error.Ok)
        {
            throw new InvalidOperationException(
                $"Could not save the chat window preferences: {error}.");
        }

        Current = next;
    }

    private static ChatWindowSettings Load()
    {
        if (!Godot.FileAccess.FileExists(ConfigPath))
        {
            return Default;
        }

        var config = new ConfigFile();
        var error = config.Load(ConfigPath);
        if (error != Error.Ok)
        {
            GD.PushWarning($"Could not load the chat window preferences: {error}.");
            return Default;
        }

        // A value that is missing or not valid takes its default, and the other values stay.
        var mode = config.GetValue(ChatSection, "mode", Default.Mode).AsString();
        var placement = config.GetValue(ChatSection, "placement", Default.Placement).AsString();
        var width = config.GetValue(FloatingSection, "width", Default.Floating.Width).AsInt32();
        var height = config.GetValue(FloatingSection, "height", Default.Floating.Height).AsInt32();
        var hasPosition = config.HasSectionKey(FloatingSection, "x")
            && config.HasSectionKey(FloatingSection, "y");
        Vector2I? position = hasPosition
            ? new Vector2I(
                config.GetValue(FloatingSection, "x").AsInt32(),
                config.GetValue(FloatingSection, "y").AsInt32())
            : null;

        return new ChatWindowSettings(
            IsMode(mode) ? mode : Default.Mode,
            IsPlacement(placement) ? placement : Default.Placement,
            config.GetValue(ChatSection, "danmaku", Default.Danmaku).AsBool(),
            config.GetValue(ChatSection, "pinned", Default.Pinned).AsBool(),
            new FloatingChatBounds(
                width > 0 ? width : Default.Floating.Width,
                height > 0 ? height : Default.Floating.Height,
                position));
    }
}
