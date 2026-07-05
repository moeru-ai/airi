use serde::Deserialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub const PLUGIN_MANIFEST_FILENAME: &str = "plugin.airi.json";

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct RawPluginManifest {
    pub api_version: Option<String>,
    pub kind: Option<String>,
    pub name: Option<String>,
    #[serde(default)]
    pub entrypoints: RawEntrypoints,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq)]
pub struct RawEntrypoints {
    pub default: Option<String>,
    pub electron: Option<String>,
    pub node: Option<String>,
    pub web: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PluginManifest {
    pub name: String,
    pub entrypoints: RawEntrypoints,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScanResult {
    pub manifests: Vec<PluginManifest>,
    pub failed_paths: Vec<(String, String)>,
}

pub fn scan_plugin_root(root: &Path) -> ScanResult {
    if !root.exists() {
        return ScanResult {
            manifests: vec![],
            failed_paths: vec![],
        };
    }

    let mut seen_files = HashSet::new();
    match fs::read_dir(root) {
        Ok(entries) => {
            let mut manifests = Vec::<PluginManifest>::new();
            let mut failed_paths = Vec::<(String, String)>::new();

            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.eq_ignore_ascii_case(PLUGIN_MANIFEST_FILENAME) {
                    if let Ok(path) = resolve_manifest_path(&entry.path()) {
                        if seen_files.insert(path.clone()) {
                            match load_manifest(&path) {
                                Some(manifest) => manifests.push(manifest),
                                None => failed_paths.push((path, "invalid manifest".to_string())),
                            }
                        }
                    }
                    continue;
                }

                let meta = match entry.metadata() {
                    Ok(meta) => meta,
                    Err(err) => {
                        failed_paths.push((file_name, format!("failed to read metadata: {err}")));
                        continue;
                    }
                };

                if meta.is_dir() {
                    let candidate = entry.path().join(PLUGIN_MANIFEST_FILENAME);
                    if candidate.exists() {
                        if let Ok(path) = resolve_manifest_path(&candidate) {
                            if seen_files.insert(path.clone()) {
                                match load_manifest(&path) {
                                    Some(manifest) => manifests.push(manifest),
                                    None => failed_paths.push((path, "invalid manifest".to_string())),
                                }
                            }
                        }
                    }
                } else if meta.is_symlink() {
                    let resolved = resolve_symlink_in_root(&entry.path());
                    match resolved {
                        Ok(Some(path)) => {
                            if seen_files.insert(path.clone()) {
                                match load_manifest(&path) {
                                    Some(manifest) => manifests.push(manifest),
                                    None => failed_paths.push((path, "invalid manifest".to_string())),
                                }
                            }
                        }
                        Ok(None) => {}
                        Err(err) => failed_paths.push((file_name, err)),
                    }
                }
            }

            ScanResult {
                manifests,
                failed_paths,
            }
        }
        Err(err) => ScanResult {
            manifests: vec![],
            failed_paths: vec![(root.to_string_lossy().to_string(), err.to_string())],
        },
    }
}

fn resolve_manifest_path(path: &Path) -> Result<String, String> {
    fs::canonicalize(path)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

fn resolve_symlink_in_root(entry_path: &Path) -> Result<Option<String>, String> {
    let resolved = fs::canonicalize(entry_path).map_err(|e| format!("failed to resolve symlink: {e}"))?;
    let metadata = fs::metadata(&resolved).map_err(|e| format!("failed to stat target: {e}"))?;

    if metadata.is_dir() {
        let candidate = resolved.join(PLUGIN_MANIFEST_FILENAME);
        if candidate.exists() {
            resolve_manifest_path(&candidate).map(Some)
        } else {
            Ok(None)
        }
    } else if resolved.file_name().and_then(|s| s.to_str()) == Some(PLUGIN_MANIFEST_FILENAME) {
        resolve_manifest_path(&resolved).map(Some)
    } else {
        Ok(None)
    }
}

fn load_manifest(path: &str) -> Option<PluginManifest> {
    let content = fs::read_to_string(path).ok()?;
    let raw: RawPluginManifest = serde_json::from_str(&content).ok()?;
    let name = raw.name.as_deref().map(str::trim).filter(|s| !s.is_empty())?.to_string();

    let is_valid_kind = raw
        .kind
        .as_deref()
        .map(|k| k.eq_ignore_ascii_case("manifest.plugin.airi.moeru.ai"))
        .unwrap_or(true);
    if !is_valid_kind {
        return None;
    }

    Some(PluginManifest {
        name,
        entrypoints: raw.entrypoints,
        path: path.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_manifest(dir: &Path, _name: &str, body: &str) -> PathBuf {
        std::fs::create_dir_all(dir).expect("create manifest dir");
        let manifest_path = dir.join(PLUGIN_MANIFEST_FILENAME);
        let mut file = std::fs::File::create(&manifest_path).expect("create manifest");
        file.write_all(body.as_bytes()).expect("write manifest");
        manifest_path
    }

    fn new_test_dir(test_name: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "airi-plugin-host-manifest-{}-{}-{}",
            test_name,
            std::process::id(),
            rand_u64(),
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("create test dir");
        base
    }

    fn rand_u64() -> u64 {
        let elapsed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time");
        elapsed.as_nanos() as u64 ^ (std::process::id() as u64) << 32
    }

    #[test]
    fn missing_root_returns_empty_scan() {
        let root = new_test_dir("missing-root-nonexistent-path");
        let result = scan_plugin_root(&root.join("nope"));
        assert!(result.manifests.is_empty());
        assert!(result.failed_paths.is_empty());
    }

    #[test]
    fn reads_subdirectory_manifests() {
        let root = new_test_dir("subdir-manifests");

        write_manifest(
            &root.join("alpha"),
            "alpha",
            r#"{"apiVersion":"v1","kind":"manifest.plugin.airi.moeru.ai","name":"alpha","entrypoints":{"default":"./plugin.mjs"}}"#,
        );

        write_manifest(
            &root.join("beta"),
            "beta",
            r#"{"apiVersion":"v1","kind":"manifest.plugin.airi.moeru.ai","name":"beta","entrypoints":{}}"#,
        );

        let mut result = scan_plugin_root(&root);
        result.manifests.sort_by(|a, b| a.name.cmp(&b.name));

        assert_eq!(result.manifests.len(), 2);
        assert_eq!(result.manifests[0].name, "alpha");
        assert_eq!(result.manifests[0].entrypoints.default.as_deref(), Some("./plugin.mjs"));
        assert_eq!(result.manifests[1].name, "beta");
        assert!(result.failed_paths.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn ignores_toplevel_non_manifest_files() {
        let root = new_test_dir("top-files");

        write_manifest(
            &root.join("plugin"),
            "legit",
            r#"{"apiVersion":"v1","kind":"manifest.plugin.airi.moeru.ai","name":"legit","entrypoints":{}}"#,
        );

        let other_path = root.join("README.md");
        fs::write(&other_path, "hello readme").unwrap();

        let result = scan_plugin_root(&root);
        assert_eq!(result.manifests.len(), 1);
        assert_eq!(result.manifests[0].name, "legit");
        assert!(result.failed_paths.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reports_invalid_manifest_in_failed() {
        let root = new_test_dir("invalid-manifest");

        let manifest_path = root.join("garbage").join(PLUGIN_MANIFEST_FILENAME);
        fs::create_dir_all(manifest_path.parent().unwrap()).unwrap();
        fs::write(&manifest_path, "not a json manifest").unwrap();

        let result = scan_plugin_root(&root);
        assert!(result.manifests.is_empty());
        assert_eq!(result.failed_paths.len(), 1);
        assert!(result.failed_paths[0].1.contains("invalid manifest") || result.failed_paths[0].1.contains("Ok"));
    }

    #[test]
    fn resolves_symlinked_plugin_dir() {
        #[cfg(unix)]
        {
            let root = new_test_dir("symlink-dir");
            let real_dir = new_test_dir("symlink-dir-real");

            write_manifest(
                &real_dir,
                "symlink-plugin",
                r#"{"apiVersion":"v1","kind":"manifest.plugin.airi.moeru.ai","name":"symlink-plugin","entrypoints":{}}"#,
            );

            let link_path = root.join("virtual");
            std::os::unix::fs::symlink(&real_dir, &link_path).expect("symlink");

            let mut result = scan_plugin_root(&root);
            result.manifests.sort_by(|a, b| a.name.cmp(&b.name));
            assert_eq!(result.manifests.len(), 1);
            assert_eq!(result.manifests[0].name, "symlink-plugin");

            let _ = fs::remove_dir_all(&root);
            let _ = fs::remove_dir_all(&real_dir);
        }
    }
}
