use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize,
    WebviewWindow, WindowEvent,
};

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
const WINDOW_STATE_FILE: &str = "main-window-state.json";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowGeometry {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedMainWindowState {
    pub(crate) geometry: Option<WindowGeometry>,
    pub(crate) transparent: bool,
}

pub(crate) fn window_state_file_name() -> &'static str {
    WINDOW_STATE_FILE
}

pub(crate) fn valid_geometry(geometry: &WindowGeometry) -> bool {
    geometry.x.is_finite()
        && geometry.y.is_finite()
        && geometry.width.is_finite()
        && geometry.height.is_finite()
        && geometry.width >= 100.0
        && geometry.height >= 100.0
}

pub(crate) fn merge_saved_state(
    saved: Option<PersistedMainWindowState>,
    fallback: PersistedMainWindowState,
) -> PersistedMainWindowState {
    saved.unwrap_or(fallback)
}

fn default_main_window_state() -> PersistedMainWindowState {
    PersistedMainWindowState {
        geometry: None,
        transparent: true,
    }
}

fn normalize_scale_factor(scale_factor: f64) -> f64 {
    if scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    }
}

fn window_geometry_from_physical_state(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    scale_factor: f64,
) -> WindowGeometry {
    let scale_factor = normalize_scale_factor(scale_factor);
    WindowGeometry {
        x: position.x as f64 / scale_factor,
        y: position.y as f64 / scale_factor,
        width: size.width as f64 / scale_factor,
        height: size.height as f64 / scale_factor,
    }
}

fn window_state_path_from_app_data_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(window_state_file_name())
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(window_state_path_from_app_data_dir(&app_data_dir))
}

pub(crate) fn read_main_window_state_from_path(
    path: &Path,
) -> Result<Option<PersistedMainWindowState>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    match serde_json::from_slice::<PersistedMainWindowState>(&bytes) {
        Ok(state) => Ok(Some(state)),
        Err(_) => Ok(None),
    }
}

pub(crate) fn write_main_window_state_to_path(
    path: &Path,
    state: PersistedMainWindowState,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let bytes = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

pub(crate) fn capture_main_window_state(
    window: &WebviewWindow,
) -> Result<PersistedMainWindowState, String> {
    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    Ok(PersistedMainWindowState {
        geometry: Some(window_geometry_from_physical_state(
            position,
            size,
            scale_factor,
        )),
        transparent: true,
    })
}

pub(crate) fn persist_main_window_state(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    let state = capture_main_window_state(&window)?;
    write_main_window_state_to_path(&state_path(app)?, state)
}

pub(crate) fn restore_main_window_state(app: &AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(false);
    };

    let state = merge_saved_state(
        read_main_window_state_from_path(&state_path(app)?)?,
        default_main_window_state(),
    );
    let Some(geometry) = state.geometry else {
        return Ok(false);
    };
    if !valid_geometry(&geometry) {
        return Ok(false);
    }

    window
        .set_size(LogicalSize::new(geometry.width, geometry.height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(geometry.x, geometry.y))
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub(crate) fn setup_main_window_close_persistence(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            let _ = persist_main_window_state(&handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_test_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "airi-tauri-{name}-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn rejects_unusable_window_geometry() {
        assert!(!valid_geometry(&WindowGeometry {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 720.0,
        }));
        assert!(!valid_geometry(&WindowGeometry {
            x: 0.0,
            y: 0.0,
            width: 480.0,
            height: 0.0,
        }));
        assert!(!valid_geometry(&WindowGeometry {
            x: f64::NAN,
            y: 0.0,
            width: 480.0,
            height: 720.0,
        }));
        assert!(valid_geometry(&WindowGeometry {
            x: 10.0,
            y: 20.0,
            width: 480.0,
            height: 720.0,
        }));
    }

    #[test]
    fn keeps_configured_transparency_when_saved_state_omits_it() {
        let fallback = PersistedMainWindowState {
            geometry: None,
            transparent: true,
        };
        let saved = PersistedMainWindowState {
            geometry: Some(WindowGeometry {
                x: 10.0,
                y: 20.0,
                width: 640.0,
                height: 480.0,
            }),
            transparent: false,
        };

        assert_eq!(
            merge_saved_state(Some(saved), fallback),
            PersistedMainWindowState {
                geometry: Some(WindowGeometry {
                    x: 10.0,
                    y: 20.0,
                    width: 640.0,
                    height: 480.0,
                }),
                transparent: false,
            }
        );
        assert_eq!(
            merge_saved_state(None, fallback),
            PersistedMainWindowState {
                geometry: None,
                transparent: true,
            }
        );
    }

    #[test]
    fn round_trips_window_state_json() {
        let path = unique_test_path("round-trip");
        let state = PersistedMainWindowState {
            geometry: Some(WindowGeometry {
                x: 11.0,
                y: 22.0,
                width: 640.0,
                height: 480.0,
            }),
            transparent: true,
        };

        write_main_window_state_to_path(&path, state).unwrap();

        assert_eq!(
            read_main_window_state_from_path(&path).unwrap(),
            Some(state)
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn ignores_malformed_window_state_json() {
        let path = unique_test_path("malformed");
        std::fs::write(&path, "{not-json").unwrap();

        assert_eq!(read_main_window_state_from_path(&path).unwrap(), None);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn builds_window_state_path_under_app_data_dir() {
        let app_data_dir = unique_test_path("app-data-dir");

        assert_eq!(
            window_state_path_from_app_data_dir(&app_data_dir),
            app_data_dir.join(window_state_file_name())
        );
    }

    #[test]
    fn converts_physical_window_state_to_logical_geometry() {
        assert_eq!(
            window_geometry_from_physical_state(
                tauri::PhysicalPosition::new(200, 300),
                tauri::PhysicalSize::new(800, 600),
                2.0,
            ),
            WindowGeometry {
                x: 100.0,
                y: 150.0,
                width: 400.0,
                height: 300.0,
            }
        );

        assert_eq!(
            window_geometry_from_physical_state(
                tauri::PhysicalPosition::new(200, 300),
                tauri::PhysicalSize::new(800, 600),
                0.0,
            ),
            WindowGeometry {
                x: 200.0,
                y: 300.0,
                width: 800.0,
                height: 600.0,
            }
        );
    }
}
