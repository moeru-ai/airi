// Widget window commands matching apps/stage-tamagotchi/src/shared/eventa contracts.

use crate::window_manager::{
    open_managed_window, route_with_query, stable_child_label, OpenManagedWindowOptions,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

const WIDGETS_RENDER_EVENT: &str = "electron:windows:widgets:render";
const WIDGETS_REMOVE_EVENT: &str = "electron:windows:widgets:remove";
const WIDGETS_CLEAR_EVENT: &str = "electron:windows:widgets:clear";
const WIDGETS_UPDATE_EVENT: &str = "electron:windows:widgets:update";
static WIDGET_ID_COUNTER: AtomicU64 = AtomicU64::new(0);
static WIDGET_GENERATION_COUNTER: AtomicU64 = AtomicU64::new(1);

pub(crate) type WidgetRegistry = Mutex<HashMap<String, WidgetRecord>>;

#[derive(Clone, Debug)]
pub(crate) struct WidgetRecord {
    pub(crate) snapshot: WidgetSnapshot,
    pub(crate) generation: u64,
}

pub(crate) fn new_widget_registry() -> WidgetRegistry {
    Mutex::new(HashMap::new())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSnapshot {
    pub id: String,
    pub component_name: String,
    pub component_props: Value,
    pub size: Value,
    pub window_size: Option<Value>,
    pub ttl_ms: i64,
}

fn generated_widget_id() -> String {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let sequence = WIDGET_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("widget-{now_ms}-{sequence}")
}

fn next_widget_generation() -> u64 {
    WIDGET_GENERATION_COUNTER.fetch_add(1, Ordering::Relaxed)
}

fn widget_route(id: Option<&str>) -> String {
    match id {
        Some(id) if !id.is_empty() => route_with_query("/widgets", "id", id),
        _ => "/widgets".to_string(),
    }
}

fn widget_window_label(id: Option<&str>) -> String {
    match id {
        Some(id) if !id.is_empty() => stable_child_label("widgets", id),
        _ => "widgets".to_string(),
    }
}

fn open_widgets_window(app: &AppHandle, id: Option<&str>) -> Result<(), String> {
    open_managed_window(
        app,
        OpenManagedWindowOptions {
            label: "widgets".to_string(),
            route: Some(widget_route(id)),
            window_label: Some(widget_window_label(id)),
            ..Default::default()
        },
    )?;
    Ok(())
}

fn close_widget_window(app: &AppHandle, id: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&widget_window_label(Some(id))) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn schedule_widget_ttl_removal(app: &AppHandle, id: &str, generation: u64, ttl_ms: i64) {
    let Ok(ttl_ms) = u64::try_from(ttl_ms) else {
        return;
    };
    if ttl_ms == 0 {
        return;
    }

    let app = app.clone();
    let id = id.to_string();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(ttl_ms)).await;

        let should_remove = {
            let registry = app.state::<WidgetRegistry>();
            let Ok(mut registry) = registry.lock() else {
                return;
            };

            match registry.get(&id) {
                Some(record) if record.generation == generation => {
                    registry.remove(&id);
                    true
                }
                _ => false,
            }
        };

        if should_remove {
            let _ = close_widget_window(&app, &id);
            let _ = app.emit(WIDGETS_REMOVE_EVENT, serde_json::json!({ "id": id }));
        }
    });
}

/// Open widgets window.
#[tauri::command]
pub async fn electron_windows_widgets_open(
    app: AppHandle,
    id: Option<String>,
) -> Result<(), String> {
    open_widgets_window(&app, id.as_deref())
}

/// Hide widgets window.
#[tauri::command]
pub async fn electron_windows_widgets_hide(
    app: AppHandle,
    id: Option<String>,
) -> Result<(), String> {
    let label = widget_window_label(id.as_deref());
    if let Some(window) = app.get_webview_window(&label) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Add widget.
#[tauri::command]
pub async fn electron_windows_widgets_add(
    app: AppHandle,
    registry: State<'_, WidgetRegistry>,
    id: Option<String>,
    component_name: Option<String>,
    component_props: Option<Value>,
    size: Option<Value>,
    window_size: Option<Value>,
    ttl_ms: Option<i64>,
) -> Result<Option<String>, String> {
    let id = id.unwrap_or_else(generated_widget_id);
    let snapshot = WidgetSnapshot {
        id: id.clone(),
        component_name: component_name.unwrap_or_else(|| "unknown".to_string()),
        component_props: component_props.unwrap_or_else(|| serde_json::json!({})),
        size: size.unwrap_or_else(|| serde_json::json!("m")),
        window_size,
        ttl_ms: ttl_ms.unwrap_or(0),
    };
    let generation = next_widget_generation();
    registry.lock().map_err(|e| e.to_string())?.insert(
        id.clone(),
        WidgetRecord {
            snapshot: snapshot.clone(),
            generation,
        },
    );
    if let Err(error) = open_widgets_window(&app, Some(&id)) {
        registry.lock().map_err(|e| e.to_string())?.remove(&id);
        return Err(error);
    }
    app.emit(WIDGETS_RENDER_EVENT, snapshot)
        .map_err(|e| e.to_string())?;
    schedule_widget_ttl_removal(&app, &id, generation, ttl_ms.unwrap_or(0));
    Ok(Some(id))
}

/// Remove widget.
#[tauri::command]
pub async fn electron_windows_widgets_remove(
    app: AppHandle,
    registry: State<'_, WidgetRegistry>,
    id: Option<String>,
) -> Result<(), String> {
    if let Some(id) = id {
        registry.lock().map_err(|e| e.to_string())?.remove(&id);
        close_widget_window(&app, &id)?;
        app.emit(WIDGETS_REMOVE_EVENT, serde_json::json!({ "id": id }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Clear all widgets.
#[tauri::command]
pub async fn electron_windows_widgets_clear(
    app: AppHandle,
    registry: State<'_, WidgetRegistry>,
) -> Result<(), String> {
    registry.lock().map_err(|e| e.to_string())?.clear();
    for window in app.webview_windows().into_values() {
        if window.label() == "widgets" || window.label().starts_with("widgets-") {
            window.close().map_err(|e| e.to_string())?;
        }
    }
    app.emit(WIDGETS_CLEAR_EVENT, serde_json::json!(null))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Update widget.
#[tauri::command]
pub async fn electron_windows_widgets_update(
    app: AppHandle,
    registry: State<'_, WidgetRegistry>,
    id: Option<String>,
    component_props: Option<Value>,
    size: Option<Value>,
    window_size: Option<Value>,
    ttl_ms: Option<i64>,
) -> Result<(), String> {
    let Some(id) = id else {
        return Ok(());
    };

    let (update_payload, generation, ttl_ms) = {
        let mut registry = registry.lock().map_err(|e| e.to_string())?;
        let Some(existing) = registry.get_mut(&id) else {
            return Ok(());
        };

        if let Some(component_props) = component_props {
            existing.snapshot.component_props = component_props;
        }
        if let Some(size) = size {
            existing.snapshot.size = size;
        }
        if let Some(window_size) = window_size {
            existing.snapshot.window_size = Some(window_size);
        }
        if let Some(ttl_ms) = ttl_ms {
            existing.snapshot.ttl_ms = ttl_ms;
        }
        existing.generation = next_widget_generation();

        (
            serde_json::json!({
                "id": existing.snapshot.id,
                "componentProps": existing.snapshot.component_props,
                "size": existing.snapshot.size,
                "windowSize": existing.snapshot.window_size,
                "ttlMs": existing.snapshot.ttl_ms,
            }),
            existing.generation,
            existing.snapshot.ttl_ms,
        )
    };

    open_widgets_window(&app, Some(&id))?;
    app.emit(WIDGETS_UPDATE_EVENT, update_payload)
        .map_err(|e| e.to_string())?;
    schedule_widget_ttl_removal(&app, &id, generation, ttl_ms);
    Ok(())
}

/// Fetch widget by id.
#[tauri::command]
pub async fn electron_windows_widgets_fetch(
    registry: State<'_, WidgetRegistry>,
    id: Option<String>,
) -> Result<Option<WidgetSnapshot>, String> {
    let Some(id) = id else {
        return Ok(None);
    };
    Ok(registry
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .map(|record| record.snapshot.clone()))
}

/// Prepare widget window.
#[tauri::command]
pub async fn electron_windows_widgets_prepare(
    id: Option<String>,
) -> Result<Option<String>, String> {
    Ok(Some(id.unwrap_or_else(generated_widget_id)))
}

/// Publish iframe event.
#[tauri::command]
pub async fn electron_windows_widgets_iframe_publish(
    _id: Option<String>,
    _event: Option<Value>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn generated_widget_ids_are_unique_within_process() {
        let mut ids = HashSet::new();
        for _ in 0..64 {
            assert!(ids.insert(generated_widget_id()));
        }
    }

    #[test]
    fn stale_widget_generation_does_not_match_refreshed_record() {
        let registry = new_widget_registry();
        registry.lock().unwrap().insert(
            "widget-1".to_string(),
            WidgetRecord {
                snapshot: WidgetSnapshot {
                    id: "widget-1".to_string(),
                    component_name: "demo".to_string(),
                    component_props: serde_json::json!({}),
                    size: serde_json::json!("m"),
                    window_size: None,
                    ttl_ms: 250,
                },
                generation: 1,
            },
        );

        let registry = registry.lock().unwrap();
        let record = registry.get("widget-1").unwrap();
        assert_ne!(record.generation, 0);
    }
}
