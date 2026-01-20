#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;

#[cfg_attr(not(windows), allow(dead_code))]
const WIN32_WINDOW_ID_PREFIX: &str = "win32:";

#[napi(object)]
pub struct QueryOptions {
  pub include_title: Option<bool>,
  pub include_owner_pid: Option<bool>,
}

#[derive(Clone, Copy)]
#[cfg_attr(not(windows), allow(dead_code))]
struct ResolvedOptions {
  include_title: bool,
  include_owner_pid: bool,
}

impl From<Option<QueryOptions>> for ResolvedOptions {
  fn from(options: Option<QueryOptions>) -> Self {
    let defaults = QueryOptions {
      include_title: Some(true),
      include_owner_pid: Some(true),
    };
    let opts = options.as_ref().unwrap_or(&defaults);

    Self {
      include_title: opts.include_title.unwrap_or(true),
      include_owner_pid: opts.include_owner_pid.unwrap_or(true),
    }
  }
}

#[napi(object)]
pub struct WindowRect {
  pub left: i32,
  pub top: i32,
  pub right: i32,
  pub bottom: i32,
}

#[napi(object)]
pub struct WindowInfo {
  pub id: String,
  pub rect: WindowRect,
  pub is_visible: bool,
  pub is_minimized: bool,
  pub is_cloaked: bool,
  pub ex_style: u32,
  pub title: Option<String>,
  pub owner_pid: Option<u32>,
}

#[cfg(windows)]
mod platform;

#[cfg(not(windows))]
mod platform {
  use super::*;

  fn unsupported() -> Error {
    Error::from_reason(String::from(
      "@proj-airi/win32-window-bindings is only available on Windows targets",
    ))
  }

  pub fn list_windows(_options: ResolvedOptions) -> Result<Vec<WindowInfo>> {
    Err(unsupported())
  }

  pub fn window_from_id(
    _id: &str,
    _options: ResolvedOptions,
  ) -> Result<Option<WindowInfo>> {
    Err(unsupported())
  }

  pub fn windows_above(
    _id: &str,
    _options: ResolvedOptions,
  ) -> Result<Vec<WindowInfo>> {
    Err(unsupported())
  }

  pub fn foreground_window(_options: ResolvedOptions) -> Result<Option<WindowInfo>> {
    Err(unsupported())
  }
}

#[napi(js_name = "listWindows")]
pub fn list_windows(options: Option<QueryOptions>) -> Result<Vec<WindowInfo>> {
  platform::list_windows(options.into())
}

#[napi(js_name = "getWindow")]
pub fn get_window(
  id: String,
  options: Option<QueryOptions>,
) -> Result<Option<WindowInfo>> {
  platform::window_from_id(&id, options.into())
}

#[napi(js_name = "getWindowsAbove")]
pub fn get_windows_above(
  id: String,
  options: Option<QueryOptions>,
) -> Result<Vec<WindowInfo>> {
  platform::windows_above(&id, options.into())
}

#[napi(js_name = "getForegroundWindow")]
pub fn get_foreground_window(options: Option<QueryOptions>) -> Result<Option<WindowInfo>> {
  platform::foreground_window(options.into())
}
