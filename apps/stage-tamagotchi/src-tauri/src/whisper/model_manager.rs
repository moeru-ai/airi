use log::info;
use anyhow::Ok;

use crate::whisper::whisper::{WhichWhisperModel, WhisperProcessor};
use crate::whisper::progress::ModelLoadProgressEmitterManager;
use crate::whisper::vad::VADProcessor;

pub fn load_device() -> anyhow::Result<candle_core::Device> {
  // Determine device to use
  let device = if candle_core::utils::cuda_is_available() {
    candle_core::Device::new_cuda(0)?
  } else if candle_core::utils::metal_is_available() {
    candle_core::Device::new_metal(0)?
  } else {
    candle_core::Device::Cpu
  };

  info!("Using device: {device:?}");
  Ok(device)
}


pub fn load_whisper_model(window: tauri::Window, device: candle_core::Device) -> anyhow::Result<()> {
  let progress_manager = ModelLoadProgressEmitterManager::new(window);

  let whisper_model = WhichWhisperModel::Tiny;

  info!("Loading whisper model: {:?}", whisper_model);

  let _ = WhisperProcessor::new(whisper_model, device.clone(), progress_manager)?;
  Ok(())
}

pub fn load_vad_model(window: tauri::Window, device: candle_core::Device) -> anyhow::Result<()> {
  let progress_manager = ModelLoadProgressEmitterManager::new(window);

  let whisper_model = WhichWhisperModel::Tiny;

  info!("Loading VAD model: {:?}", whisper_model);

  let _ = VADProcessor::new(device.clone(), 0.3, progress_manager)?;
  Ok(())
}
