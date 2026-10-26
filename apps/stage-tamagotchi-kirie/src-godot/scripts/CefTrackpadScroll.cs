using Godot;

/// <summary>
/// Scales macOS trackpad scrolling before the web view reads it, so a page scrolls by the
/// distance that macOS reports, as it does in a browser.
/// </summary>
public partial class CefTrackpadScroll : Node
{
    // NOTICE:
    // Godot CEF sends a pan gesture delta times 120, divided by the screen scale, as a wheel delta.
    // On macOS, Godot makes that delta 0.03 of the NSEvent scrolling delta. So a page scrolled
    // 3.6 / scale times as far as in Chromium: 1.8 times on a Retina screen.
    // Chromium scrolls by the CGEvent point delta. Measured on 1x and 2x screens, it equals the
    // NSEvent scrolling delta, so this script makes the page get that delta.
    // Sources: godot-cef v2.1.0 crates/gdcef/src/input/mod.rs (handle_pan_gesture),
    // Godot 4.7.2 platform/macos/godot_content_view.mm (scrollWheel), and
    // Chromium components/input/web_input_event_builders_mac.mm.
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

        // Godot CEF divides by the same screen scale, so the scale cancels out.
        float screenScale = DisplayServer.ScreenGetScale();
        pan.Delta *= screenScale / (CefWheelDelta * GodotMacOSPreciseScrollScale);
    }
}
