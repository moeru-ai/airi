use std::collections::HashMap;

use anyhow::Result;
use candle_core::{DType, Device, Tensor};
use candle_onnx::simple_eval;
use hf_hub::{Repo, RepoType};
use tauri::Runtime;

use crate::helpers::huggingface::create_progress_emitter;

pub struct VADProcessor {
  model:        candle_onnx::onnx::ModelProto,
  frame_size:   usize,
  context_size: usize,
  sample_rate:  Tensor,
  state:        Tensor,
  context:      Tensor,
  device:       Device,
  threshold:    f32,
}

impl VADProcessor {
  pub fn new<R: Runtime>(
    device: Device,
    threshold: f32,
    window: tauri::WebviewWindow<R>,
  ) -> Result<Self> {
    let api = hf_hub::api::sync::Api::new()?;
    let repo = api.repo(Repo::with_revision(
      "onnx-community/silero-vad".into(),
      RepoType::Model,
      "main".into(),
    ));

    let model_path = repo.download_with_progress(
      "onnx/model.onnx",
      create_progress_emitter(window.clone(), "onnx/model.onnx".to_string()),
    )?;

    let model = candle_onnx::read_file(model_path)?;

    let sample_rate_value = 16000i64;
    let (frame_size, context_size) = (512, 64);

    Ok(Self {
      model,
      frame_size,
      context_size,
      sample_rate: Tensor::new(sample_rate_value, &device)?,
      state: Tensor::zeros((2, 1, 128), DType::F32, &device)?,
      context: Tensor::zeros((1, context_size), DType::F32, &device)?,
      device,
      threshold,
    })
  }

  pub fn process_chunk(
    &mut self,
    chunk: &[f32],
  ) -> Result<f32> {
    if chunk.len() != self.frame_size {
      return Ok(0.0);
    }

    let next_context = Tensor::from_slice(
      &chunk[self.frame_size - self.context_size..],
      (1, self.context_size),
      &self.device,
    )?;
    let chunk_tensor = Tensor::from_vec(chunk.to_vec(), (1, self.frame_size), &self.device)?;

    let input = Tensor::cat(&[&self.context, &chunk_tensor], 1)?;
    let inputs: HashMap<String, Tensor> = HashMap::from_iter([
      ("input".to_string(), input),
      ("sr".to_string(), self.sample_rate.clone()),
      ("state".to_string(), self.state.clone()),
    ]);

    let outputs = simple_eval(&self.model, inputs)?;
    let graph = self.model.graph.as_ref().unwrap();
    let out_names = &graph.output;

    let output = outputs
      .get(&out_names[0].name)
      .ok_or_else(|| anyhow::anyhow!("Missing VAD output tensor: {}", &out_names[0].name))?
      .clone();

    self.state = outputs
      .get(&out_names[1].name)
      .ok_or_else(|| anyhow::anyhow!("Missing VAD state tensor: {}", &out_names[1].name))?
      .clone();

    self.context = next_context;

    let speech_prob = output.flatten_all()?.to_vec1::<f32>()?[0];
    Ok(speech_prob)
  }

  pub fn is_speech(
    &self,
    prob: f32,
  ) -> bool {
    prob >= self.threshold
  }
}
