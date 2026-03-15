pub mod silero_vad;
use log::info;
use tauri::Runtime;

pub fn new_silero_vad_processor<R: Runtime>(
  window: tauri::WebviewWindow<R>
) -> anyhow::Result<silero_vad::Processor> {
  info!("Loading VAD model");
  silero_vad::Processor::new(window)
}
