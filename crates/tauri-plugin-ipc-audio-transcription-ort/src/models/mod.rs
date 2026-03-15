pub mod whisper;

use log::info;
use ort::execution_providers::{CUDAExecutionProvider, CoreMLExecutionProvider, ExecutionProvider};
use tauri::Runtime;

pub fn new_whisper_processor<R: Runtime>(
  window: tauri::WebviewWindow<R>,
  model_type: Option<whisper::whisper::WhichModel>,
) -> anyhow::Result<whisper::whisper::WhisperPipeline> {
  let cuda = CUDAExecutionProvider::default().with_device_id(0);
  let coreml = CoreMLExecutionProvider::default();

  let whisper_model = model_type.unwrap_or_else(|| {
    if cuda.is_available().unwrap_or(false) {
      whisper::whisper::WhichModel::LargeV3
    } else if coreml.is_available().unwrap_or(false) {
      whisper::whisper::WhichModel::Base
    } else {
      whisper::whisper::WhichModel::Tiny
    }
  });

  info!("Loading whisper model: {:?}", whisper_model);
  let (model_id, revision) = whisper_model.model_and_revision();
  whisper::whisper::WhisperPipeline::new(whisper_model, model_id, revision, window)
}
