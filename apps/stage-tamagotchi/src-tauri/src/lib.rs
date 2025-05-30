use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri::RunEvent;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

#[cfg(target_os = "macos")]
use objc2::{class, msg_send};

#[cfg(target_os = "macos")]
use objc2_foundation::{NSPoint, NSRect};

#[cfg(target_os = "macos")]
use tauri::{ActivationPolicy, TitleBarStyle};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_prevent_default::Flags;

#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
  GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_TRANSPARENT,
};

mod commands;
mod windows;

#[derive(Default)]
struct WindowClickThroughState {
  is_click_through_monitoring_enabled: Arc<AtomicBool>,
  is_click_through_enabled: Arc<AtomicBool>,
  is_click_through_cursor_inside: Arc<AtomicBool>,
}

fn set_cursor_inside(window: &tauri::Window, is_inside: bool) -> Result<(), String> {
  let state = window.state::<WindowClickThroughState>();

  state
    .is_click_through_cursor_inside
    .store(is_inside, Ordering::Relaxed);

  window
    .set_ignore_cursor_events(is_inside)
    .map_err(|e| format!("Failed to set click-through state: {}", e))?;

  let _ = window.emit("tauri-app:window-click-through:is-inside", is_inside);

  Ok(())
}

fn set_click_through_enabled(window: &tauri::Window, enabled: bool) -> Result<(), String> {
  let state = window.state::<WindowClickThroughState>();

  state
    .is_click_through_enabled
    .store(enabled, Ordering::Relaxed);

  window
    .set_ignore_cursor_events(enabled)
    .map_err(|e| format!("Failed to set click-through state: {}", e))?;

  let _ = window.emit("tauri-app:window-click-through:enabled", enabled);

  Ok(())
}

/// Get cursor position relative to the window
#[cfg(target_os = "macos")]
async fn is_cursor_in_window(window: &tauri::Window) -> bool {
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
    let ns_window: *mut objc2::runtime::AnyObject = window.ns_window().unwrap() as *mut _;
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
      let is_inside = mouse_location.x >= window_frame.origin.x
        && mouse_location.x <= (window_frame.origin.x + window_frame.size.width)
        && mouse_location.y >= window_frame.origin.y
        && mouse_location.y <= (window_frame.origin.y + window_frame.size.height);

      if is_inside {
        return true;
      }
    }
  }
  false
}

/// Check if modifier key is pressed (Option/Alt or Control)
#[cfg(target_os = "macos")]
fn is_modifier_pressed() -> bool {
  unsafe {
    let event_class: &'static objc2::runtime::AnyClass = class!(NSEvent);
    let flags: u64 = msg_send![event_class, modifierFlags];

    // Check for Alt/Option (1 << 19) or Control (1 << 18)
    let alt_pressed = (flags & (1 << 19)) != 0;
    // let ctrl_pressed = (flags & (1 << 18)) != 0;

    // alt_pressed || ctrl_pressed
    alt_pressed
  }
}

#[tauri::command]
async fn start_monitor_for_clicking_through(window: tauri::Window) -> Result<(), String> {
  log::info!("Starting monitor for clicking through");

  let window = window.clone();
  let state = window.state::<WindowClickThroughState>();
  let is_click_through_enabled = state.is_click_through_enabled.clone();
  let is_click_through_monitoring_enabled = state.is_click_through_monitoring_enabled.clone();

  // Already monitoring?
  if is_click_through_monitoring_enabled.load(Ordering::Relaxed) {
    return Ok(());
  } else {
    // Set to true
    state
      .is_click_through_monitoring_enabled
      .store(true, Ordering::Relaxed);
  }

  // Then start interval timer for monitoring
  tauri::async_runtime::spawn(async move {
    loop {
      sleep(Duration::from_millis(32)).await; // ~30FPS check rate

      // If monitoring is already stopped, break the loop
      if !is_click_through_monitoring_enabled.load(Ordering::Relaxed) {
        log::info!("Monitoring is stopped, breaking loop");
        break;
      }

      // If is disabled already, skip until next check
      if !is_click_through_enabled.load(Ordering::Relaxed) {
        log::info!("Click-through is disabled, skipping check");
        continue;
      }

      #[cfg(target_os = "macos")]
      {
        let cursor_inside = is_cursor_in_window(&window).await;
        let modifier_pressed = is_modifier_pressed();

        log::info!(
          "Cursor inside: {}, Modifier pressed: {}",
          cursor_inside,
          modifier_pressed
        );

        // Only allow disabling click-through when:
        // 1. Cursor is OUTSIDE the window AND
        // 2. Modifier key is pressed
        let should_be_click_through = cursor_inside && !modifier_pressed;

        if should_be_click_through {
          let _ = set_cursor_inside(&window, true);
        } else {
          let _ = set_cursor_inside(&window, false);
        }
      }
    }
  });

  return Ok(());
}

#[tauri::command]
async fn stop_monitor_for_clicking_through(window: tauri::Window) -> Result<(), String> {
  log::info!("Stopping monitor for clicking through");

  let window = window.clone();
  let state = window.state::<WindowClickThroughState>();

  // Set to false
  // Termination will be triggered in the next interval check (tick)
  state
    .is_click_through_monitoring_enabled
    .store(false, Ordering::Relaxed);

  Ok(())
}

#[tauri::command]
async fn start_click_through(window: tauri::Window) -> Result<(), String> {
  set_click_through_enabled(&window, true)?;
  Ok(())
}

#[tauri::command]
async fn stop_click_through(window: tauri::Window) -> Result<(), String> {
  set_click_through_enabled(&window, false)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let prevent_default_plugin = tauri_plugin_prevent_default::Builder::new()
    .with_flags(Flags::RELOAD)
    .build();

  tauri::Builder::default()
    .plugin(prevent_default_plugin)
    .plugin(tauri_plugin_mcp::Builder.build())
    .plugin(tauri_plugin_os::init())
    .manage(WindowClickThroughState::default())
    .setup(|app| {
      let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default());

      builder = builder
        .title("AIRI")
        .decorations(false)
        .inner_size(450.0, 600.0)
        .shadow(false)
        .transparent(true)
        .always_on_top(true);

      #[cfg(target_os = "macos")]
      {
        builder = builder.title_bar_style(TitleBarStyle::Transparent);
      }

      let _ = builder.build().unwrap();

      #[cfg(target_os = "macos")]
      app.set_activation_policy(ActivationPolicy::Accessory); // hide dock icon

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // TODO: i18n
      let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
      let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&settings_item, &hide_item, &show_item, &quit_item])?;

      let _ = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone()) // TODO: use custom icon
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
          "quit" => {
            tauri_plugin_mcp::destroy(app);
            let _ = app.emit("mcp_plugin_destroyed", ());
            app.cleanup_before_exit();
            app.exit(0);
          }
          "settings" => {
            let window = app.get_webview_window("settings");
            if let Some(window) = window {
              let _ = window.show();
              return;
            }

            windows::settings::new_settings_window(app).unwrap();
          }
          "hide" => {
            let window = app.get_webview_window("settings");
            if let Some(window) = window {
              let _ = window.hide();
            }
          }
          "show" => {
            let window = app.get_webview_window("settings");
            if let Some(window) = window {
              let _ = window.show();
            }
          }
          _ => {}
        })
        .show_menu_on_left_click(true)
        .build(app)
        .unwrap();
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::open_settings_window,
      commands::open_chat_window,
      start_monitor_for_clicking_through,
      stop_monitor_for_clicking_through,
      start_click_through,
      stop_click_through,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_, event| match event {
      RunEvent::ExitRequested { .. } => {
        println!("Exiting app");
        println!("Exited app");
      }
      _ => {}
    });
}
