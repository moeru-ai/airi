use std::sync::Mutex;

use log::info;
use tauri::{
  Manager,
  Runtime,
  plugin::{Builder as PluginBuilder, TauriPlugin},
};

mod helpers;
mod models;

use crate::models::{
  new_silero_vad_processor,
  silero_vad::{VADInferenceInput, VADInferenceResult},
};

#[derive(Default)]
struct AppDataSileroVadProcessor {
  silero_vad_processor: Option<crate::models::silero_vad::Processor>,
}

#[tauri::command]
async fn load_ort_model_silero_vad<R: Runtime>(
  app: tauri::AppHandle<R>,
  window: tauri::WebviewWindow<R>,
) -> Result<(), String> {
  info!("Loading models...");

  {
    let data = app.state::<Mutex<AppDataSileroVadProcessor>>();
    let data = data.lock().unwrap();
    if data.silero_vad_processor.is_some() {
      info!("Silero VAD model already loaded, skipping...");
      return Ok(());
    }
  }

  match new_silero_vad_processor(window) {
    Ok(p) => {
      let data = app.state::<Mutex<AppDataSileroVadProcessor>>();
      let mut data = data.lock().unwrap();
      data.silero_vad_processor = Some(p);
      info!("Silero VAD model loaded successfully");
    },
    Err(e) => {
      let error_message = format!("Failed to load Silero VAD model: {}", e);
      info!("{}", error_message);
      return Err(error_message);
    },
  }

  info!("All models loaded successfully");
  Ok(())
}

#[tauri::command]
async fn ipc_audio_vad<R: Runtime>(
  app: tauri::AppHandle<R>,
  input_data: VADInferenceInput,
) -> Result<VADInferenceResult, String> {
  let data = app.state::<Mutex<AppDataSileroVadProcessor>>();
  let data = data.lock().unwrap();

  if let Some(processor) = &data.silero_vad_processor {
    processor
      .inference(input_data)
      .map_err(|e| e.to_string())
  } else {
    Err("Silero VAD model is not loaded".to_string())
  }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  PluginBuilder::new("ipc-audio-vad-ort")
    .setup(|app, _| {
      info!("Initializing audio VAD plugin...");
      app.manage(Mutex::new(AppDataSileroVadProcessor::default()));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      load_ort_model_silero_vad,
      ipc_audio_vad
    ])
    .build()
}
