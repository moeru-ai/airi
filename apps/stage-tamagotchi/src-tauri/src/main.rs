// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod memory_service;

use memory_service::start_http;
use once_cell::sync::Lazy;
use std::{sync::Mutex, thread};
use tokio::runtime::Builder as RtBuilder;
use tokio::sync::oneshot::Sender;

// Global shutdown handle shared between main thread and server thread.
static SHUTDOWN_TX: Lazy<Mutex<Option<Sender<()>>>> = Lazy::new(|| Mutex::new(None));

fn main() {
  // 1) Spawn a dedicated thread with its own Tokio runtime for the Axum server.
  let server_thread = thread::spawn(|| {
    // Create an independent multi-thread Tokio runtime for the server.
    let rt = RtBuilder::new_multi_thread()
      .enable_all()
      .thread_name("memory-svc-rt")
      .build()
      .expect("Failed to build Tokio runtime for memory service");

    // Start the HTTP server on 127.0.0.1:3001 and store the shutdown sender.
    rt.block_on(async {
      let tx = start_http(3001).await;
      *SHUTDOWN_TX.lock().unwrap() = Some(tx);
    });

    // Keep the runtime alive until we receive shutdown (main will send it).
    // Parking the thread is enough; when shutdown is sent, the server task exits,
    // and we simply return to let this thread join.
    // If you need a more explicit wait, you can use a channel here.
    // For simplicity, just park until main un-parks us after shutdown.
    thread::park();

    // After unpark, drop the runtime (will wait for all tasks to finish).
    // rt drops here automatically at end of scope.
  });

  // 2) Run the original application (Tauri, etc.)
  //    This preserves existing behavior completely.
  app_lib::run();

  // 3) On app exit, trigger graceful shutdown for the HTTP server and join thread.
  if let Some(tx) = SHUTDOWN_TX.lock().unwrap().take() {
    let _ = tx.send(());
  }

  // Unpark the server thread so it can exit cleanly.
  server_thread.thread().unpark();
  let _ = server_thread.join();
}

