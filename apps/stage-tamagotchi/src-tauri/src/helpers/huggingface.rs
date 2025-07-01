use anyhow::Ok;
use log::{error, info};
use tauri::{Emitter, Runtime};

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

pub trait ProgressEmitter: Send + Sync {
  fn emit_progress(
    &self,
    filename: String,
    progress: f32,
  );
}

pub struct ModelLoadProgressEmitter {
  filename:   String,
  size:       usize,
  total_size: usize,
  progress:   f32,
  emitter:    Box<dyn ProgressEmitter>,
}

impl ModelLoadProgressEmitter {
  pub fn new(
    emitter: Box<dyn ProgressEmitter>,
    filename: String,
  ) -> Self {
    Self {
      filename,
      size: 0,
      total_size: 0,
      progress: 0.0,
      emitter,
    }
  }
}

impl<R: Runtime> ProgressEmitter for tauri::WebviewWindow<R> {
  fn emit_progress(
    &self,
    filename: String,
    progress: f32,
  ) {
    if let Err(err) = self.emit("tauri-app:model-load-progress", (filename, progress)) {
      error!("Failed to emit model-load-progress: {:?}", err);
    }
  }
}

pub fn create_progress_emitter(
  window: impl ProgressEmitter + 'static,
  filename: String,
) -> ModelLoadProgressEmitter {
  ModelLoadProgressEmitter::new(Box::new(window), filename)
}

// Remove the generic <R: Runtime> since ModelLoadProgressEmitter no longer has generics
impl hf_hub::api::Progress for ModelLoadProgressEmitter {
  fn init(
    &mut self,
    size: usize,
    _: &str,
  ) {
    self.total_size = size;
    self.progress = 0.0;
    self
      .emitter
      .emit_progress(self.filename.clone(), self.progress);
  }

  fn update(
    &mut self,
    size: usize,
  ) {
    self.size += size;
    self.progress = if self.total_size > 0 {
      (self.size as f32 / self.total_size as f32 * 100.0).min(100.0)
    } else {
      100.0
    };
    self
      .emitter
      .emit_progress(self.filename.clone(), self.progress);
  }

  fn finish(&mut self) {
    self.progress = 100.0;
    self
      .emitter
      .emit_progress(self.filename.clone(), self.progress);
  }
}
