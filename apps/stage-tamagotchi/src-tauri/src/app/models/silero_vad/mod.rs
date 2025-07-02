use std::path::PathBuf;

use anyhow::Result;
use hf_hub::Repo;
use log::info;
use ndarray::{Array2, Array3};
use ort::{
  execution_providers::{
    CPUExecutionProvider,
    CUDAExecutionProvider,
    CoreMLExecutionProvider,
    DirectMLExecutionProvider,
  },
  session::{Session, builder::GraphOptimizationLevel},
  value::Tensor,
};
use tauri::Runtime;

use crate::helpers::huggingface::create_progress_emitter;

/// Main Silero VAD model wrapper with hardware acceleration support
pub struct Processor {
  session:         Session,
  context:         Array2<f32>,
  state:           ndarray::Array3<f32>,
  last_batch_size: usize,
  frame_size:      usize,
  context_size:    usize,
  sample_rate:     i64,
}

impl Processor {
  pub fn new<R: Runtime>(
    _device: candle_core::Device,
    window: tauri::WebviewWindow<R>,
  ) -> Result<Self> {
    let model_id = "onnx-community/silero-vad";
    let revision = "main";

    let cache_api = hf_hub::Cache::from_env();
    let cache_repo = cache_api.repo(Repo::with_revision(
      model_id.into(),
      hf_hub::RepoType::Model,
      revision.into(),
    ));

    let api = hf_hub::api::sync::ApiBuilder::new().build()?;
    let repo = api.repo(hf_hub::Repo::with_revision(
      model_id.into(),
      hf_hub::RepoType::Model,
      revision.into(),
    ));

    let model_path_sub_name = "onnx/model.onnx";
    let model_path = match cache_repo.get(model_path_sub_name) {
      Some(path) => path,
      None => repo.download_with_progress(
        model_path_sub_name,
        create_progress_emitter(window.clone(), model_path_sub_name.to_string()),
      )?,
    };

    let session = Self::create_optimized_session(model_path.clone())?;
    let (frame_size, context_size) = (512, 64);

    Ok(Self {
      session,
      context: Array2::zeros((1, context_size)),
      state: Array3::zeros((2, 1, 128)),
      last_batch_size: 0,
      frame_size,
      context_size,
      sample_rate: 16000,
    })
  }

  /// Create an optimized ONNX session with hardware acceleration
  fn create_optimized_session(model_path: PathBuf) -> Result<Session> {
    let builder = Session::builder()?
      .with_optimization_level(GraphOptimizationLevel::Level3)?
      .with_intra_threads(1)?;

    let session = builder
      .with_execution_providers(vec![
        CUDAExecutionProvider::default()
          .with_device_id(0)
          .build(),
        CoreMLExecutionProvider::default().build(),
        DirectMLExecutionProvider::default()
          .with_device_id(0)
          .build(),
        CPUExecutionProvider::default().build(),
      ])?
      .commit_from_file(model_path)?;
    info!("VAD model loaded successfully");

    Ok(session)
  }

  /// Reset the model's internal state
  fn reset_states(
    &mut self,
    batch_size: usize,
  ) {
    self.context = Array2::zeros((batch_size, self.context_size));
    self.state = Array3::zeros((2, batch_size, 128));
  }

  /// Validate input audio chunk
  fn validate_input(
    &self,
    x: &[f32],
  ) -> Result<()> {
    if x.len() != self.frame_size {
      return Err(anyhow::anyhow!(
        "Input chunk must be {} samples, got {}",
        self.frame_size,
        x.len()
      ));
    }
    Ok(())
  }

  /// Process a single audio chunk and return speech probability
  /// This is the main API used by hearing.vue via the audio_vad plugin function
  pub fn process_chunk(
    &mut self,
    chunk: &[f32],
  ) -> Result<f32> {
    self.validate_input(chunk)?;

    let batch_size = 1;
    if self.last_batch_size != batch_size {
      self.reset_states(batch_size);
    }

    // Prepare input tensor by concatenating context and new audio data
    let mut input_data = Vec::with_capacity(self.context_size + chunk.len());
    input_data.extend_from_slice(self.context.row(0).as_slice().unwrap());
    input_data.extend_from_slice(chunk);

    let input_shape = vec![batch_size, input_data.len()];

    // Create input tensors for the ONNX model
    // Silero VAD requires audio input, sample rate, and state
    let inputs = vec![
      (
        "input",
        Tensor::from_array((input_shape.clone(), input_data.clone()))?.into_dyn(),
      ),
      (
        "sr",
        Tensor::from_array(([1], vec![self.sample_rate]))?.into_dyn(),
      ),
      (
        "state",
        Tensor::from_array((vec![2, 1, 128], self.state.as_slice().unwrap().to_vec()))?.into_dyn(),
      ),
    ];

    // Run inference
    let outputs = self.session.run(inputs)?;

    // Update context from the last portion of the input
    let context_start = input_data.len() - self.context_size;
    let new_context_data = input_data[context_start..].to_vec();
    self.context = Array2::from_shape_vec((batch_size, self.context_size), new_context_data)
      .map_err(|e| anyhow::anyhow!("Failed to update context: {}", e))?;

    // Update state from model output
    let (_state_shape, state_data) = outputs[1].try_extract_tensor::<f32>()?;
    self.state = Array3::from_shape_vec((2, 1, 128), state_data.to_vec())
      .map_err(|e| anyhow::anyhow!("Failed to update state: {}", e))?;

    self.last_batch_size = batch_size;

    // Extract speech probability
    let (_shape, data) = outputs[0].try_extract_tensor::<f32>()?;
    let speech_prob = data[0];

    Ok(speech_prob)
  }
}
