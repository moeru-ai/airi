use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const MCP_CONFIG_FILE_NAME: &str = "mcp.json";
const TOOL_NAME_SEPARATOR: &str = "::";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpStdioServerConfig {
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpConfigFile {
    pub mcp_servers: HashMap<String, McpStdioServerConfig>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigText {
    pub path: String,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpOpenConfigFileResult {
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpApplyStarted {
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpApplyFailed {
    pub name: String,
    pub error: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpApplySkipped {
    pub name: String,
    pub reason: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStdioApplyResult {
    pub path: String,
    pub started: Vec<McpApplyStarted>,
    pub failed: Vec<McpApplyFailed>,
    pub skipped: Vec<McpApplySkipped>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRuntimeStatus {
    pub name: String,
    pub state: String,
    pub command: String,
    pub args: Vec<String>,
    pub pid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRuntimeStatus {
    pub path: String,
    pub servers: Vec<McpServerRuntimeStatus>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolDescriptor {
    pub server_name: String,
    pub name: String,
    pub tool_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub input_schema: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCallToolResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_content: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStdioTestResult {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<String>>,
    pub duration_ms: u64,
}

struct McpRuntimeState {
    children: HashMap<String, Child>,
    statuses: HashMap<String, McpServerRuntimeStatus>,
    updated_at: u64,
}

impl Default for McpRuntimeState {
    fn default() -> Self {
        Self {
            children: HashMap::new(),
            statuses: HashMap::new(),
            updated_at: now_ms(),
        }
    }
}

#[derive(Default)]
pub struct McpRuntimeManager {
    state: Mutex<McpRuntimeState>,
}

impl McpRuntimeManager {
    async fn set_status(&self, status: McpServerRuntimeStatus) {
        let mut state = self.state.lock().await;
        state.statuses.insert(status.name.clone(), status);
        state.updated_at = now_ms();
    }

    pub async fn stop_all(&self) {
        let children = {
            let mut state = self.state.lock().await;
            let children = std::mem::take(&mut state.children);
            for status in state.statuses.values_mut() {
                if status.state == "running" {
                    status.state = "stopped".to_string();
                    status.pid = None;
                    status.last_error = None;
                }
            }
            state.updated_at = now_ms();
            children
        };

        for (_, mut child) in children {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
    }

    async fn clear_runtime(&self) {
        let mut state = self.state.lock().await;
        state.children.clear();
        state.statuses.clear();
        state.updated_at = now_ms();
    }

    async fn start_server(&self, name: &str, config: &McpStdioServerConfig) -> Result<(), String> {
        let mut command = Command::new(&config.command);
        command.kill_on_drop(true);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        if let Some(args) = &config.args {
            command.args(args);
        }
        if let Some(env) = &config.env {
            command.envs(env);
        }
        if let Some(cwd) = &config.cwd {
            command.current_dir(cwd);
        }

        let child = command
            .spawn()
            .map_err(|error| format!("failed to start command {:?}: {error}", config.command))?;
        let pid = child.id();

        let mut state = self.state.lock().await;
        state.children.insert(name.to_string(), child);
        state.statuses.insert(
            name.to_string(),
            McpServerRuntimeStatus {
                name: name.to_string(),
                state: "running".to_string(),
                command: config.command.clone(),
                args: config.args.clone().unwrap_or_default(),
                pid,
                last_error: None,
            },
        );
        state.updated_at = now_ms();

        Ok(())
    }

    async fn apply_config(&self, path: String, config: &McpConfigFile) -> McpStdioApplyResult {
        self.stop_all().await;
        self.clear_runtime().await;

        let mut result = McpStdioApplyResult {
            path,
            started: Vec::new(),
            failed: Vec::new(),
            skipped: Vec::new(),
        };

        let mut entries: Vec<_> = config.mcp_servers.iter().collect();
        entries.sort_by(|(left, _), (right, _)| left.cmp(right));

        for (name, server) in entries {
            if server.enabled == Some(false) {
                result.skipped.push(McpApplySkipped {
                    name: name.clone(),
                    reason: "disabled".to_string(),
                });
                self.set_status(stopped_status(name, server)).await;
                continue;
            }

            match self.start_server(name, server).await {
                Ok(()) => result.started.push(McpApplyStarted { name: name.clone() }),
                Err(error) => {
                    result.failed.push(McpApplyFailed {
                        name: name.clone(),
                        error: error.clone(),
                    });
                    self.set_status(error_status(name, server, error)).await;
                }
            }
        }

        result
    }

    pub async fn status_for_config(
        &self,
        path: String,
        config: &McpConfigFile,
    ) -> McpRuntimeStatus {
        let mut state = self.state.lock().await;
        let child_names: Vec<_> = state.children.keys().cloned().collect();
        let mut exited_children = Vec::new();

        for name in child_names {
            let Some(child) = state.children.get_mut(&name) else {
                continue;
            };

            match child.try_wait() {
                Ok(Some(exit_status)) => exited_children.push((name, Ok(exit_status))),
                Ok(None) => {}
                Err(error) => exited_children.push((
                    name,
                    Err(format!("failed to refresh process status: {error}")),
                )),
            }
        }

        if !exited_children.is_empty() {
            for (name, exit_result) in exited_children {
                state.children.remove(&name);
                let Some(status) = state.statuses.get_mut(&name) else {
                    continue;
                };

                status.pid = None;
                match exit_result {
                    Ok(exit_status) if exit_status.success() => {
                        status.state = "stopped".to_string();
                        status.last_error = None;
                    }
                    Ok(exit_status) => {
                        status.state = "error".to_string();
                        status.last_error =
                            Some(format!("process exited unsuccessfully with {exit_status}"));
                    }
                    Err(error) => {
                        status.state = "error".to_string();
                        status.last_error = Some(error);
                    }
                }
            }
            state.updated_at = now_ms();
        }

        let mut servers: Vec<_> = config
            .mcp_servers
            .iter()
            .map(|(name, server)| {
                state
                    .statuses
                    .get(name)
                    .cloned()
                    .unwrap_or_else(|| stopped_status(name, server))
            })
            .collect();
        servers.sort_by(|left, right| left.name.cmp(&right.name));

        McpRuntimeStatus {
            path,
            servers,
            updated_at: state.updated_at,
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64)
}

pub fn mcp_config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(MCP_CONFIG_FILE_NAME)
}

pub fn default_mcp_config_text() -> String {
    serde_json::to_string_pretty(&McpConfigFile {
        mcp_servers: HashMap::new(),
    })
    .expect("default MCP config should serialize")
}

fn validate_server_config(name: &str, config: &McpStdioServerConfig) -> Result<(), String> {
    if config.command.trim().is_empty() {
        return Err(format!(
            "mcpServers.{name}.command: command must be a non-empty string"
        ));
    }

    Ok(())
}

pub fn parse_mcp_config_text(text: &str) -> Result<McpConfigFile, String> {
    let config: McpConfigFile =
        serde_json::from_str(text).map_err(|error| format!("invalid MCP config JSON: {error}"))?;

    for (name, server) in &config.mcp_servers {
        validate_server_config(name, server)?;
    }

    Ok(config)
}

pub async fn read_config_text_from_app_data_dir(
    app_data_dir: &Path,
) -> Result<McpConfigText, String> {
    tokio::fs::create_dir_all(app_data_dir)
        .await
        .map_err(|error| format!("failed to create MCP config directory: {error}"))?;

    let path = mcp_config_path(app_data_dir);
    let text = match tokio::fs::read_to_string(&path).await {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let text = default_mcp_config_text();
            tokio::fs::write(&path, &text)
                .await
                .map_err(|write_error| {
                    format!("failed to write default MCP config: {write_error}")
                })?;
            text
        }
        Err(error) => return Err(format!("failed to read MCP config: {error}")),
    };

    Ok(McpConfigText {
        path: path.display().to_string(),
        text,
    })
}

pub async fn write_config_text_to_app_data_dir(
    app_data_dir: &Path,
    text: &str,
) -> Result<McpConfigText, String> {
    let config = parse_mcp_config_text(text)?;
    let normalized = format!(
        "{}\n",
        serde_json::to_string_pretty(&config)
            .map_err(|error| format!("failed to serialize MCP config: {error}"))?
    );

    tokio::fs::create_dir_all(app_data_dir)
        .await
        .map_err(|error| format!("failed to create MCP config directory: {error}"))?;

    let path = mcp_config_path(app_data_dir);
    tokio::fs::write(&path, &normalized)
        .await
        .map_err(|error| format!("failed to write MCP config: {error}"))?;

    Ok(McpConfigText {
        path: path.display().to_string(),
        text: normalized,
    })
}

pub async fn read_config_file(app_data_dir: &Path) -> Result<McpConfigFile, String> {
    let config_text = read_config_text_from_app_data_dir(app_data_dir).await?;
    parse_mcp_config_text(&config_text.text)
}

pub async fn apply_and_restart_from_app_data_dir(
    app_data_dir: &Path,
    runtime: &McpRuntimeManager,
) -> Result<McpStdioApplyResult, String> {
    let config = read_config_file(app_data_dir).await?;
    let path = mcp_config_path(app_data_dir).display().to_string();
    Ok(runtime.apply_config(path, &config).await)
}

pub async fn runtime_status_from_app_data_dir(
    app_data_dir: &Path,
    runtime: &McpRuntimeManager,
) -> Result<McpRuntimeStatus, String> {
    let config = read_config_file(app_data_dir).await?;
    let path = mcp_config_path(app_data_dir).display().to_string();
    Ok(runtime.status_for_config(path, &config).await)
}

pub async fn list_tools_from_runtime(_runtime: &McpRuntimeManager) -> Vec<McpToolDescriptor> {
    Vec::new()
}

fn stopped_status(name: &str, server: &McpStdioServerConfig) -> McpServerRuntimeStatus {
    McpServerRuntimeStatus {
        name: name.to_string(),
        state: "stopped".to_string(),
        command: server.command.clone(),
        args: server.args.clone().unwrap_or_default(),
        pid: None,
        last_error: None,
    }
}

fn error_status(
    name: &str,
    server: &McpStdioServerConfig,
    error: String,
) -> McpServerRuntimeStatus {
    McpServerRuntimeStatus {
        name: name.to_string(),
        state: "error".to_string(),
        command: server.command.clone(),
        args: server.args.clone().unwrap_or_default(),
        pid: None,
        last_error: Some(error),
    }
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))
}

/// List tools from MCP servers.
///
/// The Tauri runtime starts and tracks configured servers, but the MCP protocol
/// handshake is not implemented yet. Returning an empty list keeps the renderer
/// bridge callable while runtime status exposes configured servers.
#[tauri::command]
pub async fn electron_mcp_list_tools(
    runtime: State<'_, McpRuntimeManager>,
) -> Result<Vec<McpToolDescriptor>, String> {
    Ok(list_tools_from_runtime(runtime.inner()).await)
}

/// Call a tool on an MCP server.
#[tauri::command]
pub async fn electron_mcp_call_tool(
    name: Option<String>,
    arguments: Option<Value>,
) -> McpCallToolResult {
    let _ = arguments;
    let requested_name = name.unwrap_or_else(|| "<missing>".to_string());
    McpCallToolResult {
        content: Some(vec![serde_json::json!({
            "type": "text",
            "text": format!(
                "MCP tool call for {requested_name:?} is unavailable until the Tauri MCP protocol handshake is implemented. Use list-tools to refresh the current empty catalog."
            ),
        })]),
        structured_content: None,
        tool_result: None,
        is_error: Some(true),
    }
}

/// Get runtime status of MCP servers.
#[tauri::command]
pub async fn electron_mcp_get_runtime_status(
    app: AppHandle,
    runtime: State<'_, McpRuntimeManager>,
) -> Result<McpRuntimeStatus, String> {
    runtime_status_from_app_data_dir(&app_data_dir(&app)?, runtime.inner()).await
}

/// Apply config and restart MCP stdio server processes.
#[tauri::command]
pub async fn electron_mcp_apply_and_restart(
    app: AppHandle,
    runtime: State<'_, McpRuntimeManager>,
) -> Result<McpStdioApplyResult, String> {
    apply_and_restart_from_app_data_dir(&app_data_dir(&app)?, runtime.inner()).await
}

/// Read MCP config file as text.
#[tauri::command]
pub async fn electron_mcp_read_config_text(app: AppHandle) -> Result<McpConfigText, String> {
    read_config_text_from_app_data_dir(&app_data_dir(&app)?).await
}

/// Write MCP config file.
#[tauri::command]
pub async fn electron_mcp_write_config_text(
    app: AppHandle,
    text: String,
) -> Result<McpConfigText, String> {
    write_config_text_to_app_data_dir(&app_data_dir(&app)?, &text).await
}

/// Test whether a server command can be spawned. Full MCP handshaking is a follow-up.
#[tauri::command]
pub async fn electron_mcp_test_server(
    name: Option<String>,
    config: Option<McpStdioServerConfig>,
) -> McpStdioTestResult {
    let started_at = now_ms();
    let name = name.unwrap_or_else(|| "server".to_string());
    let Some(config) = config else {
        return McpStdioTestResult {
            ok: false,
            error: Some("missing MCP server config".to_string()),
            tools: None,
            duration_ms: now_ms().saturating_sub(started_at),
        };
    };

    if let Err(error) = validate_server_config(&name, &config) {
        return McpStdioTestResult {
            ok: false,
            error: Some(error),
            tools: None,
            duration_ms: now_ms().saturating_sub(started_at),
        };
    }

    let runtime = McpRuntimeManager::default();
    match runtime.start_server(&name, &config).await {
        Ok(()) => {
            runtime.stop_all().await;
            McpStdioTestResult {
                ok: true,
                error: None,
                tools: Some(Vec::new()),
                duration_ms: now_ms().saturating_sub(started_at),
            }
        }
        Err(error) => McpStdioTestResult {
            ok: false,
            error: Some(error),
            tools: None,
            duration_ms: now_ms().saturating_sub(started_at),
        },
    }
}

/// Open MCP config file in editor.
#[tauri::command]
pub async fn electron_mcp_open_config_file(
    app: AppHandle,
) -> Result<McpOpenConfigFileResult, String> {
    let config = read_config_text_from_app_data_dir(&app_data_dir(&app)?).await?;
    Ok(McpOpenConfigFileResult { path: config.path })
}

#[allow(dead_code)]
fn parse_qualified_tool_name(name: &str) -> Result<(&str, &str), String> {
    let Some(separator_index) = name.find(TOOL_NAME_SEPARATOR) else {
        return Err(format!("invalid qualified tool name: {name}"));
    };
    if separator_index == 0 || separator_index + TOOL_NAME_SEPARATOR.len() >= name.len() {
        return Err(format!("invalid qualified tool name: {name}"));
    }

    Ok((
        &name[..separator_index],
        &name[separator_index + TOOL_NAME_SEPARATOR.len()..],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::fs;
    use std::path::PathBuf;
    use std::time::Duration;

    const SHELL_ENV: &str = "SHELL";
    const TEST_ENV_KEY: &str = "A";
    const TEST_ENV_VALUE: &str = "B";

    fn unique_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("airi-tauri-mcp-{name}-{nanos}"))
    }

    #[cfg(windows)]
    fn test_shell_command(script: &str) -> (String, Vec<String>) {
        (
            "cmd".to_string(),
            vec!["/C".to_string(), script.to_string()],
        )
    }

    #[cfg(not(windows))]
    fn test_shell_command(script: &str) -> (String, Vec<String>) {
        (
            std::env::var(SHELL_ENV).unwrap_or_else(|_| "/bin/sh".to_string()),
            vec!["-c".to_string(), script.to_string()],
        )
    }

    #[cfg(windows)]
    fn long_running_test_command() -> (String, Vec<String>) {
        test_shell_command("ping -n 31 127.0.0.1 > NUL")
    }

    #[cfg(not(windows))]
    fn long_running_test_command() -> (String, Vec<String>) {
        test_shell_command("sleep 30")
    }

    fn immediately_successful_test_command() -> (String, Vec<String>) {
        test_shell_command("exit 0")
    }

    #[test]
    fn builds_default_config_path_and_text_under_app_data_dir() {
        let app_data_dir = unique_test_dir("default-config");

        assert_eq!(
            mcp_config_path(&app_data_dir),
            app_data_dir.join("mcp.json")
        );
        assert_eq!(default_mcp_config_text(), "{\n  \"mcpServers\": {}\n}");
    }

    #[test]
    fn parses_disabled_and_enabled_servers_from_mcp_servers() {
        let cwd = unique_test_dir("parse-cwd").display().to_string();
        let cwd_json = serde_json::to_string(&cwd).expect("cwd should serialize");

        let config = parse_mcp_config_text(&format!(
            r#"{{
              "mcpServers": {{
                "disabled": {{ "command": "node", "args": ["server.js"], "enabled": false }},
                "enabled": {{ "command": "python", "args": ["-m", "example"], "env": {{ "{TEST_ENV_KEY}": "{TEST_ENV_VALUE}" }}, "cwd": {cwd_json} }}
              }}
            }}"#,
        ))
        .expect("valid config should parse");

        assert_eq!(config.mcp_servers["disabled"].enabled, Some(false));
        assert_eq!(config.mcp_servers["enabled"].command, "python");
        assert_eq!(
            config.mcp_servers["enabled"].args.as_deref(),
            Some(&["-m".to_string(), "example".to_string()][..]),
        );
        assert_eq!(
            config.mcp_servers["enabled"]
                .env
                .as_ref()
                .and_then(|env| env.get(TEST_ENV_KEY)),
            Some(&TEST_ENV_VALUE.to_string()),
        );
        assert_eq!(
            config.mcp_servers["enabled"].cwd.as_deref(),
            Some(cwd.as_str())
        );
    }

    #[tokio::test]
    async fn reads_and_writes_config_text_at_default_path() {
        let app_data_dir = unique_test_dir("read-write");

        let initial = read_config_text_from_app_data_dir(&app_data_dir)
            .await
            .expect("default config should be created");
        assert_eq!(
            initial.path,
            app_data_dir.join("mcp.json").display().to_string()
        );
        assert_eq!(initial.text, default_mcp_config_text());

        let written = write_config_text_to_app_data_dir(
            &app_data_dir,
            r#"{"mcpServers":{"alpha":{"command":"node","args":["server.js"]}}}"#,
        )
        .await
        .expect("valid config should write");

        assert_eq!(written.path, initial.path);
        assert_eq!(
            written.text,
            "{\n  \"mcpServers\": {\n    \"alpha\": {\n      \"command\": \"node\",\n      \"args\": [\n        \"server.js\"\n      ]\n    }\n  }\n}\n",
        );

        fs::remove_dir_all(&app_data_dir).expect("test dir should clean up");
    }

    #[tokio::test]
    async fn apply_and_restart_records_started_failed_and_skipped_servers() {
        let app_data_dir = unique_test_dir("apply");
        let (command, args) = long_running_test_command();
        let command_json = serde_json::to_string(&command).expect("command should serialize");
        let args_json = serde_json::to_string(&args).expect("args should serialize");
        fs::create_dir_all(&app_data_dir).expect("test dir should be created");
        fs::write(
            mcp_config_path(&app_data_dir),
            format!(
                r#"{{
                  "mcpServers": {{
                    "started": {{ "command": {command_json}, "args": {args_json} }},
                    "failed": {{ "command": "__airi_missing_mcp_command__" }},
                    "skipped": {{ "command": {command_json}, "enabled": false }}
                  }}
                }}"#,
            ),
        )
        .expect("config should be written");

        let runtime = McpRuntimeManager::default();
        let result = apply_and_restart_from_app_data_dir(&app_data_dir, &runtime)
            .await
            .expect("apply should produce per-server results instead of throwing");

        assert_eq!(
            result.path,
            app_data_dir.join("mcp.json").display().to_string()
        );
        assert_eq!(
            result.started,
            vec![McpApplyStarted {
                name: "started".into()
            }]
        );
        assert_eq!(
            result.skipped,
            vec![McpApplySkipped {
                name: "skipped".into(),
                reason: "disabled".into(),
            }],
        );
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].name, "failed");
        assert!(result.failed[0]
            .error
            .contains("__airi_missing_mcp_command__"));

        let status = runtime
            .status_for_config(
                app_data_dir.join("mcp.json").display().to_string(),
                &read_config_file(&app_data_dir).await.unwrap(),
            )
            .await;
        assert_eq!(status.servers.len(), 3);
        assert_eq!(
            status
                .servers
                .iter()
                .find(|server| server.name == "started")
                .unwrap()
                .state,
            "running",
        );
        assert_eq!(
            status
                .servers
                .iter()
                .find(|server| server.name == "failed")
                .unwrap()
                .state,
            "error",
        );
        assert_eq!(
            status
                .servers
                .iter()
                .find(|server| server.name == "skipped")
                .unwrap()
                .state,
            "stopped",
        );

        runtime.stop_all().await;
        fs::remove_dir_all(&app_data_dir).expect("test dir should clean up");
    }

    #[tokio::test]
    async fn status_for_config_reaps_immediately_exited_successful_child() {
        let (command, args) = immediately_successful_test_command();
        let mut mcp_servers = HashMap::new();
        mcp_servers.insert(
            "quick".to_string(),
            McpStdioServerConfig {
                command,
                args: Some(args),
                env: None,
                cwd: None,
                enabled: None,
            },
        );
        let config = McpConfigFile { mcp_servers };
        let runtime = McpRuntimeManager::default();

        runtime
            .start_server("quick", &config.mcp_servers["quick"])
            .await
            .expect("quick command should start");

        let mut status = runtime
            .status_for_config("mcp.json".to_string(), &config)
            .await;
        for _ in 0..20 {
            if status.servers[0].state != "running" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
            status = runtime
                .status_for_config("mcp.json".to_string(), &config)
                .await;
        }

        let quick = &status.servers[0];
        assert_eq!(quick.name, "quick");
        assert_eq!(quick.state, "stopped");
        assert_eq!(quick.pid, None);
        assert_eq!(quick.last_error, None);

        let state = runtime.state.lock().await;
        assert!(!state.children.contains_key("quick"));
    }

    #[tokio::test]
    async fn runtime_status_includes_configured_servers_without_protocol_handshake() {
        let app_data_dir = unique_test_dir("status");
        fs::create_dir_all(&app_data_dir).expect("test dir should be created");
        fs::write(
            mcp_config_path(&app_data_dir),
            r#"{"mcpServers":{"alpha":{"command":"node"},"beta":{"command":"python","enabled":false}}}"#,
        )
        .expect("config should be written");

        let runtime = McpRuntimeManager::default();
        let status = runtime_status_from_app_data_dir(&app_data_dir, &runtime)
            .await
            .expect("status should include configured servers");

        assert_eq!(
            status.path,
            app_data_dir.join("mcp.json").display().to_string()
        );
        assert_eq!(status.servers.len(), 2);
        assert_eq!(status.servers[0].name, "alpha");
        assert_eq!(status.servers[0].state, "stopped");
        assert_eq!(status.servers[0].command, "node");
        assert_eq!(status.servers[0].args, Vec::<String>::new());
        assert_eq!(status.servers[0].pid, None);
        assert_eq!(status.servers[1].name, "beta");
        assert_eq!(status.servers[1].state, "stopped");

        let tools = list_tools_from_runtime(&runtime).await;
        assert!(tools.is_empty());

        fs::remove_dir_all(&app_data_dir).expect("test dir should clean up");
    }
}
