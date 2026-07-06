use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const PLUGIN_HOST_ENV: &str = "AIRI_PLUGIN_HOST_PATH";
const PLUGIN_HOST_HEALTH_HOST: &str = "127.0.0.1";
const PLUGIN_HOST_HEALTH_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginHostSidecarStatus {
    pub state: PluginHostSidecarState,
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PluginHostSidecarState {
    Stopped,
    Booting,
    Ready,
    Degraded,
}

impl PluginHostSidecarState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Booting => "booting",
            Self::Ready => "ready",
            Self::Degraded => "degraded",
        }
    }
}

impl Default for PluginHostSidecarStatus {
    fn default() -> Self {
        Self {
            state: PluginHostSidecarState::Stopped,
            pid: None,
            endpoint: None,
            executable_path: None,
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }
}

impl PluginHostSidecarStatus {
    fn booting(endpoint: String, executable_path: String) -> Self {
        Self {
            state: PluginHostSidecarState::Booting,
            pid: None,
            endpoint: Some(endpoint),
            executable_path: Some(executable_path),
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }

    fn ready(pid: u32, endpoint: String, executable_path: String) -> Self {
        Self {
            state: PluginHostSidecarState::Ready,
            pid: Some(pid),
            endpoint: Some(endpoint),
            executable_path: Some(executable_path),
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }

    fn degraded(message: impl Into<String>) -> Self {
        Self {
            state: PluginHostSidecarState::Degraded,
            pid: None,
            endpoint: None,
            executable_path: None,
            last_error: Some(message.into()),
            updated_at: current_timestamp_ms(),
        }
    }

    fn stopped() -> Self {
        Self::default()
    }
}

#[derive(Debug)]
struct PluginHostSidecarLaunch {
    executable: PathBuf,
    args: Vec<String>,
    endpoint: String,
    host: String,
    port: u16,
}

pub struct PluginHostSidecarController {
    app_data_dir: PathBuf,
    inner: Mutex<PluginHostSidecarControllerInner>,
}

struct PluginHostSidecarControllerInner {
    child: Option<Child>,
    status: PluginHostSidecarStatus,
}

impl PluginHostSidecarController {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            app_data_dir,
            inner: Mutex::new(PluginHostSidecarControllerInner {
                child: None,
                status: PluginHostSidecarStatus::default(),
            }),
        }
    }

    pub fn start_blocking(&self) -> PluginHostSidecarStatus {
        let mut inner = self.inner.lock().unwrap();
        inner.refresh_child_status();

        if matches!(
            inner.status.state,
            PluginHostSidecarState::Ready | PluginHostSidecarState::Booting
        ) && inner.child.is_some()
        {
            return inner.status.clone();
        }

        let Some(executable) = resolve_plugin_host_sidecar_path(&self.app_data_dir) else {
            inner.child = None;
            inner.status = PluginHostSidecarStatus::degraded(format!(
                "Plugin host sidecar binary not found. Set {PLUGIN_HOST_ENV} or place plugin-host under {}.",
                self.app_data_dir.join("sidecars").display()
            ));
            return inner.status.clone();
        };

        let port = match allocate_local_port() {
            Ok(port) => port,
            Err(error) => {
                inner.child = None;
                inner.status = PluginHostSidecarStatus::degraded(error);
                return inner.status.clone();
            }
        };

        let launch = build_plugin_host_launch(&self.app_data_dir, executable, port);
        inner.status = PluginHostSidecarStatus::booting(
            launch.endpoint.clone(),
            launch.executable.to_string_lossy().to_string(),
        );

        match spawn_plugin_host_sidecar(&launch) {
            Ok(mut child) => match probe_plugin_host_health(
                &launch.host,
                launch.port,
                PLUGIN_HOST_HEALTH_TIMEOUT,
            ) {
                Ok(()) => {
                    let pid = child.id();
                    inner.child = Some(child);
                    inner.status = PluginHostSidecarStatus::ready(
                        pid,
                        launch.endpoint,
                        launch.executable.to_string_lossy().to_string(),
                    );
                }
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    inner.child = None;
                    inner.status = PluginHostSidecarStatus::degraded(format!(
                        "Plugin host sidecar health check failed at {}: {error}",
                        launch.endpoint
                    ));
                }
            },
            Err(error) => {
                inner.child = None;
                inner.status = PluginHostSidecarStatus::degraded(error);
            }
        }

        inner.status.clone()
    }

    pub fn stop_blocking(&self) -> PluginHostSidecarStatus {
        let mut inner = self.inner.lock().unwrap();
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        inner.status = PluginHostSidecarStatus::stopped();
        inner.status.clone()
    }

    pub fn status_blocking(&self) -> PluginHostSidecarStatus {
        let mut inner = self.inner.lock().unwrap();
        inner.refresh_child_status();
        inner.status.clone()
    }
}

impl PluginHostSidecarControllerInner {
    fn refresh_child_status(&mut self) {
        let Some(child) = self.child.as_mut() else {
            if matches!(
                self.status.state,
                PluginHostSidecarState::Ready | PluginHostSidecarState::Booting
            ) {
                self.status = PluginHostSidecarStatus::stopped();
            }
            return;
        };

        match child.try_wait() {
            Ok(Some(exit_status)) => {
                self.child = None;
                self.status = PluginHostSidecarStatus::degraded(format!(
                    "Plugin host sidecar exited unexpectedly with status {exit_status}."
                ));
            }
            Ok(None) => {}
            Err(error) => {
                self.child = None;
                self.status = PluginHostSidecarStatus::degraded(format!(
                    "Failed to check plugin host sidecar health: {error}"
                ));
            }
        }
    }
}

impl Drop for PluginHostSidecarController {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(mut child) = inner.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

pub fn resolve_plugin_host_sidecar_path(app_data_dir: &Path) -> Option<PathBuf> {
    // Override: allow AIRI_PLUGIN_HOST_PATH env for dev bootstrapping when the pkg-compiled
    // binary was placed outside the default app-data location. Takes precedence over the
    // default path so developers can point the runtime at an in-repo build artifact.
    if let Ok(override_path) = std::env::var(PLUGIN_HOST_ENV) {
        let override_path = PathBuf::from(override_path);
        if override_path.exists() && override_path.is_file() {
            return Some(override_path);
        }
    }

    let candidate = app_data_dir.join("sidecars").join(executable_name());
    if candidate.exists() && candidate.is_file() {
        return Some(candidate);
    }

    None
}

fn executable_name() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            return "plugin-host-aarch64-apple-darwin";
        }
        return "plugin-host-x86_64-apple-darwin";
    }
    if cfg!(windows) {
        return "plugin-host.exe";
    }
    "plugin-host-x86_64-unknown-linux-gnu"
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn allocate_local_port() -> Result<u16, String> {
    let listener = TcpListener::bind((PLUGIN_HOST_HEALTH_HOST, 0))
        .map_err(|error| format!("allocate plugin host sidecar port: {error}"))?;
    listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|error| format!("read plugin host sidecar port: {error}"))
}

fn build_plugin_host_launch(
    app_data_dir: &Path,
    executable: PathBuf,
    port: u16,
) -> PluginHostSidecarLaunch {
    let host = PLUGIN_HOST_HEALTH_HOST.to_string();
    let endpoint = format!("http://{host}:{port}");
    PluginHostSidecarLaunch {
        executable,
        args: vec![
            format!(
                "--airi-plugin-root={}",
                app_data_dir.join("plugins").display()
            ),
            format!(
                "--airi-config-path={}",
                app_data_dir.join("plugins-v1.json").display()
            ),
            format!("--airi-host={host}"),
            format!("--airi-port={port}"),
        ],
        endpoint,
        host,
        port,
    }
}

fn spawn_plugin_host_sidecar(launch: &PluginHostSidecarLaunch) -> Result<Child, String> {
    Command::new(&launch.executable)
        .args(&launch.args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to spawn plugin host sidecar at {}: {error}",
                launch.executable.display()
            )
        })
}

fn probe_plugin_host_health(host: &str, port: u16, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    let mut last_connect_error = None;

    while Instant::now() < deadline {
        match TcpStream::connect((host, port)) {
            Ok(mut stream) => {
                let _ = stream.set_read_timeout(Some(timeout));
                let _ = stream.set_write_timeout(Some(timeout));
                stream
                    .write_all(
                        format!(
                            "GET /health HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"
                        )
                        .as_bytes(),
                    )
                    .map_err(|error| format!("write health request: {error}"))?;

                let mut buffer = [0_u8; 1024];
                let bytes = stream
                    .read(&mut buffer)
                    .map_err(|error| format!("read health response: {error}"))?;
                let response = String::from_utf8_lossy(&buffer[..bytes]);
                let status_line = response.lines().next().unwrap_or_default().trim();
                if status_line.starts_with("HTTP/1.1 200")
                    || status_line.starts_with("HTTP/1.0 200")
                {
                    return Ok(());
                }

                return Err(format!("unexpected health status `{status_line}`"));
            }
            Err(error) => {
                last_connect_error = Some(error.to_string());
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }

    Err(format!(
        "timed out waiting for plugin host health at http://{host}:{port}/health{}",
        last_connect_error
            .map(|error| format!("; last connection error: {error}"))
            .unwrap_or_default()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};
    use std::thread;

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn unique_sidecar_test_dir(name: &str) -> PathBuf {
        let elapsed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time");
        std::env::temp_dir().join(format!(
            "airi-plugin-host-sidecar-{name}-{}-{}",
            std::process::id(),
            elapsed.as_nanos(),
        ))
    }

    #[cfg(unix)]
    fn write_fake_executable(path: &Path, body: &str) {
        fs::write(path, body).unwrap();
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).unwrap();
    }

    #[test]
    fn returns_none_when_missing() {
        let _guard = env_lock().lock().unwrap();
        let root =
            std::env::temp_dir().join(format!("airi-sidecar-missing-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();
        // Leverage env var to confirm it is respected only when set — missing target falls through.
        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");

        assert_eq!(resolve_plugin_host_sidecar_path(&root), None);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolves_present_binary() {
        let _guard = env_lock().lock().unwrap();
        let root =
            std::env::temp_dir().join(format!("airi-sidecar-present-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();
        let sidecar = root.join("sidecars").join(executable_name());
        fs::write(&sidecar, b"fake-binary").unwrap();
        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");

        assert_eq!(resolve_plugin_host_sidecar_path(&root), Some(sidecar));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn env_override_takes_precedence() {
        let _guard = env_lock().lock().unwrap();
        let root = std::env::temp_dir().join(format!("airi-sidecar-env-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();
        // Defensive: ensure env from another test didn't leak.
        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");

        let override_path =
            std::env::temp_dir().join(format!("airi-plugin-host-override-{}", std::process::id()));
        let _ = fs::remove_file(&override_path);
        fs::write(&override_path, b"custom-binary").unwrap();

        std::env::set_var("AIRI_PLUGIN_HOST_PATH", &override_path);
        let actual = resolve_plugin_host_sidecar_path(&root);
        assert_eq!(actual, Some(override_path.clone()));

        let sidecar_in_default = root.join("sidecars").join(executable_name());
        fs::write(&sidecar_in_default, b"default-binary").unwrap();

        // Make sure ovveride still wins when default candidate exists.
        assert_eq!(
            resolve_plugin_host_sidecar_path(&root),
            Some(override_path.clone())
        );

        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");

        assert_eq!(
            resolve_plugin_host_sidecar_path(&root),
            Some(sidecar_in_default)
        );

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&override_path);
    }

    #[test]
    fn plugin_host_sidecar_status_serializes_camel_case_payload() {
        let status = PluginHostSidecarStatus {
            state: PluginHostSidecarState::Ready,
            pid: Some(42),
            endpoint: Some("http://127.0.0.1:49152".to_string()),
            executable_path: Some("/tmp/plugin-host".to_string()),
            last_error: None,
            updated_at: 123,
        };

        assert_eq!(
            serde_json::to_value(status).unwrap(),
            serde_json::json!({
                "state": "ready",
                "pid": 42,
                "endpoint": "http://127.0.0.1:49152",
                "executablePath": "/tmp/plugin-host",
                "updatedAt": 123,
            })
        );
    }

    #[test]
    fn build_plugin_host_launch_uses_plugin_root_config_path_host_and_port() {
        let root = unique_sidecar_test_dir("launch");
        let executable = root.join("plugin-host");
        fs::create_dir_all(root.join("sidecars")).unwrap();
        fs::write(&executable, b"fake").unwrap();

        let launch = build_plugin_host_launch(&root, executable.clone(), 49152);

        assert_eq!(launch.executable, executable);
        assert_eq!(launch.endpoint, "http://127.0.0.1:49152");
        assert_eq!(
            launch.args,
            vec![
                format!("--airi-plugin-root={}", root.join("plugins").display()),
                format!(
                    "--airi-config-path={}",
                    root.join("plugins-v1.json").display()
                ),
                "--airi-host=127.0.0.1".to_string(),
                "--airi-port=49152".to_string(),
            ]
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn plugin_host_health_probe_accepts_http_200() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 512];
            let _ = stream.read(&mut buffer).unwrap();
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .unwrap();
        });

        assert!(
            probe_plugin_host_health("127.0.0.1", port, std::time::Duration::from_secs(1)).is_ok()
        );
        handle.join().unwrap();
    }

    #[test]
    fn plugin_host_health_probe_rejects_non_200() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 512];
            let _ = stream.read(&mut buffer).unwrap();
            stream
                .write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .unwrap();
        });

        let error = probe_plugin_host_health("127.0.0.1", port, std::time::Duration::from_secs(1))
            .expect_err("non-200 health response should fail");
        assert!(error.contains("status"));
        handle.join().unwrap();
    }

    #[test]
    fn plugin_host_start_degrades_when_binary_is_missing() {
        let _guard = env_lock().lock().unwrap();
        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");
        let root = unique_sidecar_test_dir("missing");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();

        let controller = PluginHostSidecarController::new(root.clone());
        let status = controller.start_blocking();

        assert_eq!(status.state, PluginHostSidecarState::Degraded);
        assert_eq!(status.pid, None);
        assert!(status.last_error.unwrap().contains("AIRI_PLUGIN_HOST_PATH"));

        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn plugin_host_start_ready_then_stop_with_fake_node_health_server() {
        let _guard = env_lock().lock().unwrap();
        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");
        let root = unique_sidecar_test_dir("ready");
        let sidecars = root.join("sidecars");
        fs::create_dir_all(&sidecars).unwrap();

        let executable = sidecars.join("plugin-host-test");
        write_fake_executable(
            &executable,
            r#"#!/bin/sh
PORT=""
for arg in "$@"; do
  case "$arg" in
    --airi-port=*) PORT="${arg#--airi-port=}" ;;
  esac
done
exec node -e 'const http = require("node:http"); const port = Number(process.argv[1]); const server = http.createServer((req, res) => { if (req.url === "/health") { res.writeHead(200, {"content-type":"application/json"}); res.end("{\"ok\":true}"); } else { res.writeHead(404); res.end(""); } }); server.listen(port, "127.0.0.1"); setInterval(() => {}, 1000);' "$PORT"
"#,
        );

        std::env::set_var("AIRI_PLUGIN_HOST_PATH", &executable);
        let controller = PluginHostSidecarController::new(root.clone());

        let started = controller.start_blocking();
        assert_eq!(started.state, PluginHostSidecarState::Ready);
        assert!(started.pid.is_some());
        let expected_executable = executable.to_string_lossy().to_string();
        assert_eq!(
            started.executable_path.as_deref(),
            Some(expected_executable.as_str())
        );
        assert!(started
            .endpoint
            .as_deref()
            .unwrap()
            .starts_with("http://127.0.0.1:"));

        let stopped = controller.stop_blocking();
        assert_eq!(stopped.state, PluginHostSidecarState::Stopped);
        assert_eq!(stopped.pid, None);

        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");
        let _ = fs::remove_dir_all(&root);
    }
}
