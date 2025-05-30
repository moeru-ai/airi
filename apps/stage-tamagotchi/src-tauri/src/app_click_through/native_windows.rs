/// Get cursor position relative to the window
#[cfg(target_os = "windows")]
pub async fn is_cursor_in_window(window: &tauri::Window) -> bool {
  use windows::Win32::{
    Foundation::{POINT, RECT},
    UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect},
  };

  unsafe {
    let hwnd = window.hwnd().unwrap();
    let mut cursor_pos = POINT::default();
    let mut window_rect = RECT::default();

    // Get cursor position in screen coordinates
    if GetCursorPos(&mut cursor_pos).is_ok() {
      // Get window rectangle
      if GetWindowRect(hwnd, &mut window_rect).is_ok() {
        // Check if cursor is inside window bounds
        return cursor_pos.x >= window_rect.left && cursor_pos.x <= window_rect.right && cursor_pos.y >= window_rect.top && cursor_pos.y <= window_rect.bottom;
      }
    }

    false
  }
}

/// Check if modifier key is pressed (Alt key)
#[cfg(target_os = "windows")]
pub fn is_modifier_pressed() -> bool {
  use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_MENU};
  unsafe {
    // Check if Alt key is pressed (VK_MENU is the virtual key code for Alt)
    GetAsyncKeyState(VK_MENU.0 as i32) < 0
  }
}
