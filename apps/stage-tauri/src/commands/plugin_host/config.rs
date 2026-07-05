use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

// Serializes read-modify-write operations on the plugin config file within the
// same process. Cross-process races (out of scope here) require file-level
// locking such as fs2::FileExt — left for the sidecar-spawn follow-up.
static CONFIG_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginConfig {
    #[serde(default)]
    pub enabled: Vec<String>,
    #[serde(default)]
    pub auto_reload: Vec<String>,
    #[serde(default)]
    pub known: HashMap<String, PluginKnownEntry>,
}

#[derive(Debug, Clone, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginKnownEntry {
    pub path: String,
}

pub fn read_plugin_config(path: &Path) -> PluginConfig {
    let content = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str::<PluginConfig>(&content).unwrap_or_default()
}

pub fn write_plugin_config(path: &Path, config: &PluginConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(config).map_err(|e| e.to_string())? + "\n")
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Atomic guarded write — holds CONFIG_LOCK so the read-modify-write sequence
/// cannot interleave with other writers in this process.
pub fn write_plugin_config_locked(path: &Path, config: &PluginConfig) -> Result<(), String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "config lock poisoned".to_string())?;
    write_plugin_config(path, config)
}

fn plugin_name_index(names: &[String], name: &str) -> Option<usize> {
    names.iter().position(|n| n == name)
}

pub fn enable_plugin(path: &Path, name: &str) -> Result<PluginConfig, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "config lock poisoned".to_string())?;
    let mut config = read_plugin_config(path);
    if !config.enabled.iter().any(|n| n == name) {
        config.enabled.push(name.to_string());
    }
    write_plugin_config(path, &config)?;
    Ok(config)
}

pub fn disable_plugin(path: &Path, name: &str) -> Result<PluginConfig, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "config lock poisoned".to_string())?;
    let mut config = read_plugin_config(path);
    if let Some(idx) = plugin_name_index(&config.enabled, name) {
        config.enabled.remove(idx);
    }
    write_plugin_config(path, &config)?;
    Ok(config)
}

pub fn set_auto_reload(path: &Path, name: &str, enabled: bool) -> Result<PluginConfig, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "config lock poisoned".to_string())?;
    let mut config = read_plugin_config(path);
    let is_current = config.auto_reload.iter().any(|n| n == name);
    if enabled && !is_current {
        config.auto_reload.push(name.to_string());
    } else if !enabled && is_current {
        if let Some(idx) = plugin_name_index(&config.auto_reload, name) {
            config.auto_reload.remove(idx);
        }
    }
    write_plugin_config(path, &config)?;
    Ok(config)
}

pub fn mark_plugin_known(
    path: &Path,
    name: &str,
    manifest_path: &str,
) -> Result<PluginConfig, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "config lock poisoned".to_string())?;
    let mut config = read_plugin_config(path);
    config.known.entry(name.to_string()).or_insert_with(|| PluginKnownEntry {
        path: manifest_path.to_string(),
    });
    write_plugin_config(path, &config)?;
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_config_path(test_name: &str) -> std::path::PathBuf {
        let elapsed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time");
        std::env::temp_dir().join(format!(
            "airi-plugin-host-test-{}-{}.json",
            test_name, elapsed.as_nanos(),
        ))
    }

    #[test]
    fn empty_config_defaults_when_file_missing() {
        let path = unique_config_path("missing-config");
        let _ = std::fs::remove_file(&path);

        let config = read_plugin_config(&path);
        assert_eq!(config, PluginConfig::default());
    }

    #[test]
    fn malformed_config_defaults_without_panic() {
        let path = unique_config_path("malformed-config");
        std::fs::write(&path, "not valid json\n").unwrap();

        let config = read_plugin_config(&path);
        assert_eq!(config, PluginConfig::default());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn enable_then_disable_round_trips() {
        let path = unique_config_path("enable-disable");

        let updated = enable_plugin(&path, "alpha").expect("enable alpha");
        assert_eq!(updated.enabled, vec!["alpha".to_string()]);
        assert!(updated.auto_reload.is_empty());
        assert!(updated.known.is_empty());

        let enabled_again = enable_plugin(&path, "alpha").expect("idempotent enable");
        assert_eq!(enabled_again.enabled, vec!["alpha".to_string()]);

        let added_b = enable_plugin(&path, "beta").expect("enable beta");
        assert_eq!(added_b.enabled, vec!["alpha".to_string(), "beta".to_string()]);

        let disabled = disable_plugin(&path, "alpha").expect("disable alpha");
        assert_eq!(disabled.enabled, vec!["beta".to_string()]);

        let re_enable = enable_plugin(&path, "alpha").expect("re-enable alpha");
        assert_eq!(re_enable.enabled, vec!["beta".to_string(), "alpha".to_string()]);

        let remove_beta = disable_plugin(&path, "beta").expect("disable beta");
        assert_eq!(remove_beta.enabled, vec!["alpha".to_string()]);

        let fully_disabled = disable_plugin(&path, "alpha").expect("disable alpha");
        assert!(fully_disabled.enabled.is_empty());

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(&path.with_extension("tmp"));
    }

    #[test]
    fn auto_reload_toggles_persist() {
        let path = unique_config_path("auto-reload");

        let enabled = set_auto_reload(&path, "alpha", true).expect("enable auto-reload");
        assert_eq!(enabled.auto_reload, vec!["alpha".to_string()]);

        let enabled_dup = set_auto_reload(&path, "alpha", true).expect("idempotent on");
        assert_eq!(enabled_dup.auto_reload, vec!["alpha".to_string()]);

        let disabled = set_auto_reload(&path, "alpha", false).expect("disable auto-reload");
        assert!(disabled.auto_reload.is_empty());

        let disabled_dup = set_auto_reload(&path, "alpha", false).expect("idempotent off");
        assert!(disabled_dup.auto_reload.is_empty());

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(&path.with_extension("tmp"));
    }

    #[test]
    fn mark_known_records_path_by_name() {
        let path = unique_config_path("mark-known");

        let updated = mark_plugin_known(&path, "alpha", "/opt/plugins/manifest.json").expect("mark known");
        assert_eq!(updated.known.len(), 1);
        assert_eq!(updated.known.get("alpha").unwrap().path, "/opt/plugins/manifest.json");

        let dedup = mark_plugin_known(&path, "alpha", "/opt/plugins/manifest.json").expect("idempotent");
        assert_eq!(dedup.known.len(), 1);

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(&path.with_extension("tmp"));
    }
}
