#[cfg(target_os = "macos")]
use objc2::{class, msg_send};

#[cfg(target_os = "macos")]
use super::types::{Point, Size, WindowFrame};

#[cfg(target_os = "macos")]
pub fn get_window_frame(window: &tauri::Window) -> WindowFrame {
  use objc2_foundation::NSRect;

  unsafe {
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
    WindowFrame {
      origin: Point {
        x: window_frame.origin.x,
        y: window_frame.origin.y,
      },
      size:   Size {
        width:  window_frame.size.width,
        height: window_frame.size.height,
      },
    }
  }
}

#[cfg(target_os = "macos")]
pub fn get_mouse_location() -> Point {
  use objc2_foundation::NSPoint;

  unsafe {
    // Get cursor position in screen coordinates (macOS coordinates - origin at bottom left)
    let mouse_location: NSPoint = msg_send![class!(NSEvent), mouseLocation];
    Point { x: mouse_location.x, y: mouse_location.y }
  }
}
