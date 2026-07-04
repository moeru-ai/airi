// Notice window commands matching apps/stage-tamagotchi/src/shared/eventa contracts.

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
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State, WindowEvent};
use tokio::sync::oneshot;

pub(crate) type NoticeRegistry = Mutex<HashMap<String, PendingNotice>>;
static NOTICE_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

pub(crate) fn new_notice_registry() -> NoticeRegistry {
    Mutex::new(HashMap::new())
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoticePending {
    pub id: String,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

pub(crate) struct PendingNotice {
    pending: NoticePending,
    responder: Option<oneshot::Sender<bool>>,
}

impl PendingNotice {
    fn resolve(mut self, value: bool) {
        if let Some(responder) = self.responder.take() {
            let _ = responder.send(value);
        }
    }
}

pub(crate) fn insert_pending_notice(
    registry: &NoticeRegistry,
    id: String,
    r#type: Option<String>,
    payload: Option<Value>,
    responder: oneshot::Sender<bool>,
) -> Result<(), String> {
    let mut registry = registry.lock().map_err(|e| e.to_string())?;
    if let Some(previous) = registry.remove(&id) {
        previous.resolve(false);
    }
    registry.insert(
        id.clone(),
        PendingNotice {
            pending: NoticePending {
                id,
                r#type,
                payload,
            },
            responder: Some(responder),
        },
    );
    Ok(())
}

pub(crate) fn pending_notice_for_page(
    registry: &NoticeRegistry,
    id: Option<String>,
) -> Result<Option<NoticePending>, String> {
    let registry = registry.lock().map_err(|e| e.to_string())?;
    if let Some(id) = id {
        return Ok(registry.get(&id).map(|notice| notice.pending.clone()));
    }

    if registry.len() == 1 {
        return Ok(registry
            .values()
            .next()
            .map(|notice| notice.pending.clone()));
    }

    Ok(None)
}

pub(crate) fn resolve_notice_action(
    registry: &NoticeRegistry,
    id: &str,
    value: bool,
) -> Result<bool, String> {
    let pending = registry.lock().map_err(|e| e.to_string())?.remove(id);
    if let Some(pending) = pending {
        pending.resolve(value);
        return Ok(true);
    }
    Ok(false)
}

fn resolve_notice_unmounted(
    registry: &NoticeRegistry,
    id: Option<String>,
) -> Result<Option<String>, String> {
    if let Some(id) = id {
        resolve_notice_action(registry, &id, false)?;
        return Ok(Some(id));
    }

    let id = {
        let registry = registry.lock().map_err(|e| e.to_string())?;
        if registry.len() == 1 {
            registry.keys().next().cloned()
        } else {
            None
        }
    };

    if let Some(id) = id.as_deref() {
        resolve_notice_action(registry, id, false)?;
    }
    Ok(id)
}

fn generated_notice_id() -> String {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis());
    let sequence = NOTICE_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("notice-{now_ms}-{sequence}")
}

fn notice_window_label(id: &str) -> String {
    stable_child_label("notice", id)
}

/// Open notice window.
#[tauri::command]
pub async fn electron_windows_notice_invoke_open(
    app: AppHandle,
    registry: State<'_, NoticeRegistry>,
    id: Option<String>,
    route: Option<String>,
    r#type: Option<String>,
    payload: Option<Value>,
) -> Result<bool, String> {
    let id = id.unwrap_or_else(generated_notice_id);
    let route = route.unwrap_or_else(|| "/notice/fade-on-hover".to_string());
    let route = route_with_query(&route, "id", &id);
    let (sender, receiver) = oneshot::channel();

    insert_pending_notice(&registry, id.clone(), r#type, payload, sender)?;

    if let Err(error) = open_managed_window(
        &app,
        OpenManagedWindowOptions {
            label: "notice".to_string(),
            route: Some(route),
            window_label: Some(notice_window_label(&id)),
            ..Default::default()
        },
    ) {
        let _ = resolve_notice_action(&registry, &id, false);
        return Err(error);
    }

    if let Some(window) = app.get_webview_window(&notice_window_label(&id)) {
        let app_for_close = app.clone();
        let id_for_close = id.clone();
        window.on_window_event(move |event| {
            if !matches!(
                event,
                WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
            ) {
                return;
            }

            let registry = app_for_close.state::<NoticeRegistry>();
            let _ = resolve_notice_action(&registry, &id_for_close, false);
        });
    }

    Ok(receiver.await.unwrap_or(false))
}

/// Execute action on notice window.
#[tauri::command]
pub async fn electron_windows_notice_invoke_action(
    app: AppHandle,
    registry: State<'_, NoticeRegistry>,
    id: Option<String>,
    action: Option<String>,
) -> Result<(), String> {
    if let Some(id) = id {
        let confirmed = matches!(action.as_deref(), Some("confirm"));
        resolve_notice_action(&registry, &id, confirmed)?;
        if let Some(window) = app.get_webview_window(&notice_window_label(&id)) {
            let _ = window.close();
        }
    }
    Ok(())
}

/// Signal page mounted in notice window.
#[tauri::command]
pub async fn electron_windows_notice_invoke_page_mounted(
    registry: State<'_, NoticeRegistry>,
    id: Option<String>,
) -> Result<Option<NoticePending>, String> {
    pending_notice_for_page(&registry, id)
}

/// Signal page unmounted from notice window.
#[tauri::command]
pub async fn electron_windows_notice_invoke_page_unmounted(
    app: AppHandle,
    registry: State<'_, NoticeRegistry>,
    id: Option<String>,
) -> Result<(), String> {
    if let Some(id) = resolve_notice_unmounted(&registry, id)? {
        if let Some(window) = app.get_webview_window(&notice_window_label(&id)) {
            let _ = window.close();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::oneshot;

    #[test]
    fn page_mounted_returns_registered_pending_notice_payload() {
        let registry = new_notice_registry();
        let (sender, _receiver) = oneshot::channel();
        insert_pending_notice(
            &registry,
            "fade-on-hover".to_string(),
            Some("fade-on-hover".to_string()),
            Some(serde_json::json!({ "source": "controls-island" })),
            sender,
        )
        .unwrap();

        let pending =
            pending_notice_for_page(&registry, Some("fade-on-hover".to_string())).unwrap();

        assert_eq!(
            pending,
            Some(NoticePending {
                id: "fade-on-hover".to_string(),
                r#type: Some("fade-on-hover".to_string()),
                payload: Some(serde_json::json!({ "source": "controls-island" })),
            })
        );
    }

    #[tokio::test]
    async fn notice_action_resolves_and_removes_registered_pending_request() {
        let registry = new_notice_registry();
        let (sender, receiver) = oneshot::channel();
        insert_pending_notice(
            &registry,
            "fade-on-hover".to_string(),
            Some("fade-on-hover".to_string()),
            None,
            sender,
        )
        .unwrap();

        assert!(resolve_notice_action(&registry, "fade-on-hover", true).unwrap());

        assert!(receiver.await.unwrap());
        assert_eq!(
            pending_notice_for_page(&registry, Some("fade-on-hover".to_string())).unwrap(),
            None
        );
    }

    #[test]
    fn generated_notice_ids_are_unique_within_process() {
        let mut ids = std::collections::HashSet::new();
        for _ in 0..64 {
            assert!(ids.insert(generated_notice_id()));
        }
    }
}
