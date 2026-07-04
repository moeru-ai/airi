// Commands module barrel - exposes all command submodules
// Each submodule wires eventa invoke contract names to Rust #[tauri::command] handlers.

pub mod app;
pub mod auth;
pub mod auto_updater;
pub mod events;
pub mod godot;
pub mod i18n;
pub mod mcp;
pub mod misc;
pub mod notice;
pub mod plugins;
pub mod screen;
pub mod server_channel;
pub mod system_preferences;
pub mod shortcut;
pub mod widgets;
pub mod window;
pub mod windows;
