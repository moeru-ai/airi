use log::error;
use tauri::{Emitter, Runtime};

pub trait ProgressEmitter: Send + Sync {
  fn emit_progress(
    &self,
    event_name: String,
    filename: String,
    progress: f32,
    total_size: usize,
    current_size: usize,
  );

  fn emit_done(
    &self,
    event_name: String,
    filename: String,
  );
}

pub struct ModelLoadProgressEmitter {
  event_name: String,
  filename:   String,
  size:       usize,
  total_size: usize,
  progress:   f32,
  emitter:    Box<dyn ProgressEmitter>,
}

impl ModelLoadProgressEmitter {
  pub fn new(
    emitter: Box<dyn ProgressEmitter>,
    event_name: &str,
    filename: String,
  ) -> Self {
    Self {
      event_name: event_name.to_string(),
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
    event_name: String,
    filename: String,
    progress: f32,
    total_size: usize,
    current_size: usize,
  ) {
    if let Err(err) = self.emit(
      event_name.as_str(),
      (false, filename, progress, total_size, current_size),
    ) {
      error!("Failed to emit model-load-progress: {:?}", err);
    }
  }

  fn emit_done(
    &self,
    event_name: String,
    filename: String,
  ) {
    if let Err(err) = self.emit(event_name.as_str(), (true, filename, 100.0)) {
      error!("Failed to emit model-load-done: {:?}", err);
    }
  }
}

pub fn create_progress_emitter(
  window: impl ProgressEmitter + 'static,
  event_name: &str,
  filename: String,
) -> ModelLoadProgressEmitter {
  ModelLoadProgressEmitter::new(Box::new(window), event_name, filename)
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
    self.emitter.emit_progress(
      self.event_name.clone(),
      self.filename.clone(),
      self.progress,
      self.total_size,
      self.size,
    );
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
    self.emitter.emit_progress(
      self.event_name.clone(),
      self.filename.clone(),
      self.progress,
      self.total_size,
      self.size,
    );
  }

  fn finish(&mut self) {
    self.progress = 100.0;
    self.emitter.emit_progress(
      self.event_name.clone(),
      self.filename.clone(),
      self.progress,
      self.total_size,
      self.size,
    );
    self
      .emitter
      .emit_done(self.event_name.clone(), self.filename.clone());
  }
}
