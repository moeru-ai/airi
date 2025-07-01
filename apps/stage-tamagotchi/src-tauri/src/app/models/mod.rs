pub mod silero_vad;
pub mod whisper;

use log::info;
use tauri::Runtime;

use crate::app::models::{
  silero_vad::VADProcessor,
  whisper::{WhichWhisperModel, WhisperProcessor},
};

pub fn load_whisper_model<R: Runtime>(
  device: candle_core::Device,
  window: tauri::WebviewWindow<R>,
) -> anyhow::Result<()> {
  let whisper_model = WhichWhisperModel::Tiny;
  info!("Loading whisper model: {:?}", whisper_model);
  let _ = WhisperProcessor::new(whisper_model, device.clone(), window)?;
  Ok(())
}

pub fn load_vad_model<R: Runtime>(
  device: candle_core::Device,
  window: tauri::WebviewWindow<R>,
) -> anyhow::Result<()> {
  info!("Loading VAD model");
  let _ = VADProcessor::new(device.clone(), 0.3, window)?;
  Ok(())
}
