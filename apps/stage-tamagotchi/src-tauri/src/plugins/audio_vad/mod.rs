use log::info;
use tauri::{
  Runtime,
  plugin::{Builder as PluginBuilder, TauriPlugin},
};

use crate::{app::models::load_vad_model, helpers::huggingface::load_device};

#[tauri::command]
pub async fn load_model_silero_vad<R: Runtime>(
  window: tauri::WebviewWindow<R>
) -> Result<(), String> {
  let device = match load_device() {
    Ok(device) => device,
    Err(e) => {
      let error_message = format!("Failed to load device: {}", e);
      info!("{}", error_message);
      return Err(error_message);
    },
  };

  info!("Loading models...");

  if let Err(e) = load_vad_model(device.clone(), window) {
    let error_message = format!("Failed to load VAD model: {}", e);
    info!("{}", error_message);
    return Err(error_message);
  }

  info!("All models loaded successfully");
  Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  PluginBuilder::new("proj-airi-tauri-plugin-audio-vad")
    .setup(|_, _| Ok(()))
    .invoke_handler(tauri::generate_handler![load_model_silero_vad])
    .build()
}
