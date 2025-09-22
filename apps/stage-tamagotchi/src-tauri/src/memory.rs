use tauri::process::{Command, CommandEvent};
use tauri::{AppHandle, Wry};

#[tauri::command]
pub fn start_memory_service(app: AppHandle<Wry>) -> Result<(), String> {
    let node_path = app
        .path_resolver()
        .resolve_resource("node")
        .ok_or("Failed to resolve node path")?;

    let bundle_js = app
        .path_resolver()
        .resolve_resource("../services/memory-service/dist/bundle.js")
        .ok_or("Failed to resolve js bundle path")?;

    let (mut rx, _child) = Command::new(node_path)
        .args([bundle_js])
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar process: {e}"))?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    tauri::Logger::for_target("memory-service").info(line);
                }
                CommandEvent::Stderr(line) => {
                    tauri::Logger::for_target("memory-service").error(line);
                }
                CommandEvent::Error(line) => {
                    tauri::Logger::for_target("memory-service").error(format!("proc error: {line}"));
                }
                CommandEvent::Terminated(payload) => {
                    tauri::Logger::for_target("memory-service")
                        .warn(format!("terminated: {payload:?}"));
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}
