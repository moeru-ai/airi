#[cfg(target_os = "windows")]
use tauri::Runtime;

#[cfg(target_os = "windows")]
use super::types::{Point, Size, WindowFrame};

#[cfg(target_os = "windows")]
pub fn get_window_frame<R: Runtime>(window: &tauri::Window<R>) -> WindowFrame {
  use windows::Win32::{Foundation::RECT, UI::WindowsAndMessaging::GetWindowRect};

  unsafe {
    let hwnd = window.hwnd().unwrap();
    let mut rect = RECT::default();

    // Get window rectangle
    if GetWindowRect(hwnd, &mut rect).is_ok() {
      // Return the coordinates as (left, top, right, bottom)
      return WindowFrame {
        origin: Point {
          x: rect.left.into(),
          y: rect.top.into(),
        },
        size:   Size {
          width:  (rect.right - rect.left).into(),
          height: (rect.bottom - rect.top).into(),
        },
      };
    }
  }

  WindowFrame {
    origin: Point { x: 0.0, y: 0.0 },
    size:   Size {
      width:  0.0,
      height: 0.0,
    },
  } // Default if unable to get window frame
}

#[cfg(target_os = "windows")]
pub fn get_mouse_location() -> Point {
  use windows::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};

  unsafe {
    let mut cursor_pos = POINT::default();

    // Get cursor position in screen coordinates
    if GetCursorPos(&mut cursor_pos).is_ok() {
      return Point {
        x: cursor_pos.x.into(),
        y: cursor_pos.y.into(),
      };
    }
  }

  Point { x: 0.0, y: 0.0 } // Default if unable to get cursor position
}
