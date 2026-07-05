use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const GODOT_STAGE_STATUS_CHANGED_EVENT: &str = "electron:godot-stage:status-changed";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GodotStageStatus {
    pub state: GodotStageState,
    pub pid: Option<u32>,
    pub last_error: Option<String>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GodotStageState {
    Booting,
    Ready,
    Degraded,
    Stopped,
}

#[derive(Debug, PartialEq, Eq)]
pub enum GodotStageLaunchMode {
    Engine,
    Exported,
}

#[derive(Debug, PartialEq, Eq)]
pub struct GodotStageResolvedSidecar {
    pub executable: PathBuf,
    pub mode: GodotStageLaunchMode,
}

struct GodotStageController {
    app_data_dir: PathBuf,
    inner: Mutex<GodotStageControllerInner>,
}

struct GodotStageControllerInner {
    child: Option<Child>,
    status: GodotStageStatus,
}

#[derive(Debug)]
struct GodotStageLaunch {
    executable: PathBuf,
    args: Vec<String>,
    cwd: Option<PathBuf>,
}

#[derive(Debug)]
struct GodotStageStartError {
    message: String,
}

impl Default for GodotStageStatus {
    fn default() -> Self {
        Self {
            state: GodotStageState::Stopped,
            pid: None,
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }
}

impl GodotStageStatus {
    fn booting() -> Self {
        Self {
            state: GodotStageState::Booting,
            pid: None,
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }

    fn ready(pid: u32) -> Self {
        Self {
            state: GodotStageState::Ready,
            pid: Some(pid),
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }

    fn degraded(message: impl Into<String>) -> Self {
        Self {
            state: GodotStageState::Degraded,
            pid: None,
            last_error: Some(message.into()),
            updated_at: current_timestamp_ms(),
        }
    }

    fn stopped() -> Self {
        Self::default()
    }
}

impl GodotStageController {
    fn new(app_data_dir: PathBuf) -> Self {
        Self {
            app_data_dir,
            inner: Mutex::new(GodotStageControllerInner {
                child: None,
                status: GodotStageStatus::default(),
            }),
        }
    }

    #[cfg(test)]
    fn new_for_tests(app_data_dir: PathBuf) -> Self {
        Self::new(app_data_dir)
    }

    fn start_blocking(&self) -> GodotStageStatus {
        let mut inner = self.inner.lock().unwrap();
        inner.refresh_child_status();

        if matches!(
            inner.status.state,
            GodotStageState::Ready | GodotStageState::Booting
        ) && inner.child.is_some()
        {
            return inner.status.clone();
        }

        inner.status = GodotStageStatus::booting();

        match build_godot_stage_launch(&self.app_data_dir).and_then(spawn_godot_stage) {
            Ok(child) => {
                let pid = child.id();
                inner.child = Some(child);
                inner.status = GodotStageStatus::ready(pid);
            }
            Err(error) => {
                inner.child = None;
                inner.status = GodotStageStatus::degraded(error.message);
            }
        }

        inner.status.clone()
    }

    fn stop_blocking(&self) -> GodotStageStatus {
        let mut inner = self.inner.lock().unwrap();
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        inner.status = GodotStageStatus::stopped();
        inner.status.clone()
    }

    fn status_blocking(&self) -> GodotStageStatus {
        let mut inner = self.inner.lock().unwrap();
        inner.refresh_child_status();
        inner.status.clone()
    }
}

impl GodotStageControllerInner {
    fn refresh_child_status(&mut self) {
        let Some(child) = self.child.as_mut() else {
            if matches!(
                self.status.state,
                GodotStageState::Ready | GodotStageState::Booting
            ) {
                self.status = GodotStageStatus::stopped();
            }
            return;
        };

        match child.try_wait() {
            Ok(Some(exit_status)) => {
                self.child = None;
                self.status = GodotStageStatus::degraded(format!(
                    "Godot stage exited unexpectedly with status {exit_status}."
                ));
            }
            Ok(None) => {
                if matches!(self.status.state, GodotStageState::Booting) {
                    if let Some(pid) = self.status.pid {
                        self.status = GodotStageStatus::ready(pid);
                    }
                }
            }
            Err(error) => {
                self.child = None;
                self.status = GodotStageStatus::degraded(format!(
                    "Failed to check Godot stage health: {error}"
                ));
            }
        }
    }
}

impl Drop for GodotStageController {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(mut child) = inner.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn global_controller(app_data_dir: PathBuf) -> Arc<GodotStageController> {
    static CONTROLLER: OnceLock<Arc<GodotStageController>> = OnceLock::new();
    CONTROLLER
        .get_or_init(|| Arc::new(GodotStageController::new(app_data_dir)))
        .clone()
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn emit_status(app: &AppHandle, status: GodotStageStatus) -> GodotStageStatus {
    let _ = app.emit(GODOT_STAGE_STATUS_CHANGED_EVENT, status.clone());
    status
}

fn existing_file_from_env(
    name: &str,
    mode: GodotStageLaunchMode,
) -> Option<GodotStageResolvedSidecar> {
    let path = std::env::var(name).ok()?.trim().to_string();
    if path.is_empty() {
        return None;
    }

    let executable = PathBuf::from(path);
    if executable.is_file() {
        return Some(GodotStageResolvedSidecar { executable, mode });
    }

    None
}

pub fn resolve_godot_stage_sidecar_path(app_data_dir: &Path) -> Option<GodotStageResolvedSidecar> {
    if let Some(resolved) =
        existing_file_from_env("AIRI_GODOT_STAGE_PATH", GodotStageLaunchMode::Exported)
    {
        return Some(resolved);
    }

    if let Some(resolved) = existing_file_from_env("GODOT4", GodotStageLaunchMode::Engine) {
        return Some(resolved);
    }

    let sidecars_dir = app_data_dir.join("sidecars");
    let mut candidates = std::fs::read_dir(sidecars_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("godot-stage"))
        })
        .collect::<Vec<_>>();

    candidates.sort();

    candidates
        .into_iter()
        .next()
        .map(|executable| GodotStageResolvedSidecar {
            executable,
            mode: GodotStageLaunchMode::Exported,
        })
}

fn find_godot_project_path() -> Option<PathBuf> {
    let mut current_directory = std::env::current_dir().ok()?;

    loop {
        let project_path = current_directory
            .join("engines")
            .join("stage-tamagotchi-godot");
        if project_path.join("project.godot").is_file() {
            return Some(project_path);
        }

        if !current_directory.pop() {
            return None;
        }
    }
}

fn build_godot_stage_launch(app_data_dir: &Path) -> Result<GodotStageLaunch, GodotStageStartError> {
    let resolved = resolve_godot_stage_sidecar_path(app_data_dir).ok_or_else(|| GodotStageStartError {
        message: format!(
            "Godot stage binary not found. Set AIRI_GODOT_STAGE_PATH, GODOT4, or place godot-stage under {}.",
            app_data_dir.join("sidecars").display()
        ),
    })?;

    let storage_root = app_data_dir.join("godot-stage");
    let sidecar_args = vec![format!("--airi-storage-root={}", storage_root.display())];

    if resolved.mode == GodotStageLaunchMode::Engine {
        let project_path = find_godot_project_path().ok_or_else(|| GodotStageStartError {
            message: "Godot project not found at engines/stage-tamagotchi-godot/project.godot."
                .to_string(),
        })?;

        let mut args = vec![
            "--path".to_string(),
            project_path.display().to_string(),
            "--".to_string(),
        ];
        args.extend(sidecar_args);

        return Ok(GodotStageLaunch {
            executable: resolved.executable,
            args,
            cwd: Some(project_path),
        });
    }

    Ok(GodotStageLaunch {
        executable: resolved.executable,
        args: sidecar_args,
        cwd: None,
    })
}

fn spawn_godot_stage(launch: GodotStageLaunch) -> Result<Child, GodotStageStartError> {
    let mut command = Command::new(&launch.executable);
    command
        .args(&launch.args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(cwd) = launch.cwd {
        command.current_dir(cwd);
    }

    command.spawn().map_err(|error| GodotStageStartError {
        message: format!(
            "Failed to spawn Godot stage sidecar at {}: {error}",
            launch.executable.display()
        ),
    })
}

fn controller_from_app(app: &AppHandle) -> Result<Arc<GodotStageController>, String> {
    Ok(global_controller(app_data_dir(app)?))
}

#[tauri::command]
pub async fn electron_godot_stage_start(app: AppHandle) -> GodotStageStatus {
    match controller_from_app(&app) {
        Ok(controller) => emit_status(&app, controller.start_blocking()),
        Err(error) => GodotStageStatus::degraded(error),
    }
}

#[tauri::command]
pub async fn electron_godot_stage_stop(app: AppHandle) -> GodotStageStatus {
    match controller_from_app(&app) {
        Ok(controller) => emit_status(&app, controller.stop_blocking()),
        Err(error) => GodotStageStatus::degraded(error),
    }
}

#[tauri::command]
pub async fn electron_godot_stage_get_status(app: AppHandle) -> GodotStageStatus {
    match controller_from_app(&app) {
        Ok(controller) => controller.status_blocking(),
        Err(error) => GodotStageStatus::degraded(error),
    }
}

/// Apply scene input to Godot - placeholder
#[tauri::command]
pub async fn electron_godot_stage_apply_scene_input(_payload: Option<Value>) -> Result<(), String> {
    Ok(())
}

/// Get Godot view snapshot - placeholder
#[tauri::command]
pub async fn electron_godot_stage_view_snapshot_get() -> Option<Value> {
    None
}

/// Apply view patch to Godot - placeholder
#[tauri::command]
pub async fn electron_godot_stage_view_state_apply_patch(_patch: Option<Value>) -> Value {
    serde_json::json!({ "ok": true })
}

/// Request view snapshot from Godot - placeholder
#[tauri::command]
pub async fn electron_godot_stage_view_state_request_snapshot() -> Value {
    serde_json::json!({ "ok": true })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn unique_test_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("airi-godot-{name}-{}", std::process::id()))
    }

    fn write_fake_executable(path: &Path) {
        fs::write(path, "#!/bin/sh\nsleep 30\n").unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(path).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(path, permissions).unwrap();
        }
    }

    #[test]
    fn godot_stage_resolution_prefers_env_over_godot4_and_app_data_sidecar() {
        let _guard = env_lock().lock().unwrap();
        let root = unique_test_path("resolution");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();

        let configured_stage = root.join("configured-godot-stage");
        let godot4 = root.join("godot4");
        let bundled = root.join("sidecars").join("godot-stage-test");
        write_fake_executable(&configured_stage);
        write_fake_executable(&godot4);
        write_fake_executable(&bundled);

        std::env::set_var("AIRI_GODOT_STAGE_PATH", &configured_stage);
        std::env::set_var("GODOT4", &godot4);
        let resolved = resolve_godot_stage_sidecar_path(&root).unwrap();
        assert_eq!(resolved.executable, configured_stage);
        assert_eq!(resolved.mode, GodotStageLaunchMode::Exported);

        std::env::remove_var("AIRI_GODOT_STAGE_PATH");
        let resolved = resolve_godot_stage_sidecar_path(&root).unwrap();
        assert_eq!(resolved.executable, godot4);
        assert_eq!(resolved.mode, GodotStageLaunchMode::Engine);

        std::env::remove_var("GODOT4");
        let resolved = resolve_godot_stage_sidecar_path(&root).unwrap();
        assert_eq!(resolved.executable, bundled);
        assert_eq!(resolved.mode, GodotStageLaunchMode::Exported);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn godot_stage_start_degrades_when_binary_is_missing() {
        let _guard = env_lock().lock().unwrap();
        let root = unique_test_path("missing");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();
        std::env::remove_var("AIRI_GODOT_STAGE_PATH");
        std::env::remove_var("GODOT4");

        let controller = GodotStageController::new_for_tests(root.clone());
        let status = controller.start_blocking();

        assert_eq!(status.state, GodotStageState::Degraded);
        assert_eq!(status.pid, None);
        assert!(status
            .last_error
            .unwrap()
            .contains("Godot stage binary not found"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn godot_stage_status_serializes_camel_case_status_payload() {
        let status = GodotStageStatus {
            state: GodotStageState::Booting,
            pid: Some(42),
            last_error: Some("warming up".to_string()),
            updated_at: 123,
        };

        assert_eq!(
            serde_json::to_value(status).unwrap(),
            serde_json::json!({
                "state": "booting",
                "pid": 42,
                "lastError": "warming up",
                "updatedAt": 123,
            })
        );
    }

    #[test]
    fn godot_stage_status_transitions_without_real_godot_binary() {
        let _guard = env_lock().lock().unwrap();
        let root = unique_test_path("transitions");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();
        std::env::remove_var("GODOT4");

        let fake_stage = root.join("sidecars").join("godot-stage");
        write_fake_executable(&fake_stage);
        std::env::set_var("AIRI_GODOT_STAGE_PATH", &fake_stage);

        let controller = GodotStageController::new_for_tests(root.clone());
        assert_eq!(controller.status_blocking().state, GodotStageState::Stopped);

        let started = controller.start_blocking();
        assert_eq!(started.state, GodotStageState::Ready);
        assert!(started.pid.is_some());

        let stopped = controller.stop_blocking();
        assert_eq!(stopped.state, GodotStageState::Stopped);
        assert_eq!(stopped.pid, None);
        assert_eq!(controller.status_blocking().state, GodotStageState::Stopped);

        std::env::remove_var("AIRI_GODOT_STAGE_PATH");
        let _ = fs::remove_dir_all(&root);
    }
}
