using Godot;

internal sealed class NativeWindowResizeController : IDisposable
{
    private const int DefaultEdgeThickness = 5;
    private const int DefaultCornerSize = 10;

    private readonly Window _window;
    private int _edgeThickness;
    private int _cornerSize;
    private DisplayServer.CursorShape? _cursorBeforeResize;
    private bool _disposed;

    public NativeWindowResizeController(Window window)
    {
        ArgumentNullException.ThrowIfNull(window);

        _window = window;
        RefreshHitTargets();
        _window.DpiChanged += RefreshHitTargets;
        _window.WindowInput += OnWindowInput;
        _window.MouseExited += RestoreCursor;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _window.DpiChanged -= RefreshHitTargets;
        _window.WindowInput -= OnWindowInput;
        _window.MouseExited -= RestoreCursor;
        RestoreCursor();
    }

    internal static DisplayServer.WindowResizeEdge? ResolveResizeEdge(
        Vector2 position,
        Vector2I windowSize,
        int edgeThickness,
        int cornerSize)
    {
        var isInsideWindow = position.X >= 0
            && position.Y >= 0
            && position.X < windowSize.X
            && position.Y < windowSize.Y;
        if (!isInsideWindow || edgeThickness <= 0 || cornerSize <= 0)
        {
            return null;
        }

        var isInLeftCorner = position.X < cornerSize;
        var isInRightCorner = position.X >= windowSize.X - cornerSize;
        var isInTopCorner = position.Y < cornerSize;
        var isInBottomCorner = position.Y >= windowSize.Y - cornerSize;

        if (isInTopCorner && isInLeftCorner)
        {
            return DisplayServer.WindowResizeEdge.TopLeft;
        }

        if (isInTopCorner && isInRightCorner)
        {
            return DisplayServer.WindowResizeEdge.TopRight;
        }

        if (isInBottomCorner && isInLeftCorner)
        {
            return DisplayServer.WindowResizeEdge.BottomLeft;
        }

        if (isInBottomCorner && isInRightCorner)
        {
            return DisplayServer.WindowResizeEdge.BottomRight;
        }

        var isLeftEdge = position.X < edgeThickness;
        var isRightEdge = position.X >= windowSize.X - edgeThickness;
        var isTopEdge = position.Y < edgeThickness;
        var isBottomEdge = position.Y >= windowSize.Y - edgeThickness;

        if (isTopEdge)
        {
            return DisplayServer.WindowResizeEdge.Top;
        }

        if (isRightEdge)
        {
            return DisplayServer.WindowResizeEdge.Right;
        }

        if (isBottomEdge)
        {
            return DisplayServer.WindowResizeEdge.Bottom;
        }

        if (isLeftEdge)
        {
            return DisplayServer.WindowResizeEdge.Left;
        }

        return null;
    }

    private void OnWindowInput(InputEvent inputEvent)
    {
        if (_window.Unresizable || _window.Mode != Window.ModeEnum.Windowed)
        {
            RestoreCursor();
            return;
        }

        if (inputEvent is InputEventMouseMotion mouseMotion)
        {
            SetCursor(ResolveResizeEdge(
                mouseMotion.Position,
                _window.Size,
                _edgeThickness,
                _cornerSize));
            return;
        }

        if (inputEvent is not InputEventMouseButton
            {
                ButtonIndex: MouseButton.Left,
                Pressed: true,
            } mouseButton)
        {
            return;
        }

        var edge = ResolveResizeEdge(
            mouseButton.Position,
            _window.Size,
            _edgeThickness,
            _cornerSize);
        if (edge is null)
        {
            return;
        }

        _window.SetInputAsHandled();
        _window.StartResize(edge.Value);
    }

    private void RefreshHitTargets()
    {
        var displayScale = DesktopWindowSizing.GetDisplayScale(_window);
        _edgeThickness = Math.Max(
            1,
            Mathf.CeilToInt(DefaultEdgeThickness * displayScale));
        _cornerSize = Math.Max(
            1,
            Mathf.CeilToInt(DefaultCornerSize * displayScale));
    }

    private void SetCursor(DisplayServer.WindowResizeEdge? edge)
    {
        if (edge is null)
        {
            RestoreCursor();
            return;
        }

        _cursorBeforeResize ??= DisplayServer.CursorGetShape();
        DisplayServer.CursorSetShape(edge.Value switch
        {
            DisplayServer.WindowResizeEdge.Top or DisplayServer.WindowResizeEdge.Bottom
                => DisplayServer.CursorShape.Vsize,
            DisplayServer.WindowResizeEdge.Left or DisplayServer.WindowResizeEdge.Right
                => DisplayServer.CursorShape.Hsize,
            DisplayServer.WindowResizeEdge.TopLeft or DisplayServer.WindowResizeEdge.BottomRight
                => DisplayServer.CursorShape.Fdiagsize,
            DisplayServer.WindowResizeEdge.TopRight or DisplayServer.WindowResizeEdge.BottomLeft
                => DisplayServer.CursorShape.Bdiagsize,
            _ => DisplayServer.CursorShape.Arrow,
        });
    }

    private void RestoreCursor()
    {
        if (_cursorBeforeResize is not { } cursor)
        {
            return;
        }

        DisplayServer.CursorSetShape(cursor);
        _cursorBeforeResize = null;
    }
}
