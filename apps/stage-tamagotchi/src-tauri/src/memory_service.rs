//! Memory service: embedded Axum HTTP server at 127.0.0.1:3001.
//! This module mirrors the minimal REST API you used in Node/Express:
//! - GET  /healthz
//! - GET  /api/settings
//! - POST /api/settings
//! - POST /api/embedded-postgres
//! - GET  /api/settings/regeneration-status
//! - POST /api/export-embedded
//!
//! Replace in-memory stubs with your real persistence/DB logic as needed.

use axum::{
  extract::State,
  response::IntoResponse,
  routing::{get, post},
  Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, time::Duration};
use thiserror::Error;
use tokio::sync::{Mutex, oneshot};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use which::which;

/// Shared application state for handlers (replace with real storage/services).
#[derive(Clone, Default)]
pub struct AppState {
  inner: std::sync::Arc<InnerState>,
}

#[derive(Default)]
struct InnerState {
  settings: Mutex<Settings>,
  regen: Mutex<RegenStatus>,
}

/// Settings shape expected by the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
  pub embeddedPostgres: bool,
  pub llmProvider: String,
  pub llmModel: String,
  pub llmApiKey: String,
  pub llmTemperature: f32,
  pub llmMaxTokens: u32,
  pub embeddingProvider: String,
  pub embeddingModel: String,
  pub embeddingApiKey: String,
  pub embeddingDimensions: u32,
}

impl Default for Settings {
  fn default() -> Self {
    Self {
      embeddedPostgres: false,
      llmProvider: "".into(),
      llmModel: "".into(),
      llmApiKey: "".into(),
      llmTemperature: 0.7,
      llmMaxTokens: 1024,
      embeddingProvider: "".into(),
      embeddingModel: "".into(),
      embeddingApiKey: "".into(),
      embeddingDimensions: 1536,
    }
  }
}

/// Regeneration status returned to the UI (stub).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegenStatus {
  pub isRegenerating: bool,
  pub progress: u32,               // 0..=100
  pub totalItems: u32,
  pub processedItems: u32,
  pub avgBatchTimeMs: u64,
  pub lastBatchTimeMs: u64,
  pub currentBatchSize: u32,
  pub estimatedTimeRemaining: u64, // ms
}

impl Default for RegenStatus {
  fn default() -> Self {
    Self {
      isRegenerating: false,
      progress: 0,
      totalItems: 0,
      processedItems: 0,
      avgBatchTimeMs: 0,
      lastBatchTimeMs: 0,
      currentBatchSize: 50,
      estimatedTimeRemaining: 0,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToggleEP {
  pub enabled: bool,
}

/// Starts an Axum HTTP server on 127.0.0.1:<port>.
/// Returns a oneshot Sender to trigger graceful shutdown.

pub async fn start_http(port: u16) -> oneshot::Sender<()> {
  let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any)
    .allow_headers(Any);

  let state = AppState::default();
  let app = Router::new()
    .route("/healthz", get(handler_healthz))
    .route("/api/settings", get(handler_get_settings).post(handler_post_settings))
    .route("/api/embedded-postgres", post(handler_toggle_embedded_pg))
    .route("/api/settings/regeneration-status", get(handler_get_regen_status))
    .route("/api/export-embedded", post(handler_export_embedded))
    .with_state(state)
    .layer(cors);

  let addr = format!("127.0.0.1:{port}");
  let (tx, rx) = oneshot::channel::<()>();

  tokio::spawn(async move {
    let listener = match TcpListener::bind(&addr).await {
      Ok(l) => l,
      Err(e) => {
        eprintln!("[memory-service] bind error on {}: {e}", addr);
        return;
      }
    };

    let server = axum::serve(listener, app.into_make_service())
      .with_graceful_shutdown(async {
        let _ = rx.await;
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
      });

    if let Err(e) = server.await {
      eprintln!("[memory-service] server error: {e:?}");
    }
  });

  tx
}

async fn handler_healthz() -> impl IntoResponse { "OK" }

async fn handler_get_settings(State(state): State<AppState>) -> impl IntoResponse {
  let s = state.inner.settings.lock().await.clone();
  Json(s)
}

async fn handler_post_settings(
  State(state): State<AppState>,
  Json(next): Json<Settings>,
) -> impl IntoResponse {
  *state.inner.settings.lock().await = next;
  Json(serde_json::json!({ "ok": true }))
}

async fn handler_toggle_embedded_pg(
  State(state): State<AppState>,
  Json(payload): Json<ToggleEP>,
) -> impl IntoResponse {
  let mut s = state.inner.settings.lock().await;
  s.embeddedPostgres = payload.enabled;
  Json(serde_json::json!({ "ok": true, "enabled": payload.enabled }))
}

async fn handler_get_regen_status(State(state): State<AppState>) -> impl IntoResponse {
  let st = state.inner.regen.lock().await.clone();
  Json(st)
}

#[derive(Debug, Error)]
enum ExportError {
  #[error("pg_dump not found in PATH")]
  PgDumpNotFound,
  #[error("spawn failed: {0}")]
  Spawn(String),
}

/// POST /api/export-embedded
/// Runs `pg_dump` and writes `~/airi_memory/embedded_pg_backup.sql`.
async fn handler_export_embedded() -> impl IntoResponse {
  let db_url = std::env::var("DATABASE_URL")
    .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5434/postgres".to_string());

  let home = dirs::home_dir().unwrap_or(std::env::current_dir().unwrap());
  let export_dir = home.join("airi_memory");
  let dump_path = export_dir.join("embedded_pg_backup.sql");

  if let Err(e) = export_backup(&db_url, &export_dir, &dump_path).await {
    return Json(serde_json::json!({ "ok": false, "error": e.to_string() }));
  }
  Json(serde_json::json!({ "ok": true, "path": dump_path }))
}

async fn export_backup(db_url: &str, export_dir: &std::path::Path, dump_path: &std::path::Path)
  -> Result<(), ExportError>
{
  tokio::fs::create_dir_all(export_dir)
    .await
    .map_err(|e| ExportError::Spawn(format!("mkdir failed: {e}")))?;

  let pg_dump = which("pg_dump").map_err(|_| ExportError::PgDumpNotFound)?;

  let status = tokio::process::Command::new(pg_dump)
    .arg(db_url)
    .arg("-f").arg(dump_path)
    .status()
    .await
    .map_err(|e| ExportError::Spawn(format!("spawn failed: {e}")))?;

  if !status.success() {
    return Err(ExportError::Spawn(format!("pg_dump exit status: {status:?}")));
  }
  Ok(())
}

