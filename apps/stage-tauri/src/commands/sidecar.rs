use std::path::PathBuf;

pub fn resolve_plugin_host_sidecar_path(app_data_dir: &std::path::Path) -> Option<PathBuf> {
    // Override: allow AIRI_PLUGIN_HOST_PATH env for dev bootstrapping when the pkg-compiled
    // binary was placed outside the default app-data location. Takes precedence over the
    // default path so developers can point the runtime at an in-repo build artifact.
    if let Ok(override_path) = std::env::var("AIRI_PLUGIN_HOST_PATH") {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn returns_none_when_missing() {
        let root = std::env::temp_dir().join(format!("airi-sidecar-missing-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();
        // Leverage env var to confirm it is respected only when set — missing target falls through.
        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");

        assert_eq!(resolve_plugin_host_sidecar_path(&root), None);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolves_present_binary() {
        let root = std::env::temp_dir().join(format!("airi-sidecar-present-{}", std::process::id()));
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
        let root = std::env::temp_dir().join(format!("airi-sidecar-env-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("sidecars")).unwrap();
        // Defensive: ensure env from another test didn't leak.
        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");

        let override_path = std::env::temp_dir().join(format!("airi-plugin-host-override-{}", std::process::id()));
        let _ = fs::remove_file(&override_path);
        fs::write(&override_path, b"custom-binary").unwrap();

        std::env::set_var("AIRI_PLUGIN_HOST_PATH", &override_path);
        let actual = resolve_plugin_host_sidecar_path(&root);
        assert_eq!(actual, Some(override_path.clone()));

        let sidecar_in_default = root.join("sidecars").join(executable_name());
        fs::write(&sidecar_in_default, b"default-binary").unwrap();

        // Make sure ovveride still wins when default candidate exists.
        assert_eq!(resolve_plugin_host_sidecar_path(&root), Some(override_path.clone()));

        std::env::remove_var("AIRI_PLUGIN_HOST_PATH");

        assert_eq!(resolve_plugin_host_sidecar_path(&root), Some(sidecar_in_default));

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&override_path);
    }
}
