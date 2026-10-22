using Eventa;
using GdKirie.Tray;
using Godot;
using TrayMenu = GdKirie.Tray.Menu;

/// <summary>
/// Owns the AIRI system tray icon, its menu, and the main-window actions behind the menu.
/// Godot owns the tray so that the tray stays usable while the main renderer reloads.
/// The main renderer only supplies localized labels.
/// </summary>
internal sealed class TrayHost : IDisposable
{
    private const string MacOSIconPath = "res://src-godot/assets/tray-icon-macos.png";
    private const string DefaultIconPath = "res://icon.svg";
    private const string Tooltip = "Project AIRI";
    // NOTICE:
    // On macOS, this icon appears at 22pt. The Electron tray icon is 16pt.
    // Root cause is upstream. tray-icon 0.26.1, used by GdKirie.Tray 0.15.0, takes the
    // pixel size as the point size, up to 22pt. It also stores only one image representation.
    // Electron stores 1x (16px) and 2x (32px) representations in one 16pt NSImage.
    // A 16px icon matches the Electron size but is blurry on Retina displays.
    // Source: tray-icon-0.26.1/src/platform_impl/macos/icon.rs, to_nsimage.
    // Source: Chromium ui/gfx/image/image_skia_util_mac.mm, NSImageFromImageSkia.
    // Remove when GdKirie.Tray accepts a scale factor or a point size for custom icons.
    private const int IconSize = 32;
    private const double AlignmentDurationSeconds = 0.35;

    // These labels apply until the main renderer sends the translated labels.
    // The source of truth is packages/i18n/src/locales/en/tamagotchi/electron/tray.yaml.
    private static readonly TrayLabelsPayload DefaultLabels = new(
        Show: "Show",
        AdjustSizes: "Adjust sizes",
        RecommendedSize: "Recommended (450x600)",
        FullHeight: "Full Height",
        HalfHeight: "Half Height",
        FullScreen: "Full Screen",
        AlignTo: "Align to",
        Center: "Center",
        TopLeft: "Top Left",
        TopRight: "Top Right",
        BottomLeft: "Bottom Left",
        BottomRight: "Bottom Right",
        Settings: "Settings...",
        About: "About...",
        OpenInlay: "Open Inlay...",
        OpenWidgets: "Open Widgets...",
        OpenCaption: "Open Caption...",
        CaptionOverlay: "Caption Overlay",
        FollowWindow: "Follow window",
        ResetPosition: "Reset position",
        Devtools: "DevTools",
        TroubleshootBeatSync: "Troubleshoot BeatSync...",
        Quit: "Quit");

    private readonly Node _owner;
    private readonly Window _mainWindow;
    private readonly SettingsWindowManager _settings;
    private readonly Action _quit;
    private readonly bool _isMacOS = OS.GetName() == "macOS";
    private readonly List<TrayObject> _objects = [];
    private readonly List<(MenuEntry Entry, Func<TrayLabelsPayload, string> Label)> _labels = [];
    private readonly Dictionary<string, Action> _actions = new(StringComparer.Ordinal);
    private readonly Dictionary<TrayWindowSizePreset, CheckMenuItem> _sizeItems = [];
    private readonly Dictionary<TrayWindowAlignment, CheckMenuItem> _alignmentItems = [];
    private readonly TrayIcon _tray;
    private readonly TrayEvents _events;
    private Tween? _alignmentTween;
    private Rect2I _checkedBounds;
    private int _checkedScreen = -1;
    private bool _disposed;

    /// <summary>
    /// Creates the native tray on Godot's main thread.
    /// Throws <see cref="TrayException"/> or <see cref="InvalidOperationException"/>
    /// when the platform has no usable tray.
    /// </summary>
    public TrayHost(
        Node owner,
        Window mainWindow,
        SettingsWindowManager settings,
        Action quit)
    {
        _owner = owner;
        _mainWindow = mainWindow;
        _settings = settings;
        _quit = quit;

        try
        {
            var menu = BuildMenu();
            _tray = Track(new TrayIcon(new TrayOptions
            {
                Icon = LoadIcon(),
                IconAsTemplate = _isMacOS,
                Menu = menu,
                Tooltip = Tooltip,
                MenuOnLeftClick = _isMacOS,
            }));
            _events = new TrayEvents();
            _events.Menu += OnMenuEvent;
            _events.Tray += OnTrayEvent;
            RefreshChecks();
        }
        catch
        {
            Dispose();
            throw;
        }
    }

    /// <summary>
    /// Replaces the menu labels with the labels that the main renderer translated.
    /// </summary>
    public void ApplyLabels(TrayLabelsPayload labels)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        foreach (var (entry, label) in _labels)
        {
            entry.Text = label(labels);
        }
    }

    /// <summary>
    /// Updates the checked size and alignment items after the main window moves or resizes.
    /// </summary>
    public void Process()
    {
        if (_disposed)
        {
            return;
        }

        if (CurrentBounds() != _checkedBounds || _mainWindow.CurrentScreen != _checkedScreen)
        {
            RefreshChecks();
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _alignmentTween?.Kill();
        _alignmentTween = null;
        _events?.Dispose();

        // The tray releases the menu first. The menu then releases its entries.
        for (var index = _objects.Count - 1; index >= 0; index--)
        {
            _objects[index].Dispose();
        }

        _objects.Clear();
        _labels.Clear();
        _actions.Clear();
    }

    private TrayMenu BuildMenu()
    {
        List<MenuEntry> entries =
        [
            Item(labels => labels.Show, ShowMainWindow),
            Separator(),
            CreateSubmenu(
                labels => labels.AdjustSizes,
                enabled: true,
                SizeItem(TrayWindowSizePreset.Recommended, labels => labels.RecommendedSize),
                SizeItem(TrayWindowSizePreset.FullHeight, labels => labels.FullHeight),
                SizeItem(TrayWindowSizePreset.HalfHeight, labels => labels.HalfHeight),
                SizeItem(TrayWindowSizePreset.FullScreen, labels => labels.FullScreen)),
            CreateSubmenu(
                labels => labels.AlignTo,
                enabled: true,
                AlignmentItem(TrayWindowAlignment.Center, labels => labels.Center),
                Separator(),
                AlignmentItem(TrayWindowAlignment.TopLeft, labels => labels.TopLeft),
                AlignmentItem(TrayWindowAlignment.TopRight, labels => labels.TopRight),
                AlignmentItem(TrayWindowAlignment.BottomLeft, labels => labels.BottomLeft),
                AlignmentItem(TrayWindowAlignment.BottomRight, labels => labels.BottomRight)),
            Separator(),
            Item(labels => labels.Settings, () => _settings.Open(null)),
            // The Kirie host has no About, Inlay, Widgets, Caption, or BeatSync window yet.
            // These items stay disabled so that the menu keeps the Electron layout.
            Item(labels => labels.About, null),
            Separator(),
            Item(labels => labels.OpenInlay, null),
            Item(labels => labels.OpenWidgets, null),
            Item(labels => labels.OpenCaption, null),
            CreateSubmenu(
                labels => labels.CaptionOverlay,
                enabled: false,
                Labeled(
                    Track(new CheckMenuItem(new CheckMenuItemOptions(DefaultLabels.FollowWindow)
                    {
                        Enabled = false,
                    })),
                    labels => labels.FollowWindow),
                Item(labels => labels.ResetPosition, null)),
            Separator(),
        ];

        if (OS.IsDebugBuild())
        {
            entries.Add(Labeled(
                Track(PredefinedMenuItem.SectionHeader(DefaultLabels.Devtools)),
                labels => labels.Devtools));
            entries.Add(Item(labels => labels.TroubleshootBeatSync, null));
            entries.Add(Separator());
        }

        entries.Add(Item(labels => labels.Quit, _quit));
        return Track(new TrayMenu(new MenuOptions { Items = entries }));
    }

    private MenuItem Item(Func<TrayLabelsPayload, string> label, Action? action)
    {
        var item = Labeled(
            Track(new MenuItem(new MenuItemOptions(label(DefaultLabels))
            {
                Enabled = action is not null,
            })),
            label);
        if (action is not null)
        {
            _actions[item.Id] = action;
        }

        return item;
    }

    private CheckMenuItem SizeItem(
        TrayWindowSizePreset preset,
        Func<TrayLabelsPayload, string> label)
    {
        var item = Labeled(
            Track(new CheckMenuItem(new CheckMenuItemOptions(label(DefaultLabels)))),
            label);
        _sizeItems[preset] = item;
        _actions[item.Id] = () => ApplySizePreset(preset);
        return item;
    }

    private CheckMenuItem AlignmentItem(
        TrayWindowAlignment alignment,
        Func<TrayLabelsPayload, string> label)
    {
        var item = Labeled(
            Track(new CheckMenuItem(new CheckMenuItemOptions(label(DefaultLabels)))),
            label);
        _alignmentItems[alignment] = item;
        _actions[item.Id] = () => AlignMainWindow(alignment);
        return item;
    }

    private Submenu CreateSubmenu(
        Func<TrayLabelsPayload, string> label,
        bool enabled,
        params MenuEntry[] items)
    {
        return Labeled(
            Track(new Submenu(new SubmenuOptions(label(DefaultLabels))
            {
                Enabled = enabled,
                Items = items,
            })),
            label);
    }

    private PredefinedMenuItem Separator()
    {
        return Track(PredefinedMenuItem.Separator());
    }

    private T Track<T>(T trayObject) where T : TrayObject
    {
        _objects.Add(trayObject);
        return trayObject;
    }

    private T Labeled<T>(T entry, Func<TrayLabelsPayload, string> label) where T : MenuEntry
    {
        _labels.Add((entry, label));
        return entry;
    }

    private IconSource LoadIcon()
    {
        var path = _isMacOS ? MacOSIconPath : DefaultIconPath;
        var texture = ResourceLoader.Load<Texture2D>(path)
            ?? throw new InvalidOperationException($"The tray icon is missing: {path}");
        var image = texture.GetImage()
            ?? throw new InvalidOperationException($"The tray icon has no image: {path}");
        if (image.IsCompressed())
        {
            image.Decompress();
        }

        image.Resize(IconSize, IconSize, Image.Interpolation.Lanczos);
        image.Convert(Image.Format.Rgba8);
        return new IconSource.Rgba(image.GetData(), IconSize, IconSize);
    }

    private void OnMenuEvent(string id)
    {
        if (!_actions.TryGetValue(id, out var action))
        {
            return;
        }

        action();

        // Native check items toggle on click. Restore the state that the geometry describes.
        if (!_disposed)
        {
            RefreshChecks();
        }
    }

    private void OnTrayEvent(TrayIconEvent trayEvent)
    {
        if (trayEvent.Id != _tray.Id)
        {
            return;
        }

        // The Electron tray opens the menu with a left click on macOS and
        // shows the main window with a left click on other platforms.
        var showsMainWindow = _isMacOS
            ? trayEvent.Type == TrayIconEventKind.DoubleClick
            : trayEvent.Type == TrayIconEventKind.Click
                && trayEvent.Button == TrayMouseButton.Left
                && trayEvent.ButtonState == TrayMouseButtonState.Up;
        if (showsMainWindow)
        {
            ShowMainWindow();
        }
    }

    private void ShowMainWindow()
    {
        RestoreMainWindow();
        _mainWindow.Show();
        _mainWindow.GrabFocus();
    }

    // A minimized window reports stale geometry and can ignore new bounds.
    // Restore it before a size or alignment item reads or writes its bounds.
    private void RestoreMainWindow()
    {
        if (_mainWindow.Mode == Window.ModeEnum.Minimized)
        {
            _mainWindow.Mode = Window.ModeEnum.Windowed;
        }
    }

    private void ApplySizePreset(TrayWindowSizePreset preset)
    {
        StopAlignment();
        RestoreMainWindow();
        var workArea = CurrentWorkArea();
        var bounds = preset == TrayWindowSizePreset.FullScreen
            ? workArea
            : TrayWindowGeometry.ResolveAnchoredBounds(
                CurrentBounds(),
                TrayWindowGeometry.ResolvePresetSize(
                    preset,
                    workArea,
                    DesktopWindowSizing.GetDisplayScale(_mainWindow)),
                workArea);
        _mainWindow.Position = bounds.Position;
        _mainWindow.Size = bounds.Size;
        _mainWindow.Show();
    }

    private void AlignMainWindow(TrayWindowAlignment alignment)
    {
        StopAlignment();
        RestoreMainWindow();
        var target = TrayWindowGeometry.ResolveAlignedPosition(
            alignment,
            CurrentWorkArea(),
            _mainWindow.Size);
        _alignmentTween = _owner.CreateTween();
        _alignmentTween
            .TweenProperty(
                _mainWindow,
                Window.PropertyName.Position.ToString(),
                target,
                AlignmentDurationSeconds)
            .SetTrans(Tween.TransitionType.Cubic)
            .SetEase(Tween.EaseType.Out);
        _mainWindow.Show();
    }

    private void StopAlignment()
    {
        _alignmentTween?.Kill();
        _alignmentTween = null;
    }

    private void RefreshChecks()
    {
        var bounds = CurrentBounds();
        var workArea = CurrentWorkArea();
        var displayScale = DesktopWindowSizing.GetDisplayScale(_mainWindow);
        _checkedBounds = bounds;
        _checkedScreen = _mainWindow.CurrentScreen;

        foreach (var (preset, item) in _sizeItems)
        {
            item.Checked = TrayWindowGeometry.IsSizeMatch(
                bounds.Size,
                TrayWindowGeometry.ResolvePresetSize(preset, workArea, displayScale));
        }

        foreach (var (alignment, item) in _alignmentItems)
        {
            item.Checked = TrayWindowGeometry.IsPositionMatch(
                bounds.Position,
                TrayWindowGeometry.ResolveAlignedPosition(alignment, workArea, bounds.Size));
        }
    }

    private Rect2I CurrentBounds()
    {
        return new Rect2I(_mainWindow.Position, _mainWindow.Size);
    }

    private Rect2I CurrentWorkArea()
    {
        return DisplayServer.ScreenGetUsableRect(_mainWindow.CurrentScreen);
    }
}
