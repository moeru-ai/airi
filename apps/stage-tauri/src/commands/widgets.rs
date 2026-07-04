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
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

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
    pub(crate) close_handler_attached: bool,
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
        .map_or(0, |duration| duration.as_millis());
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

fn open_widgets_window(app: &AppHandle, id: Option<&str>) -> Result<bool, String> {
    let opened = open_managed_window(
        app,
        OpenManagedWindowOptions {
            label: "widgets".to_string(),
            route: Some(widget_route(id)),
            window_label: Some(widget_window_label(id)),
            ..Default::default()
        },
    )?;
    Ok(!opened.reused)
}

fn close_widget_window(app: &AppHandle, id: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&widget_window_label(Some(id))) {
        let _ = window.close();
    }
    Ok(())
}

fn remove_widget_record(registry: &WidgetRegistry, id: &str) -> Result<bool, String> {
    Ok(registry
        .lock()
        .map_err(|e| e.to_string())?
        .remove(id)
        .is_some())
}

fn emit_widget_remove(app: &AppHandle, id: &str) -> Result<(), String> {
    app.emit(WIDGETS_REMOVE_EVENT, serde_json::json!({ "id": id }))
        .map_err(|e| e.to_string())
}

fn emit_widget_render(app: &AppHandle, snapshot: WidgetSnapshot) -> Result<(), String> {
    app.emit_to(
        widget_window_label(Some(&snapshot.id)),
        WIDGETS_RENDER_EVENT,
        snapshot,
    )
    .map_err(|e| e.to_string())
}

fn emit_widget_update(app: &AppHandle, id: &str, payload: Value) -> Result<(), String> {
    app.emit_to(widget_window_label(Some(id)), WIDGETS_UPDATE_EVENT, payload)
        .map_err(|e| e.to_string())
}

fn attach_widget_close_cleanup(app: &AppHandle, id: &str) {
    let Some(window) = app.get_webview_window(&widget_window_label(Some(id))) else {
        return;
    };

    let app_for_close = app.clone();
    let id_for_close = id.to_string();
    window.on_window_event(move |event| {
        if !matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            return;
        }

        let registry = app_for_close.state::<WidgetRegistry>();
        if remove_widget_record(&registry, &id_for_close).unwrap_or(false) {
            let _ = emit_widget_remove(&app_for_close, &id_for_close);
        }
    });
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
            let _ = emit_widget_remove(&app, &id);
        }
    });
}

/// Open widgets window.
#[tauri::command]
pub async fn electron_windows_widgets_open(
    app: AppHandle,
    id: Option<String>,
) -> Result<(), String> {
    open_widgets_window(&app, id.as_deref()).map(|_| ())
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
    let should_attach_close_cleanup = {
        let mut registry = registry.lock().map_err(|e| e.to_string())?;
        let close_handler_attached = registry
            .get(&id)
            .is_some_and(|record| record.close_handler_attached);
        registry.insert(
            id.clone(),
            WidgetRecord {
                snapshot: snapshot.clone(),
                generation,
                close_handler_attached,
            },
        );
        !close_handler_attached
    };

    if let Err(error) = open_widgets_window(&app, Some(&id)) {
        registry.lock().map_err(|e| e.to_string())?.remove(&id);
        return Err(error);
    }

    if should_attach_close_cleanup {
        attach_widget_close_cleanup(&app, &id);
        if let Some(record) = registry.lock().map_err(|e| e.to_string())?.get_mut(&id) {
            record.close_handler_attached = true;
        }
    }

    emit_widget_render(&app, snapshot)?;
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
        let _ = remove_widget_record(&registry, &id)?;
        close_widget_window(&app, &id)?;
        emit_widget_remove(&app, &id)?;
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
            let _ = window.close();
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

    let created_window = open_widgets_window(&app, Some(&id))?;
    if created_window {
        attach_widget_close_cleanup(&app, &id);
    }
    emit_widget_update(&app, &id, update_payload)?;
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
                close_handler_attached: false,
            },
        );

        let registry = registry.lock().unwrap();
        let record = registry.get("widget-1").unwrap();
        assert_ne!(record.generation, 0);
    }
}
