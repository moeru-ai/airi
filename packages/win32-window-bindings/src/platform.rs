use core::ffi::c_void;
use std::collections::HashSet;
use std::mem;

use napi::bindgen_prelude::{Error, Result, Status};

use super::{ResolvedOptions, WindowInfo, WindowRect, WIN32_WINDOW_ID_PREFIX};
use windows::core::Result as WinResult;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::UI::WindowsAndMessaging::{
  EnumWindows, GetForegroundWindow, GetTopWindow, GetWindow, GetWindowLongPtrW, GetWindowRect,
  GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
  GWL_EXSTYLE, GW_HWNDNEXT, GW_HWNDPREV, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

const HRESULT_SUCCESS: i32 = 0;
const HRESULT_WAIT_TIMEOUT: i32 = 0x80070102u32 as i32; // WAIT_TIMEOUT
const HRESULT_NO_MORE_ITEMS: i32 = 0x800700cbu32 as i32; // ERROR_NO_MORE_ITEMS

/// Convert a Win32 API call that returns an HWND into a Result.
/// Some HWND-returning APIs (e.g. GetWindow/GW_HWNDNEXT) legitimately return NULL
/// when the iteration reaches the end, but the windows crate still surfaces that
/// as an Err whose code is 0 (ERROR_SUCCESS). Treat that specific case as a
/// successful "no window" sentinel rather than a hard failure so dock mode
/// can gracefully fall back to Electron when the z-order is exhausted.
fn win_hwnd(
  result: WinResult<HWND>,
  name: &str,
) -> Result<HWND> {
  match result {
    Ok(hwnd) => Ok(hwnd),
    // Some HWND-returning APIs occasionally bubble up spurious HRESULTs (e.g. WAIT_TIMEOUT) even
    // though the call simply reached the end of the z-order. Treat these as a graceful stop so we
    // can fall back to alternate enumeration without surfacing noisy warnings upstream.
    Err(err)
      if matches!(
        err.code().0,
        HRESULT_SUCCESS | HRESULT_WAIT_TIMEOUT | HRESULT_NO_MORE_ITEMS
      ) =>
    {
      Ok(HWND::default())
    },
    Err(err) => Err(Error::new(
      Status::GenericFailure,
      format!("{name} failed: {err}"),
    )),
  }
}

/// Collect HWNDs in top-to-bottom z-order using EnumWindows. EnumWindows order is stable enough
/// for our purposes and avoids repeated GetWindow hops that can return transient errors on some
/// Windows builds.
fn enum_windows_handles() -> Result<Vec<HWND>> {
  extern "system" fn collect(
    hwnd: HWND,
    lparam: LPARAM,
  ) -> BOOL {
    // SAFETY: lparam points to a live Vec<HWND> owned by the caller.
    let handles = unsafe { &mut *(lparam.0 as *mut Vec<HWND>) };
    handles.push(hwnd);
    BOOL(1)
  }

  let mut handles = Vec::new();
  let result = unsafe { EnumWindows(Some(collect), LPARAM(&mut handles as *mut _ as isize)) };
  result.map_err(|err| Error::new(Status::GenericFailure, format!("EnumWindows failed: {err}")))?;

  Ok(handles)
}

fn to_window_infos(
  handles: Vec<HWND>,
  options: &ResolvedOptions,
) -> Result<Vec<WindowInfo>> {
  let mut windows = Vec::new();
  let mut seen = HashSet::new();

  for hwnd in handles {
    if let Some(window) = to_window_info(hwnd, options)? {
      if seen.insert(window.id.clone()) {
        windows.push(window);
      }
    }
  }

  Ok(windows)
}

pub fn list_windows(options: ResolvedOptions) -> Result<Vec<WindowInfo>> {
  list_windows_primary(options).or_else(|_| list_windows_enum(options))
}

fn list_windows_primary(options: ResolvedOptions) -> Result<Vec<WindowInfo>> {
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

fn list_windows_enum(options: ResolvedOptions) -> Result<Vec<WindowInfo>> {
  to_window_infos(enum_windows_handles()?, &options)
}

pub fn window_from_id(
  id: &str,
  options: ResolvedOptions,
) -> Result<Option<WindowInfo>> {
  match parse_hwnd(id) {
    Some(hwnd) => to_window_info(hwnd, &options),
    None => Ok(None),
  }
}

pub fn windows_above(
  id: &str,
  options: ResolvedOptions,
) -> Result<Vec<WindowInfo>> {
  windows_above_primary(id, options).or_else(|_| windows_above_enum(id, options))
}

fn windows_above_primary(
  id: &str,
  options: ResolvedOptions,
) -> Result<Vec<WindowInfo>> {
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

fn windows_above_enum(
  id: &str,
  options: ResolvedOptions,
) -> Result<Vec<WindowInfo>> {
  let Some(target) = parse_hwnd(id) else {
    return Ok(Vec::new());
  };

  let handles = enum_windows_handles()?;
  let Some(pos) = handles.iter().position(|&hwnd| hwnd == target) else {
    return Ok(Vec::new());
  };

  // EnumWindows returns top-most first. Windows above target are those before its index.
  let mut seen = HashSet::new();
  let mut results = Vec::new();
  for hwnd in handles.into_iter().take(pos) {
    if let Some(window) = to_window_info(hwnd, &options)? {
      if seen.insert(window.id.clone()) {
        results.push(window);
      }
    }
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

fn to_window_info(
  hwnd: HWND,
  options: &ResolvedOptions,
) -> Result<Option<WindowInfo>> {
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
  } else {
    None
  };

  let owner_pid = if options.include_owner_pid {
    Some(read_owner_pid(hwnd))
  } else {
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
    .map_err(|err| {
      Error::new(
        Status::GenericFailure,
        format!("UTF-16 decode failed: {err}"),
      )
    })
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
  win_hwnd(
    unsafe { GetWindow(hwnd, GW_HWNDNEXT) },
    "GetWindow(GW_HWNDNEXT)",
  )
}

fn window_prev(hwnd: HWND) -> Result<HWND> {
  win_hwnd(
    unsafe { GetWindow(hwnd, GW_HWNDPREV) },
    "GetWindow(GW_HWNDPREV)",
  )
}

fn win_err<T>(
  result: WinResult<T>,
  name: &str,
) -> Result<T> {
  result.map_err(|err| Error::new(Status::GenericFailure, format!("{name} failed: {err}")))
}
