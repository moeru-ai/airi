use tauri::{AppHandle, Wry};
use std::env;
use std::process::{Command, CommandEvent};

use tauri::api::process::{Command, CommandEvent};

#[tauri::command]
fn start_memory_service(app_handle: tauri::AppHandle<tauri::Wry>) {
  let sidecar_path = app_handle.path_resolver()
      .resolve_resource("node")
      .expect("Failed to resolve node path");

  let js_bundle_path = app_handle.path_resolver()
      .resolve_resource("../services/memory-service/dist/bundle.js")
      .expect("Failed to resolve js bundle path");

  let (mut rx, mut child) = Command::new(sidecar_path)
      .args(&[js_bundle_path])
      .spawn()
      .expect("Failed to spawn sidecar process");
}
