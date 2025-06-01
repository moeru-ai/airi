#[cfg(target_os = "macos")]
use objc2::{class, msg_send};

/// Get cursor position relative to the window
#[cfg(target_os = "macos")]
pub async fn is_cursor_in_window(window: &tauri::Window) -> bool {
  use objc2_foundation::{NSPoint, NSRect};

  unsafe {
    // Get cursor position in screen coordinates (macOS coordinates - origin at bottom left)
    let mouse_location: NSPoint = msg_send![class!(NSEvent), mouseLocation];

    // Get all screens
    //
    // We need screens count because for multiple-display users,
    // in macOS, the Native API returns the mouse coordinates relative to the primary
    // display, for example, if we say the primary display is 1920x1080, another two lies
    // on both sides of the primary display with the size of 1920x1080 too, mouse coordinates
    // will be 0 at the left edge of p-display, and 1920 at the right edge of the p-display,
    // -1080 at the left edge of the left-side display, and 2160 at the right edge of the right-side
    // display.
    let screens: *const objc2::runtime::AnyObject = msg_send![class!(NSScreen), screens];
    let screens_count: usize = msg_send![screens, count];

    // Get window position and size from Tauri
    // Get the NSWindow from Tauri window to access native properties
    //
    // While Tauri does provide us window.outer_position() and window.outer_size()
    // it's not enough to determine if the cursor is inside the window.
    // The value of those two functions returns the in-compatible coordinates (top-left origin)
    // with OBJ-C Native API values. This produces a lot of issues when calculating the collision
    // of the cursor relative to the window.
    //
    // We need to get the window's frame in macOS coordinates (bottom-left origin)
    // and check if the cursor is inside that frame.
    let ns_window: *mut objc2::runtime::AnyObject = window.ns_window().unwrap().cast();
    let window_frame: NSRect = msg_send![ns_window, frame];

    // Log all screens information
    for _ in 0..screens_count {
      // For debugging purpose, screen object, frame size of the screen, visible frame size of the screen,
      // and the scale factor of the screen can be obtained as follows:
      //
      // let screen: *const objc2::runtime::AnyObject = msg_send![screens, objectAtIndex: i];
      // let frame: NSRect = msg_send![screen, frame];
      // let visible_frame: NSRect = msg_send![screen, visibleFrame];
      // let scale_factor: f64 = msg_send![screen, backingScaleFactor];

      // Check if mouse is inside our window's frame
      let is_inside = mouse_location.x >= window_frame.origin.x && mouse_location.x <= (window_frame.origin.x + window_frame.size.width) && mouse_location.y >= window_frame.origin.y && mouse_location.y <= (window_frame.origin.y + window_frame.size.height);

      if is_inside {
        return true;
      }
    }
  }
  false
}
