use tauri::{
    Manager,
    WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_window_router_link::WindowMatcher;
use tauri_plugin_prevent_default::Flags;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

mod app;
mod memory;

use app::windows::{chat, onboarding, settings};
use memory::start_memory_service;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let prevent_default_plugin = tauri_plugin_prevent_default::Builder::new()
        .with_flags(Flags::RELOAD)
        .build();

    tauri::Builder::default()
        // External plugins
        .plugin(prevent_default_plugin)
        .plugin(tauri_plugin_mcp::Builder.build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_positioner::init())
        // Project AIRI plugins
        .plugin(tauri_plugin_ipc_audio_transcription_ort::init())
        .plugin(tauri_plugin_ipc_audio_vad_ort::init())
        .plugin(tauri_plugin_window_pass_through_on_hover::init())
        .plugin(tauri_plugin_rdev::init())
        .plugin(tauri_plugin_window_router_link::init(
            WindowMatcher::new()
                .register("chat", |app, on_page_load| {
                    chat::new_chat_window(&app, on_page_load)
                        .map_err(|e| e)
                })
                .register("settings", |app, on_page_load| {
                    settings::new_settings_window(&app, on_page_load)
                        .map_err(|e| e)
                })
                .register("onboarding", |app, on_page_load| {
                    onboarding::new_onboarding_window(&app, on_page_load)
                        .map_err(|e| e)
                })
        ))
        .setup(|app| {
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default());

            builder = builder.title("AIRI")
                .decorations(false)
                .inner_size(450.0, 600.0)
                .shadow(false)
                .transparent(true)
                .always_on_top(true);

            #[cfg(target_os = "macos")]
            {
                builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
            }

            let _window = builder.build().unwrap();
            #[cfg(debug_assertions)]
            _window.open_devtools();

            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory); // hide dock icon
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ... (Menu and TrayIcon setup)

            // Here, we call the start_memory_service function
            #[cfg(debug_assertions)]
            start_memory_service(app.app_handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::commands::open_settings_window,
            app::commands::open_chat_window,
            app::commands::open_onboarding_window,
            app::commands::debug_println,
            // Here, we add start_memory_service to the handler
            start_memory_service,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
