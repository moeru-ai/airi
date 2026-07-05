use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent,
};

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
pub(crate) const TRAY_SHOW_ID: &str = "show-airi";
pub(crate) const TRAY_QUIT_ID: &str = "quit-airi";
const WINDOW_STATE_FILE: &str = "main-window-state.json";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TrayMenuAction {
    Show,
    Quit,
    Ignore,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct DisplayWorkArea {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

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

fn tray_menu_action(id: &str) -> TrayMenuAction {
    match id {
        TRAY_SHOW_ID => TrayMenuAction::Show,
        TRAY_QUIT_ID => TrayMenuAction::Quit,
        _ => TrayMenuAction::Ignore,
    }
}

fn default_main_window_state() -> PersistedMainWindowState {
    PersistedMainWindowState {
        geometry: None,
        transparent: true,
    }
}

fn window_geometry_from_physical_state(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> WindowGeometry {
    WindowGeometry {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    }
}

fn display_work_area_from_monitor(monitor: &Monitor) -> DisplayWorkArea {
    let work_area = monitor.work_area();

    DisplayWorkArea {
        x: work_area.position.x as f64,
        y: work_area.position.y as f64,
        width: work_area.size.width as f64,
        height: work_area.size.height as f64,
    }
}

fn geometry_intersects_display(geometry: &WindowGeometry, display: &DisplayWorkArea) -> bool {
    if !valid_geometry(geometry)
        || !display.x.is_finite()
        || !display.y.is_finite()
        || !display.width.is_finite()
        || !display.height.is_finite()
        || display.width <= 0.0
        || display.height <= 0.0
    {
        return false;
    }

    let geometry_right = geometry.x + geometry.width;
    let geometry_bottom = geometry.y + geometry.height;
    let display_right = display.x + display.width;
    let display_bottom = display.y + display.height;

    geometry.x < display_right
        && geometry_right > display.x
        && geometry.y < display_bottom
        && geometry_bottom > display.y
}

fn geometry_intersects_any_display(
    geometry: &WindowGeometry,
    displays: &[DisplayWorkArea],
) -> bool {
    displays
        .iter()
        .any(|display| geometry_intersects_display(geometry, display))
}

fn current_display_work_areas(app: &AppHandle) -> Result<Vec<DisplayWorkArea>, String> {
    Ok(app
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .map(display_work_area_from_monitor)
        .collect())
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
    let temp_path = path.with_extension("tmp");
    std::fs::write(&temp_path, bytes).map_err(|e| e.to_string())?;
    replace_window_state_file(&temp_path, path)
}

fn replace_window_state_file(temp_path: &Path, path: &Path) -> Result<(), String> {
    replace_window_state_file_with_policy(temp_path, path, cfg!(windows))
}

fn replace_window_state_file_with_policy(
    temp_path: &Path,
    path: &Path,
    remove_existing_before_rename: bool,
) -> Result<(), String> {
    if remove_existing_before_rename && path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    std::fs::rename(temp_path, path).map_err(|e| e.to_string())
}

pub(crate) fn capture_main_window_state(
    window: &WebviewWindow,
) -> Result<PersistedMainWindowState, String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    Ok(PersistedMainWindowState {
        geometry: Some(window_geometry_from_physical_state(position, size)),
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
    if !geometry_intersects_any_display(&geometry, &current_display_work_areas(app)?) {
        return Ok(false);
    }

    window
        .set_size(PhysicalSize::new(
            geometry.width.round() as u32,
            geometry.height.round() as u32,
        ))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(
            geometry.x.round() as i32,
            geometry.y.round() as i32,
        ))
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub(crate) fn setup_main_window_close_persistence(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            quit_after_persisting(&handle);
        }
    });
}

pub(crate) fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    if window.is_minimized().unwrap_or(false) {
        window.unminimize().map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn quit_after_persisting(app: &AppHandle) {
    let _ = persist_main_window_state(app);
    app.exit(0);
}

pub(crate) fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let show = MenuItemBuilder::with_id(TRAY_SHOW_ID, "Show AIRI")
        .build(app)
        .map_err(|e| e.to_string())?;
    let quit = MenuItemBuilder::with_id(TRAY_QUIT_ID, "Quit")
        .build(app)
        .map_err(|e| e.to_string())?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &quit])
        .build()
        .map_err(|e| e.to_string())?;

    let mut tray = TrayIconBuilder::new()
        .tooltip("AIRI")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match tray_menu_action(event.id().as_ref()) {
            TrayMenuAction::Show => {
                let _ = show_main_window(app);
            }
            TrayMenuAction::Quit => quit_after_persisting(app),
            TrayMenuAction::Ignore => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app).map_err(|e| e.to_string())?;
    Ok(())
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
    fn replaces_stale_temporary_window_state_file() {
        let path = unique_test_path("stale-temp");
        let temp_path = path.with_extension("tmp");
        let state = PersistedMainWindowState {
            geometry: Some(WindowGeometry {
                x: 33.0,
                y: 44.0,
                width: 640.0,
                height: 480.0,
            }),
            transparent: true,
        };
        std::fs::write(&temp_path, "stale").unwrap();

        write_main_window_state_to_path(&path, state).unwrap();

        assert_eq!(
            read_main_window_state_from_path(&path).unwrap(),
            Some(state)
        );
        assert!(!temp_path.exists());
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn replaces_existing_window_state_file_when_platform_requires_unlink() {
        let path = unique_test_path("replace-existing");
        let temp_path = path.with_extension("tmp");
        std::fs::write(&path, "old").unwrap();
        std::fs::write(&temp_path, "new").unwrap();

        replace_window_state_file_with_policy(&temp_path, &path, true).unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert!(!temp_path.exists());
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(temp_path);
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
    fn preserves_physical_window_state_geometry() {
        assert_eq!(
            window_geometry_from_physical_state(
                tauri::PhysicalPosition::new(200, 300),
                tauri::PhysicalSize::new(800, 600),
            ),
            WindowGeometry {
                x: 200.0,
                y: 300.0,
                width: 800.0,
                height: 600.0,
            }
        );
    }

    #[test]
    fn detects_geometry_that_intersects_a_display_work_area() {
        let displays = [DisplayWorkArea {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        }];

        assert!(geometry_intersects_any_display(
            &WindowGeometry {
                x: 1800.0,
                y: 900.0,
                width: 480.0,
                height: 720.0,
            },
            &displays,
        ));
    }

    #[test]
    fn rejects_geometry_outside_display_work_areas() {
        let displays = [DisplayWorkArea {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        }];

        assert!(!geometry_intersects_any_display(
            &WindowGeometry {
                x: 5000.0,
                y: 5000.0,
                width: 480.0,
                height: 720.0,
            },
            &displays,
        ));
    }

    #[test]
    fn tray_menu_ids_are_stable() {
        assert_eq!(TRAY_SHOW_ID, "show-airi");
        assert_eq!(TRAY_QUIT_ID, "quit-airi");
    }

    #[test]
    fn maps_tray_menu_ids_to_lifecycle_actions() {
        assert_eq!(tray_menu_action(TRAY_SHOW_ID), TrayMenuAction::Show);
        assert_eq!(tray_menu_action(TRAY_QUIT_ID), TrayMenuAction::Quit);
        assert_eq!(tray_menu_action("unknown"), TrayMenuAction::Ignore);
    }
}
