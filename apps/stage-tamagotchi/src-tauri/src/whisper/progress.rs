use log::error;
use tauri::Emitter;

#[derive(Clone)]
pub struct ModelLoadProgressEmitterManager {
  window: tauri::Window,
}

impl ModelLoadProgressEmitterManager {
  pub fn new(window: tauri::Window) -> Self {
    Self { window }
  }

  pub fn new_for(
    self,
    filename: &str,
  ) -> ModelLoadProgressEmitter {
    ModelLoadProgressEmitter::new(self.window, filename)
  }
}

pub struct ModelLoadProgressEmitter {
  filename:   String,
  size:       usize,
  total_size: usize,
  progress:   f32,
  window:     tauri::Window,
}

impl ModelLoadProgressEmitter {
  fn new(
    window: tauri::Window,
    filename: &str,
  ) -> Self {
    Self {
      filename: filename.to_string(),
      size: 0,
      total_size: 0,
      progress: 0.0,
      window,
    }
  }
}

impl hf_hub::api::Progress for ModelLoadProgressEmitter {
  fn init(
    &mut self,
    size: usize,
    _: &str,
  ) {
    self.total_size = size;
    self.progress = 0.0;
    self
      .window
      .emit(
        "tauri-app:model-load-progress",
        (self.filename.clone(), self.progress),
      )
      .map_err(|err| {
        error!("Failed to emit model-load-progress: {:?}", err);
      })
      .unwrap();
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
      .window
      .emit(
        "tauri-app:model-load-progress",
        (self.filename.clone(), self.progress),
      )
      .map_err(|err| {
        error!("Failed to emit model-load-progress: {:?}", err);
      })
      .unwrap();
  }

  fn finish(&mut self) {
    self.progress = 100.0;
    self
      .window
      .emit(
        "tauri-app:model-load-progress",
        (self.filename.clone(), self.progress),
      )
      .map_err(|err| {
        error!("Failed to emit model-load-progress: {:?}", err);
      })
      .unwrap();
  }
}
