use std::{path::PathBuf, sync::Arc};

use anyhow::Result;
use hf_hub::Repo;
use log::info;
use ort::{
  execution_providers::{
    CPUExecutionProvider,
    CUDAExecutionProvider,
    CoreMLExecutionProvider,
    DirectMLExecutionProvider,
  },
  session::{Session, builder::GraphOptimizationLevel},
  util::Mutex,
  value::Tensor,
};
use serde::{Deserialize, Serialize};
use tauri::Runtime;

use crate::helpers::huggingface::create_progress_emitter;

#[derive(Serialize, Deserialize, Clone)]
pub struct VADInferenceResult {
  pub output: Vec<f32>, // Speech probability output
  pub state:  Vec<f32>, // Updated state for next inference
}

#[derive(Serialize, Deserialize, Clone)]
pub struct VADInferenceInput {
  pub input: Vec<f32>, // Audio input buffer
  pub sr:    i64,      // Sample rate
  pub state: Vec<f32>, // Current state
}

pub struct Processor {
  session: Arc<Mutex<Session>>,
}

impl Processor {
  pub fn new<R: Runtime>(window: tauri::WebviewWindow<R>) -> Result<Self> {
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
        create_progress_emitter(
          window.clone(),
          "tauri-plugins:tauri-plugin-ipc-audio-vad-ort:load-model-silero-vad-progress",
          model_path_sub_name.to_string(),
        ),
      )?,
    };

    let session = Self::create_optimized_session(model_path.clone())?;

    Ok(Self {
      session: Arc::new(Mutex::new(session)),
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

  /// Stateless inference that matches JavaScript interface
  /// Returns both output and updated state like the JS version
  pub fn inference(
    &self,
    input_data: VADInferenceInput,
  ) -> Result<VADInferenceResult> {
    // Validate input dimensions
    if input_data.state.len() != 2 * 1 * 128 {
      return Err(anyhow::anyhow!(
        "State must have 256 elements (2*1*128), got {}",
        input_data.state.len()
      ));
    }

    // Create input tensors for the ONNX model
    let inputs = vec![
      (
        "input",
        Tensor::from_array((vec![1, input_data.input.len()], input_data.input.clone()))?.into_dyn(),
      ),
      (
        "sr",
        Tensor::from_array(([1], vec![input_data.sr]))?.into_dyn(),
      ),
      (
        "state",
        Tensor::from_array((vec![2, 1, 128], input_data.state.clone()))?.into_dyn(),
      ),
    ];

    // Run inference and extract data while session is still locked
    let (state_data, speech_data) = {
      let mut session = self.session.lock();
      let outputs = session.run(inputs)?;

      // Extract and clone the data immediately while session is locked
      let (_state_shape, state_slice) = outputs[1].try_extract_tensor::<f32>()?;
      let (_speech_shape, speech_slice) = outputs[0].try_extract_tensor::<f32>()?;

      // Clone the data to owned vectors before the session lock is released
      (state_slice.to_vec(), speech_slice.to_vec())
    };

    Ok(VADInferenceResult {
      output: speech_data,
      state:  state_data,
    })
  }
}
