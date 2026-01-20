use core::ffi::c_void;
use std::collections::HashSet;
use std::mem;

use napi::bindgen_prelude::{Error, Result, Status};

use super::{ResolvedOptions, WindowInfo, WindowRect, WIN32_WINDOW_ID_PREFIX};
use windows::core::Result as WinResult;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::UI::WindowsAndMessaging::{
  GetForegroundWindow, GetTopWindow, GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW,
  GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, GW_HWNDNEXT, GW_HWNDPREV, GWL_EXSTYLE,
  WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

/// Convert a Win32 API call that returns an HWND into a Result.
/// Some HWND-returning APIs (e.g. GetWindow/GW_HWNDNEXT) legitimately return NULL
/// when the iteration reaches the end, but the windows crate still surfaces that
/// as an Err whose code is 0 (ERROR_SUCCESS). Treat that specific case as a
/// successful "no window" sentinel rather than a hard failure so dock mode
/// can gracefully fall back to Electron when the z-order is exhausted.
fn win_hwnd(result: WinResult<HWND>, name: &str) -> Result<HWND> {
  match result {
    Ok(hwnd) => Ok(hwnd),
    Err(err) if err.code().0 == 0 => Ok(HWND::default()),
    Err(err) => Err(Error::new(Status::GenericFailure, format!("{name} failed: {err}"))),
  }
}

pub fn list_windows(options: ResolvedOptions) -> Result<Vec<WindowInfo>> {
  let mut windows = Vec::new();
  let mut seen = HashSet::new();

  let mut current = top_window()?;
  while !is_null_hwnd(current) {
    if let Some(window) = to_window_info(current, &options)? {
      if seen.insert(window.id.clone()) {
        windows.push(window);
      }
    }
    current = window_next(current)?;
  }

  Ok(windows)
}

pub fn window_from_id(id: &str, options: ResolvedOptions) -> Result<Option<WindowInfo>> {
  match parse_hwnd(id) {
    Some(hwnd) => to_window_info(hwnd, &options),
    None => Ok(None),
  }
}

pub fn windows_above(id: &str, options: ResolvedOptions) -> Result<Vec<WindowInfo>> {
  let Some(target) = parse_hwnd(id) else {
    return Ok(Vec::new());
  };
  if is_null_hwnd(target) {
    return Ok(Vec::new());
  }

  let mut results = Vec::new();
  let mut seen = HashSet::new();
  let mut current = window_prev(target)?;

  while !is_null_hwnd(current) {
    if let Some(window) = to_window_info(current, &options)? {
      if seen.insert(window.id.clone()) {
        results.push(window);
      }
    }
    current = window_prev(current)?;
  }

  Ok(results)
}

pub fn foreground_window(options: ResolvedOptions) -> Result<Option<WindowInfo>> {
  let hwnd = foreground_hwnd();
  if is_null_hwnd(hwnd) {
    return Ok(None);
  }

  to_window_info(hwnd, &options)
}

fn to_window_info(hwnd: HWND, options: &ResolvedOptions) -> Result<Option<WindowInfo>> {
  if is_null_hwnd(hwnd) {
    return Ok(None);
  }

  let rect = match read_rect(hwnd) {
    Ok(rect) => rect,
    Err(_) => return Ok(None),
  };
  if rect.width <= 0 || rect.height <= 0 {
    return Ok(None);
  }

  let ex_style = read_ex_style(hwnd);
  if is_tool_window(ex_style) || is_no_activate(ex_style) {
    return Ok(None);
  }

  let is_visible = window_visible(hwnd);
  let is_minimized = window_iconic(hwnd);
  let is_cloaked = read_cloaked(hwnd);

  let title = if options.include_title {
    match read_title(hwnd) {
      Ok(value) => value,
      Err(_) => None,
    }
  }
  else {
    None
  };

  let owner_pid = if options.include_owner_pid {
    Some(read_owner_pid(hwnd))
  }
  else {
    None
  };

  Ok(Some(WindowInfo {
    id: hwnd_to_id(hwnd),
    rect: WindowRect {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    },
    is_visible,
    is_minimized,
    is_cloaked,
    ex_style,
    title,
    owner_pid,
  }))
}

struct RectParts {
  left: i32,
  top: i32,
  right: i32,
  bottom: i32,
  width: i32,
  height: i32,
}

fn read_rect(hwnd: HWND) -> Result<RectParts> {
  let mut rect = RECT::default();
  // windows crate 0.59 makes GetWindowRect return WinResult<()>, so treat it like other fallible APIs
  win_err(unsafe { GetWindowRect(hwnd, &mut rect) }, "GetWindowRect")?;

  let width = rect.right - rect.left;
  let height = rect.bottom - rect.top;

  Ok(RectParts {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width,
    height,
  })
}

fn read_title(hwnd: HWND) -> Result<Option<String>> {
  let length = unsafe { GetWindowTextLengthW(hwnd) };
  if length <= 0 {
    return Ok(None);
  }

  let mut buffer = vec![0u16; length as usize + 1];
  let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
  if copied <= 0 {
    return Ok(None);
  }

  buffer.truncate(copied as usize);
  String::from_utf16(&buffer)
    .map(Some)
    .map_err(|err| Error::new(Status::GenericFailure, format!("UTF-16 decode failed: {err}")))
}

fn read_owner_pid(hwnd: HWND) -> u32 {
  let mut pid: u32 = 0;
  unsafe {
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
  }
  pid
}

fn read_cloaked(hwnd: HWND) -> bool {
  let mut cloaked: u32 = 0;
  let hr = unsafe {
    DwmGetWindowAttribute(
      hwnd,
      DWMWA_CLOAKED,
      &mut cloaked as *mut u32 as *mut c_void,
      mem::size_of::<u32>() as u32,
    )
  };
  hr.is_ok() && cloaked != 0
}

fn parse_hwnd(id: &str) -> Option<HWND> {
  if !id.starts_with(WIN32_WINDOW_ID_PREFIX) {
    return None;
  }

  let hex = &id[WIN32_WINDOW_ID_PREFIX.len()..];
  let value = u64::from_str_radix(hex, 16).ok()?;

  if mem::size_of::<isize>() < 8 && value > u32::MAX as u64 {
    return None;
  }

  Some(HWND(value as usize as *mut c_void))
}

fn hwnd_to_id(hwnd: HWND) -> String {
  format!("{WIN32_WINDOW_ID_PREFIX}{:x}", hwnd.0 as usize as u64)
}

fn is_null_hwnd(hwnd: HWND) -> bool {
  hwnd.0.is_null()
}

fn is_tool_window(ex_style: u32) -> bool {
  ex_style & WS_EX_TOOLWINDOW.0 != 0
}

fn is_no_activate(ex_style: u32) -> bool {
  ex_style & WS_EX_NOACTIVATE.0 != 0
}

fn read_ex_style(hwnd: HWND) -> u32 {
  unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 }
}

fn window_visible(hwnd: HWND) -> bool {
  unsafe { IsWindowVisible(hwnd).as_bool() }
}

fn window_iconic(hwnd: HWND) -> bool {
  unsafe { IsIconic(hwnd).as_bool() }
}

fn foreground_hwnd() -> HWND {
  unsafe { GetForegroundWindow() }
}

fn top_window() -> Result<HWND> {
  win_hwnd(unsafe { GetTopWindow(None) }, "GetTopWindow")
}

fn window_next(hwnd: HWND) -> Result<HWND> {
  win_hwnd(unsafe { GetWindow(hwnd, GW_HWNDNEXT) }, "GetWindow(GW_HWNDNEXT)")
}

fn window_prev(hwnd: HWND) -> Result<HWND> {
  win_hwnd(unsafe { GetWindow(hwnd, GW_HWNDPREV) }, "GetWindow(GW_HWNDPREV)")
}

fn win_err<T>(result: WinResult<T>, name: &str) -> Result<T> {
  result.map_err(|err| Error::new(Status::GenericFailure, format!("{name} failed: {err}")))
}
