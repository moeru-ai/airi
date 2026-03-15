use std::sync::Mutex;

use clap::ValueEnum;
use log::info;
use tauri::{
  Manager,
  Runtime,
  plugin::{Builder as PluginBuilder, TauriPlugin},
};

mod helpers;
mod models;

#[derive(Default)]
struct AppDataWhisperProcessor {
  whisper_processor: Option<models::whisper::whisper::WhisperPipeline>,
}

use crate::models::{
  new_whisper_processor,
  whisper::{self, whisper::WhichModel},
};

#[tauri::command]
async fn load_ort_model_whisper<R: Runtime>(
  app: tauri::AppHandle<R>,
  window: tauri::WebviewWindow<R>,
  model_type: Option<String>,
) -> Result<(), String> {
  info!("Loading models...");

  {
    let data = app.state::<Mutex<AppDataWhisperProcessor>>();
    let data = data.lock().unwrap();
    if data.whisper_processor.is_some() {
      info!("Whisper model already loaded, skipping...");
      return Ok(());
    }
  }

  // Load the traditional whisper models first
  match new_whisper_processor(
    window,
    Some(WhichModel::from_str(
      model_type
        .unwrap_or_else(|| "medium".to_string())
        .as_str(),
      true,
    )?),
  ) {
    Ok(p) => {
      let data = app.state::<Mutex<AppDataWhisperProcessor>>();
      let mut data = data.lock().unwrap();
      data.whisper_processor = Some(p);
      info!("Whisper model loaded successfully");
    },
    Err(e) => {
      let error_message = format!("Failed to load Whisper model: {}", e);
      info!("{}", error_message);
      return Err(error_message);
    },
  }

  info!("All models loaded successfully");
  Ok(())
}

#[tauri::command]
async fn ipc_audio_transcription<R: Runtime>(
  app: tauri::AppHandle<R>,
  chunk: Vec<f32>,
  language: Option<String>,
) -> Result<String, String> {
  info!("Processing audio transcription...");

  let data = app.state::<Mutex<AppDataWhisperProcessor>>();

  // Check if processor exists first
  {
    let data = data.lock().unwrap();
    if data.whisper_processor.is_none() {
      return Err("Whisper model is not loaded".to_string());
    }
  }

  // Then mutable borrow
  let mut data = data.lock().unwrap();
  let processor = data.whisper_processor.as_mut().unwrap();

  let mut config = whisper::whisper::GenerationConfig::default();
  config.language = language;

  let transcription = processor
    .transcribe(chunk.as_slice(), &config)
    .map_err(|e| e.to_string())?;

  info!("Transcription completed: {}", transcription);

  Ok(transcription)
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  PluginBuilder::new("ipc-audio-transcription-ort")
    .setup(|app, _| {
      info!("Initializing audio transcription plugin...");
      app.manage(Mutex::new(AppDataWhisperProcessor::default()));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      load_ort_model_whisper,
      ipc_audio_transcription,
    ])
    .build()
}
