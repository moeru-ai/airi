pub mod silero_vad;
pub mod whisper;

use candle_core::Device;
use log::info;
use tauri::Runtime;

use crate::{app::models::whisper::WhichWhisperModel, helpers::huggingface::load_device};

pub fn new_whisper_processor<R: Runtime>(
  window: tauri::WebviewWindow<R>
) -> anyhow::Result<whisper::Processor> {
  let device = load_device().map_err(|err| anyhow::anyhow!("Failed to load device: {}", err))?;
  let whisper_model = WhichWhisperModel::Tiny;
  info!("Loading whisper model: {:?}", whisper_model);
  whisper::Processor::new(whisper_model, device.clone(), window)
}

pub fn new_silero_vad_processor<R: Runtime>(
  window: tauri::WebviewWindow<R>
) -> anyhow::Result<silero_vad::Processor> {
  info!("Loading VAD model");
  silero_vad::Processor::new(Device::Cpu, window)
}
