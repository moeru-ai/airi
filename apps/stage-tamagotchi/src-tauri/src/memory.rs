use tauri::{AppHandle, Wry};
use std::process::{Command, Stdio};
use std::env;

#[tauri::command]
pub fn start_memory_service(app_handle: AppHandle<Wry>) {
    // Determine the correct binary name based on the target OS and architecture.
    let binary_name = if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            // Windows on ARM64
            "memory-service-bin-aarch64-pc-windows-msvc.exe"
        } else {
            // Windows on x64 (Intel/AMD)
            "memory-service-bin-x86_64-pc-windows-msvc.exe"
        }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            // Apple Silicon
            "memory-service-bin-aarch64-apple-darwin"
        } else {
            // Intel
            "memory-service-bin-x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "linux") {
        if cfg!(target_arch = "aarch64") {
            "memory-service-bin-aarch64-unknown-linux-gnu" // Linux on ARM64
        } else {
            "memory-service-bin-x86_64-unknown-linux-gnu" // Linux on x64 (Intel/AMD)
        }
    } else {
        // Fallback for other platforms
        "memory-service-bin"
    };

    // Construct the command to run the sidecar.
    // NOTE: This assumes the binary is in the same directory as the executable.
    // This method is not reliable for bundled applications.
    Command::new(binary_name)
        .stdout(Stdio::piped())
        .spawn()
        .expect("Failed to spawn sidecar process");
}
