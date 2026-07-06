// AIRI Tauri — main entry.
//
// The `#[tauri::command]` handlers wire the Rust backend to the renderer via
// the eventa contract names defined in `@proj-airi/tauri-eventa`.
//
// Each snake_case function name below serves the eventa invoke contract whose
// ID is `eventa:invoke:<contract-group>:<snake-name>` (e.g.
// `electron_window_get_bounds` serves `eventa:invoke:electron:window:get-bounds`).

mod app_lifecycle;
mod channel_server;
mod commands;
mod window_manager;

use tauri::{Emitter, Manager};

const WINDOW_BOUNDS_EVENT: &str = "electron:window:bounds";
const WINDOW_LIFECYCLE_CHANGED_EVENT: &str = "electron:window:lifecycle-changed";
const CURSOR_SCREEN_POINT_EVENT: &str = "electron:screen:cursor-screen-point";
const AUTO_UPDATER_STATE_CHANGED_EVENT: &str = "electron:auto-updater:state-changed";

fn main() {
    let channel_server_state = channel_server::ChannelServerState::default();
    let plugin_host_state = commands::plugins::PluginHostState::default();
    let mcp_runtime = commands::mcp::McpRuntimeManager::default();

    tauri::Builder::default()
        .manage(channel_server_state.clone())
        .manage(commands::notice::new_notice_registry())
        .manage(commands::widgets::new_widget_registry())
        .manage(plugin_host_state.clone())
        .manage(mcp_runtime)
        .setup(move |app| {
            let godot_app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
            app.manage(commands::godot::GodotStageController::new(
                godot_app_data_dir,
            ));

            let handle = app.handle().clone();
            spawn_channel_server(channel_server_state.clone());

            let restored = app_lifecycle::restore_main_window_state(&handle).unwrap_or(false);
            if restored {
                if let Some(window) = handle.get_webview_window(app_lifecycle::MAIN_WINDOW_LABEL) {
                    if let Err(error) = window.set_always_on_top(true) {
                        eprintln!("failed to reassert main window always-on-top: {error}");
                    }
                }
            } else if let Err(error) = window_manager::apply_main_window_display_features(&handle) {
                eprintln!("failed to apply main window display features: {error}");
            }
            if let Err(error) = app_lifecycle::show_main_window(&handle) {
                eprintln!("failed to show main window after lifecycle setup: {error}");
            }
            app_lifecycle::setup_main_window_close_persistence(&handle);
            if let Err(error) = app_lifecycle::setup_tray(&handle) {
                eprintln!("failed to setup tray: {error}");
            }

            // Spawn a background task that emits window:bounds events on resize/move.
            // Broadcasting (Tauri v2 bare `emit`) is used so caption/settings widgets
            // observe the same bounds events as the main window.
            {
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(std::time::Duration::from_millis(100));
                    let mut last_bounds: Option<(i32, i32, i32, i32)> = None;
                    loop {
                        interval.tick().await;
                        if let Some(win) = handle.get_webview_window("main") {
                            if let (Ok(pos), Ok(size), Ok(scale_factor)) =
                                (win.outer_position(), win.outer_size(), win.scale_factor())
                            {
                                let lpos = pos.to_logical::<f64>(scale_factor);
                                let lsize = size.to_logical::<f64>(scale_factor);
                                let bounds = (
                                    lpos.x.round() as i32,
                                    lpos.y.round() as i32,
                                    lsize.width.round() as i32,
                                    lsize.height.round() as i32,
                                );
                                if last_bounds.as_ref() == Some(&bounds) {
                                    continue;
                                }

                                last_bounds = Some(bounds);
                                let _ = handle.emit(WINDOW_BOUNDS_EVENT, serde_json::json!({
                                    "x": bounds.0,
                                    "y": bounds.1,
                                    "width": bounds.2,
                                    "height": bounds.3,
                                }));
                            }
                        }
                    }
                });
            }

            // Poll lifecycle state because Tauri's cross-platform window event
            // stream does not expose minimize/restore directly on Linux.
            {
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(std::time::Duration::from_millis(100));
                    let mut last_state: Option<(bool, bool, bool)> = None;
                    loop {
                        interval.tick().await;
                        if let Some(win) = handle.get_webview_window("main") {
                            let focused = win.is_focused().unwrap_or(false);
                            let minimized = win.is_minimized().unwrap_or(false);
                            let visible = win.is_visible().unwrap_or(false);
                            let state = (focused, minimized, visible);
                            if last_state.as_ref() == Some(&state) {
                                continue;
                            }

                            let reason = match last_state {
                                None => "initial",
                                Some((_, previous_minimized, _)) if !previous_minimized && minimized => {
                                    "minimize"
                                }
                                Some((_, previous_minimized, _)) if previous_minimized && !minimized => {
                                    "restore"
                                }
                                Some((_, _, previous_visible)) if previous_visible && !visible => "hide",
                                Some((_, _, previous_visible)) if !previous_visible && visible => "show",
                                Some((previous_focused, _, _)) if !previous_focused && focused => "focus",
                                Some((previous_focused, _, _)) if previous_focused && !focused => "blur",
                                Some(_) => "snapshot",
                            };

                            last_state = Some(state);
                            if let Ok(lifecycle) =
                                commands::windows::get_window_lifecycle_state(&win, reason)
                            {
                                let _ = handle.emit(WINDOW_LIFECYCLE_CHANGED_EVENT, lifecycle);
                            }
                        }
                    }
                });
            }

            // Tauri does not expose a screen cursor API on all platforms yet, so emit
            // a placeholder stream until the real Wayland cursor reader lands. This
            // must run after setup because renderers subscribe after the window loads.
            {
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(std::time::Duration::from_millis(100));
                    loop {
                        interval.tick().await;
                        let _ = handle.emit(
                            CURSOR_SCREEN_POINT_EVENT,
                            serde_json::json!({ "x": 0, "y": 0 }),
                        );
                    }
                });
            }

            // Auto-updater init handshake. Until tauri-plugin-updater is configured
            // with a feed, emit a stable no-updates state that includes the app version.
            {
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    let _ = handle.emit(
                        AUTO_UPDATER_STATE_CHANGED_EVENT,
                        commands::auto_updater::current_state(),
                    );
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ===== window.rs =====
            commands::window::electron_window_get_bounds,
            commands::window::electron_window_set_bounds,
            commands::window::electron_window_set_ignore_mouse_events,
            commands::window::electron_window_set_vibrancy,
            commands::window::electron_window_set_background_material,
            commands::window::electron_window_resize,
            commands::window::electron_window_close,
            commands::window::electron_window_set_always_on_top,
            // ===== screen.rs =====
            commands::screen::electron_screen_get_all_displays,
            commands::screen::electron_screen_get_primary_display,
            commands::screen::electron_screen_get_cursor_screen_point,
            commands::screen::electron_screen_dip_to_screen_point,
            commands::screen::electron_screen_dip_to_screen_rect,
            commands::screen::electron_screen_screen_to_dip_point,
            commands::screen::electron_screen_screen_to_dip_rect,
            // ===== app.rs =====
            commands::app::electron_app_is_macos,
            commands::app::electron_app_is_windows,
            commands::app::electron_app_is_linux,
            commands::app::electron_app_quit,
            commands::app::electron_app_open_user_data_folder,
            // ===== system_preferences.rs =====
            commands::system_preferences::electron_system_preferences_get_media_access_status,
            commands::system_preferences::electron_system_preferences_ask_for_media_access,
            // ===== auto_updater.rs =====
            commands::auto_updater::electron_auto_updater_get_state,
            commands::auto_updater::electron_auto_updater_check_for_updates,
            commands::auto_updater::electron_auto_updater_download_update,
            commands::auto_updater::electron_auto_updater_quit_and_install,
            commands::auto_updater::electron_auto_updater_get_preferences,
            commands::auto_updater::electron_auto_updater_set_preferences,
            // ===== server_channel.rs =====
            commands::server_channel::electron_server_channel_get_config,
            commands::server_channel::electron_server_channel_apply_config,
            commands::server_channel::electron_server_channel_get_qr_payload,
            // ===== auth.rs =====
            commands::auth::electron_auth_start_login,
            commands::auth::electron_auth_logout,
            // ===== windows.rs =====
            commands::windows::electron_window_get_lifecycle_state,
            commands::windows::stage_tauri_managed_window_open,
            commands::windows::electron_windows_main_devtools_open,
            commands::windows::electron_windows_settings_open,
            commands::windows::electron_windows_chat_open,
            commands::windows::electron_windows_settings_devtools_open,
            commands::windows::electron_windows_devtools_open,
            commands::windows::electron_windows_onboarding_open,
            commands::windows::electron_windows_onboarding_close,
            commands::windows::electron_windows_caption_overlay_get_is_following_window,
            commands::windows::electron_windows_desktop_overlay_get_readiness,
            // ===== widgets.rs =====
            commands::widgets::electron_windows_widgets_open,
            commands::widgets::electron_windows_widgets_hide,
            commands::widgets::electron_windows_widgets_add,
            commands::widgets::electron_windows_widgets_remove,
            commands::widgets::electron_windows_widgets_clear,
            commands::widgets::electron_windows_widgets_update,
            commands::widgets::electron_windows_widgets_fetch,
            commands::widgets::electron_windows_widgets_prepare,
            commands::widgets::electron_windows_widgets_iframe_publish,
            // ===== godot.rs =====
            commands::godot::electron_godot_stage_start,
            commands::godot::electron_godot_stage_stop,
            commands::godot::electron_godot_stage_get_status,
            commands::godot::electron_godot_stage_apply_scene_input,
            commands::godot::electron_godot_stage_view_snapshot_get,
            commands::godot::electron_godot_stage_view_state_apply_patch,
            commands::godot::electron_godot_stage_view_state_request_snapshot,
            // ===== mcp.rs =====
            commands::mcp::electron_mcp_list_tools,
            commands::mcp::electron_mcp_call_tool,
            commands::mcp::electron_mcp_get_runtime_status,
            commands::mcp::electron_mcp_apply_and_restart,
            commands::mcp::electron_mcp_read_config_text,
            commands::mcp::electron_mcp_write_config_text,
            commands::mcp::electron_mcp_test_server,
            commands::mcp::electron_mcp_open_config_file,
            // ===== plugins.rs =====
            commands::plugins::electron_plugins_list,
            commands::plugins::electron_plugins_set_enabled,
            commands::plugins::electron_plugins_set_auto_reload,
            commands::plugins::electron_plugins_load_enabled,
            commands::plugins::electron_plugins_load,
            commands::plugins::electron_plugins_unload,
            commands::plugins::electron_plugins_inspect,
            commands::plugins::electron_plugins_tools_list,
            commands::plugins::electron_plugins_tools_list_xsai,
            commands::plugins::electron_plugins_tools_invoke,
            commands::plugins::electron_plugins_capability_update,
            commands::plugins::proj_airi_plugin_sdk_apis_protocol_resources_providers_list_providers,
            commands::plugins::electron_plugins_asset_base_url,
            // ===== shortcut.rs =====
            commands::shortcut::electron_shortcut_register,
            commands::shortcut::electron_shortcut_unregister,
            commands::shortcut::electron_shortcut_unregister_all,
            commands::shortcut::electron_shortcut_list,
            // ===== i18n.rs =====
            commands::i18n::electron_i18n_set_locale,
            commands::i18n::electron_i18n_get_locale,
            // ===== notice.rs =====
            commands::notice::electron_windows_notice_invoke_open,
            commands::notice::electron_windows_notice_invoke_action,
            commands::notice::electron_windows_notice_invoke_page_mounted,
            commands::notice::electron_windows_notice_invoke_page_unmounted,
            // ===== misc.rs =====
            commands::misc::electron_start_tracking_mouse_position,
            commands::misc::electron_start_dragging_window,
            // ===== events.rs =====
            commands::events::emit_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn spawn_channel_server(state: channel_server::ChannelServerState) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = channel_server::start_channel_server(
            state,
            channel_server::ChannelServerConfig::default(),
        )
        .await
        {
            eprintln!("failed to start channel server: {error}");
        }
    });
}
