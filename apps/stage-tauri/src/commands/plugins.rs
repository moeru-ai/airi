use crate::commands::plugin_host::config;
use crate::commands::plugin_host::config::{
    disable_plugin, enable_plugin, mark_plugin_known, set_auto_reload,
};
use crate::commands::plugin_host::manifests;
use crate::commands::sidecar::{
    PluginHostSidecarController, PluginHostSidecarState, PluginHostSidecarStatus,
};

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifestSummary {
    pub name: String,
    pub entrypoints: HashMap<String, Option<String>>,
    pub path: String,
    pub enabled: bool,
    pub auto_reload: bool,
    pub loaded: bool,
    pub is_new: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRegistrySnapshot {
    pub root: String,
    pub plugins: Vec<PluginManifestSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCapabilityState {
    pub key: String,
    pub state: String,
    pub metadata: Option<Value>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginHostStateInner {
    pub capabilities: HashMap<String, PluginCapabilityState>,
}

#[derive(Clone, Default)]
pub struct PluginHostState {
    inner: Arc<Mutex<PluginHostStateInner>>,
}

impl PluginHostState {
    pub fn update_capability(
        &self,
        key: String,
        state: String,
        metadata: Option<Value>,
        updated_at: u64,
    ) {
        let mut guard = self.inner.lock().expect("plugin host capability lock poisoned");
        guard.capabilities.insert(
            key.clone(),
            PluginCapabilityState {
                key,
                state,
                metadata,
                updated_at,
            },
        );
    }

    pub fn snapshot(&self) -> PluginHostStateInner {
        self.inner.lock().expect("plugin host capability lock poisoned").clone()
    }
}

pub fn plugin_config_path(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    app_data_dir.join("plugins-v1.json")
}

pub fn plugin_root_path(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    app_data_dir.join("plugins")
}

pub async fn build_registry_snapshot(
    app_handle: &AppHandle,
    _state: &PluginHostState,
) -> PluginRegistrySnapshot {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let root = plugin_root_path(&app_data);
    let config_path = plugin_config_path(&app_data);
    let mut config = config::read_plugin_config(&config_path);
    let result = manifests::scan_plugin_root(&root);
    let mut plugins = Vec::with_capacity(result.manifests.len());
    let mut config_changed = false;
    for manifest in &result.manifests {
        let known = config.known.get(&manifest.name);
        let known_path = known.map(|k| k.path.clone());
        let is_new = known.is_none();
        if known_path.as_deref() != Some(&manifest.path) {
            config.known.entry(manifest.name.clone()).or_insert_with(|| config::PluginKnownEntry {
                path: manifest.path.clone(),
            });
            config_changed = true;
        }
        plugins.push(PluginManifestSummary {
            name: manifest.name.clone(),
            entrypoints: entrypoints_to_map(&manifest.entrypoints),
            path: manifest.path.clone(),
            enabled: config.enabled.iter().any(|n| n == &manifest.name),
            auto_reload: config.auto_reload.iter().any(|n| n == &manifest.name),
            loaded: false,
            is_new,
        });
    }

    for (name, entry) in &config.known {
        if !plugins.iter().any(|p| &p.name == name) {
            plugins.push(PluginManifestSummary {
                name: name.clone(),
                entrypoints: HashMap::default(),
                path: entry.path.clone(),
                enabled: config.enabled.iter().any(|n| n == name),
                auto_reload: config.auto_reload.iter().any(|n| n == name),
                loaded: false,
                is_new: false,
            });
        }
    }

    if config_changed {
        let _ = config::write_plugin_config_locked(&config_path, &config);
    }

    plugins.sort_by(|a, b| a.name.cmp(&b.name));

    PluginRegistrySnapshot {
        root: root.to_string_lossy().to_string(),
        plugins,
    }
}

fn entrypoints_to_map(entrypoints: &manifests::RawEntrypoints) -> HashMap<String, Option<String>> {
    let mut map = HashMap::new();
    map.insert("default".to_string(), entrypoints.default.clone());
    map.insert("electron".to_string(), entrypoints.electron.clone());
    map.insert("node".to_string(), entrypoints.node.clone());
    map.insert("web".to_string(), entrypoints.web.clone());
    map
}

#[allow(dead_code)]
fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_millis() as u64
}

fn sidecar_capability_state(status: &PluginHostSidecarStatus) -> &'static str {
    match status.state {
        PluginHostSidecarState::Stopped => "withdrawn",
        PluginHostSidecarState::Booting => "announced",
        PluginHostSidecarState::Ready => "ready",
        PluginHostSidecarState::Degraded => "degraded",
    }
}

fn update_sidecar_capability(state: &PluginHostState, status: &PluginHostSidecarStatus) {
    state.update_capability(
        "plugin-host:sidecar".to_string(),
        sidecar_capability_state(status).to_string(),
        Some(serde_json::json!({
            "state": status.state.as_str(),
            "pid": status.pid,
            "endpoint": status.endpoint,
            "executablePath": status.executable_path,
            "lastError": status.last_error,
            "updatedAt": status.updated_at,
        })),
        now_millis(),
    );
}

fn update_plugin_load_request_capability(
    state: &PluginHostState,
    name: &str,
    sidecar_status: &PluginHostSidecarStatus,
) {
    state.update_capability(
        format!("plugin-host:plugin:{name}"),
        "degraded".to_string(),
        Some(serde_json::json!({
            "name": name,
            "reason": "plugin session loading requires the sidecar load API",
            "sidecar": sidecar_status,
        })),
        now_millis(),
    );
}

/// List plugins
#[tauri::command]
pub async fn electron_plugins_list(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
) -> Result<PluginRegistrySnapshot, String> {
    Ok(build_registry_snapshot(&app_handle, &state).await)
}

/// Set plugin enabled state
#[tauri::command]
pub async fn electron_plugins_set_enabled(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    name: Option<String>,
    enabled: bool,
    path: Option<String>,
) -> Result<PluginRegistrySnapshot, String> {
    let Some(name) = name.filter(|n| !n.trim().is_empty()) else {
        return Err("plugin name is required".to_string());
    };

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    let config_path = plugin_config_path(&app_data);

    let updated = if enabled {
        enable_plugin(&config_path, &name)
    } else {
        disable_plugin(&config_path, &name)
    }
    .map_err(|e| format!("update plugin config: {e}"))?;

    if let Some(path) = path {
        let _ = mark_plugin_known(&config_path, &name, &path);
    }

    let _ = updated;
    Ok(build_registry_snapshot(&app_handle, &state).await)
}

/// Set plugin auto-reload
#[tauri::command]
pub async fn electron_plugins_set_auto_reload(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    name: Option<String>,
    enabled: bool,
) -> Result<PluginRegistrySnapshot, String> {
    let Some(name) = name.filter(|n| !n.trim().is_empty()) else {
        return Err("plugin name is required".to_string());
    };

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    let config_path = plugin_config_path(&app_data);

    set_auto_reload(&config_path, &name, enabled).map_err(|e| format!("update auto-reload: {e}"))?;

    Ok(build_registry_snapshot(&app_handle, &state).await)
}

/// Load all enabled plugins by starting the plugin-host sidecar when available.
#[tauri::command]
pub async fn electron_plugins_load_enabled(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    sidecar: State<'_, PluginHostSidecarController>,
) -> Result<PluginRegistrySnapshot, String> {
    let sidecar_status = sidecar.start_blocking();
    update_sidecar_capability(&state, &sidecar_status);

    Ok(build_registry_snapshot(&app_handle, &state).await)
}

/// Load a specific plugin by starting the plugin-host sidecar when available.
#[tauri::command]
pub async fn electron_plugins_load(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    sidecar: State<'_, PluginHostSidecarController>,
    name: Option<String>,
) -> Result<PluginRegistrySnapshot, String> {
    let Some(name) = name.filter(|n| !n.trim().is_empty()) else {
        return Err("plugin name is required".to_string());
    };

    let sidecar_status = sidecar.start_blocking();
    update_sidecar_capability(&state, &sidecar_status);
    update_plugin_load_request_capability(&state, &name, &sidecar_status);

    Ok(build_registry_snapshot(&app_handle, &state).await)
}

/// Unload a specific plugin — degraded stub
#[tauri::command]
pub async fn electron_plugins_unload(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    name: Option<String>,
) -> Result<PluginRegistrySnapshot, String> {
    let Some(name) = name.filter(|n| !n.trim().is_empty()) else {
        return Err("plugin name is required".to_string());
    };

    state.update_capability(
        format!("plugin-host:plugin:{name}"),
        "withdrawn".to_string(),
        Some(serde_json::json!({ "name": &name })),
        now_millis(),
    );

    Ok(build_registry_snapshot(&app_handle, &state).await)
}

/// Inspect plugin host debug state
#[tauri::command]
pub async fn electron_plugins_inspect(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    sidecar: State<'_, PluginHostSidecarController>,
) -> Result<Value, String> {
    let registry = build_registry_snapshot(&app_handle, &state).await;
    let sidecar_status = sidecar.status_blocking();
    update_sidecar_capability(&state, &sidecar_status);
    let snapshot = state.snapshot();
    let mut capabilities: Vec<_> = snapshot.capabilities.values().cloned().collect();
    capabilities.sort_by(|a, b| a.key.cmp(&b.key));

    Ok(serde_json::json!({
        "registry": registry,
        "sessions": [],
        "kits": [],
        "modules": [],
        "sidecar": sidecar_status,
        "capabilities": capabilities,
        "refreshedAt": now_millis(),
    }))
}

/// List plugin tools for agents — empty because sidecar runtime is out of scope
#[tauri::command]
pub async fn electron_plugins_tools_list() -> Vec<Value> {
    vec![]
}

/// List plugin xsai tools — empty because sidecar runtime is out of scope
#[tauri::command]
pub async fn electron_plugins_tools_list_xsai() -> Value {
    serde_json::json!({ "tools": [], "prompts": [] })
}

/// Invoke a plugin tool — returns error directing to degraded state
#[tauri::command]
pub async fn electron_plugins_tools_invoke(
    _owner_plugin_id: Option<String>,
    name: Option<String>,
    _input: Option<Value>,
) -> Value {
    serde_json::json!({
        "result": null,
        "error": format!("plugin tool execution is degraded: sidecar binary not yet bundled (requested tool={})", name.unwrap_or_default()),
    })
}

/// Update plugin capability state (renderer-side dual-state forwarding)
#[tauri::command]
pub async fn electron_plugins_capability_update(
    state: State<'_, PluginHostState>,
    key: Option<String>,
    value_state: Option<String>,
    metadata: Option<Value>,
) -> Result<Value, String> {
    let Some(key) = key.filter(|k| !k.trim().is_empty()) else {
        return Err("capability key is required".to_string());
    };

    let value_state = value_state.unwrap_or_else(|| "announced".to_string());

    state.update_capability(
        key.clone(),
        value_state.clone(),
        metadata.clone(),
        now_millis(),
    );

    Ok(serde_json::json!({
        "key": key,
        "state": value_state,
        "updatedAt": now_millis(),
    }))
}

/// List plugin protocol providers
#[tauri::command]
pub async fn proj_airi_plugin_sdk_apis_protocol_resources_providers_list_providers() -> Vec<Value> {
    vec![]
}

/// Get plugin asset base URL — returns placeholder
#[tauri::command]
pub async fn electron_plugins_asset_base_url() -> String {
    "https://assets.local/".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::sidecar::{PluginHostSidecarState, PluginHostSidecarStatus};

    #[test]
    fn plugin_host_sidecar_capability_records_state_and_metadata() {
        let state = PluginHostState::default();
        let status = PluginHostSidecarStatus {
            state: PluginHostSidecarState::Ready,
            pid: Some(42),
            endpoint: Some("http://127.0.0.1:49152".to_string()),
            executable_path: Some("/opt/airi/plugin-host".to_string()),
            last_error: None,
            updated_at: 123,
        };

        update_sidecar_capability(&state, &status);

        let snapshot = state.snapshot();
        let capability = snapshot.capabilities.get("plugin-host:sidecar").unwrap();
        assert_eq!(capability.state, "ready");
        assert_eq!(capability.metadata.as_ref().unwrap()["pid"], 42);
        assert_eq!(
            capability.metadata.as_ref().unwrap()["endpoint"],
            "http://127.0.0.1:49152"
        );
        assert_eq!(
            capability.metadata.as_ref().unwrap()["executablePath"],
            "/opt/airi/plugin-host"
        );
        assert_eq!(capability.metadata.as_ref().unwrap()["updatedAt"], 123);
    }

    #[test]
    fn plugin_host_sidecar_capability_maps_lifecycle_state_to_capability_state() {
        let state = PluginHostState::default();

        update_sidecar_capability(
            &state,
            &PluginHostSidecarStatus {
                state: PluginHostSidecarState::Stopped,
                pid: None,
                endpoint: None,
                executable_path: None,
                last_error: None,
                updated_at: 123,
            },
        );
        let snapshot = state.snapshot();
        let capability = snapshot.capabilities.get("plugin-host:sidecar").unwrap();
        assert_eq!(capability.state, "withdrawn");

        update_sidecar_capability(
            &state,
            &PluginHostSidecarStatus {
                state: PluginHostSidecarState::Booting,
                pid: None,
                endpoint: Some("http://127.0.0.1:49152".to_string()),
                executable_path: Some("/opt/airi/plugin-host".to_string()),
                last_error: None,
                updated_at: 124,
            },
        );
        let snapshot = state.snapshot();
        let capability = snapshot.capabilities.get("plugin-host:sidecar").unwrap();
        assert_eq!(capability.state, "announced");
        assert_eq!(capability.metadata.as_ref().unwrap()["state"], "booting");
    }

    #[test]
    fn plugin_load_request_capability_does_not_report_ready_without_load_api() {
        let state = PluginHostState::default();
        let status = PluginHostSidecarStatus {
            state: PluginHostSidecarState::Ready,
            pid: Some(42),
            endpoint: Some("http://127.0.0.1:49152".to_string()),
            executable_path: Some("/opt/airi/plugin-host".to_string()),
            last_error: None,
            updated_at: 123,
        };

        update_plugin_load_request_capability(&state, "alpha", &status);

        let snapshot = state.snapshot();
        let capability = snapshot.capabilities.get("plugin-host:plugin:alpha").unwrap();
        assert_eq!(capability.state, "degraded");
        assert!(capability
            .metadata
            .as_ref()
            .unwrap()["reason"]
            .as_str()
            .unwrap()
            .contains("sidecar load API"));
    }
}
