using Godot;

/// <summary>
/// Scales macOS trackpad scrolling before the web view reads it, so a page scrolls by the
/// distance that macOS reports, as it does in a browser.
/// </summary>
public partial class CefTrackpadScroll : Node
{
    // NOTICE:
    // Godot CEF sends a pan gesture delta times 120, divided by the screen scale, as a wheel delta.
    // On macOS, Godot makes that delta 0.03 of the trackpad scroll distance.
    // Measured on a Retina Mac, the page then got the wheel delta times the screen scale again,
    // so dividing by 120 and 0.03 alone matches the deltas that Chromium gets for the same gesture.
    // Sources: godot-cef v2.1.0 crates/gdcef/src/input/mod.rs (handle_pan_gesture), and
    // Godot 4.7.2 platform/macos/godot_content_view.mm (scrollWheel).
    // Remove this node from the window scenes when Godot CEF converts pan gestures to pixels.
    private const float CefWheelDelta = 120f;
    private const float GodotMacOSPreciseScrollScale = 0.03f;

    public override void _Ready()
    {
        // A mouse wheel on macOS, and scrolling on other platforms, already match a browser.
        SetProcessInput(OperatingSystem.IsMacOS());
    }

    public override void _Input(InputEvent @event)
    {
        if (@event is not InputEventPanGesture pan)
        {
            return;
        }

        pan.Delta /= CefWheelDelta * GodotMacOSPreciseScrollScale;
    }
}
