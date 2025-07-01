// https://github.com/proj-airi/candle-examples/blob/3a6783a4788333e7a117f4f8548f02b2fbfec2ed/apps/silero-vad-whisper-realtime/src/whisper.rs
use anyhow::Result;
use byteorder::{ByteOrder, LittleEndian};
use candle_core::{Device, IndexOp, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::whisper::{self as whisper_model, Config, audio};
use clap::ValueEnum;
use hf_hub::{Repo, RepoType, api::sync::ApiBuilder};
use log::info;
use tauri::Runtime;
use tokenizers::Tokenizer;

use crate::helpers::huggingface::create_progress_emitter;

pub enum WhisperModel {
  Normal(whisper_model::model::Whisper),
}

impl WhisperModel {
  pub fn encoder_forward(
    &mut self,
    x: &Tensor,
    flush: bool,
  ) -> candle_core::Result<Tensor> {
    match self {
      Self::Normal(model) => model.encoder.forward(x, flush),
    }
  }

  pub fn decoder_forward(
    &mut self,
    x: &Tensor,
    encoder_out: &Tensor,
    flush: bool,
  ) -> candle_core::Result<Tensor> {
    match self {
      Self::Normal(model) => model.decoder.forward(x, encoder_out, flush),
    }
  }

  pub fn decoder_final_linear(
    &self,
    x: &Tensor,
  ) -> candle_core::Result<Tensor> {
    match self {
      Self::Normal(model) => model.decoder.final_linear(x),
    }
  }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum WhichWhisperModel {
  Tiny,
  #[value(name = "tiny.en")]
  TinyEn,
  Base,
  #[value(name = "base.en")]
  BaseEn,
  Small,
  #[value(name = "small.en")]
  SmallEn,
  Medium,
  #[value(name = "medium.en")]
  MediumEn,
  Large,
  LargeV2,
  LargeV3,
  LargeV3Turbo,
  #[value(name = "distil-medium.en")]
  DistilMediumEn,
  #[value(name = "distil-large-v2")]
  DistilLargeV2,
}

impl WhichWhisperModel {
  pub const fn model_and_revision(self) -> (&'static str, &'static str) {
    match self {
      Self::Tiny => ("openai/whisper-tiny", "main"),
      Self::TinyEn => ("openai/whisper-tiny.en", "refs/pr/15"),
      Self::Base => ("openai/whisper-base", "refs/pr/22"),
      Self::BaseEn => ("openai/whisper-base.en", "refs/pr/13"),
      Self::Small => ("openai/whisper-small", "main"),
      Self::SmallEn => ("openai/whisper-small.en", "refs/pr/10"),
      Self::Medium => ("openai/whisper-medium", "main"),
      Self::MediumEn => ("openai/whisper-medium.en", "main"),
      Self::Large => ("openai/whisper-large", "refs/pr/36"),
      Self::LargeV2 => ("openai/whisper-large-v2", "refs/pr/57"),
      Self::LargeV3 => ("openai/whisper-large-v3", "main"),
      Self::LargeV3Turbo => ("openai/whisper-large-v3-turbo", "main"),
      Self::DistilMediumEn => ("distil-whisper/distil-medium.en", "main"),
      Self::DistilLargeV2 => ("distil-whisper/distil-large-v2", "main"),
    }
  }
}

pub struct Processor {
  pub model:       WhisperModel,
  pub tokenizer:   Tokenizer,
  pub config:      Config,
  pub mel_filters: Vec<f32>,
  pub device:      Device,
}

impl Processor {
  pub fn new<R: Runtime>(
    model: WhichWhisperModel,
    device: Device,
    window: tauri::WebviewWindow<R>,
  ) -> Result<Self> {
    // Load the Whisper model based on the provided model type
    let api = ApiBuilder::new().with_progress(false).build()?;
    let (model_id, revision) = model.model_and_revision();
    let repo = api.repo(Repo::with_revision(
      model_id.to_string(),
      RepoType::Model,
      revision.to_string(),
    ));

    let config_filename = repo.download_with_progress(
      "config.json",
      create_progress_emitter(window.clone(), "config.json".to_string()),
    )?;
    info!("config_filename: {:?}", config_filename.display());
    let tokenizer_filename = repo.download_with_progress(
      "tokenizer.json",
      create_progress_emitter(window.clone(), "tokenizer.json".to_string()),
    )?;
    info!("tokenizer_filename: {:?}", tokenizer_filename.display());
    let model_filename = repo.download_with_progress(
      "model.safetensors",
      create_progress_emitter(window.clone(), "model.safetensors".to_string()),
    )?;
    info!("model_filename: {:?}", model_filename.display());

    let config: Config = serde_json::from_str(&std::fs::read_to_string(config_filename)?)?;
    let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(anyhow::Error::msg)?;

    info!("Loading Whisper model from: {:?}", model_filename.display());

    // SAFETY: This is safe because we are using a mmaped file and the safetensors library guarantees that the data is valid.
    let var_builder = unsafe {
      VarBuilder::from_mmaped_safetensors(&[model_filename], whisper_model::DTYPE, &device)?
    };

    let model = WhisperModel::Normal(whisper_model::model::Whisper::load(
      &var_builder,
      config.clone(),
    )?);

    let mel_bytes = match config.num_mel_bins {
      80 => include_bytes!("./melfilters.bytes").as_slice(),
      128 => include_bytes!("./melfilters128.bytes").as_slice(),
      num_mel_bins => anyhow::bail!("Unsupported number of mel bins: {}", num_mel_bins),
    };

    let mut mel_filters = vec![0f32; mel_bytes.len() / 4];
    <LittleEndian as ByteOrder>::read_f32_into(mel_bytes, &mut mel_filters);

    Ok(Self {
      model,
      tokenizer,
      config,
      mel_filters,
      device,
    })
  }

  pub fn transcribe(
    &mut self,
    audio: &[f32],
  ) -> Result<String> {
    // Convert PCM to mel spectrogram
    let mel = audio::pcm_to_mel(&self.config, audio, &self.mel_filters);
    let mel_len = mel.len();
    let mel = Tensor::from_vec(
      mel,
      (
        1,
        self.config.num_mel_bins,
        mel_len / self.config.num_mel_bins,
      ),
      &self.device,
    )?;

    // Run inference
    let audio_features = self.model.encoder_forward(&mel, true)?;
    // Simple greedy decoding
    let tokens = self.decode_greedy(&audio_features)?;

    let text = self
      .tokenizer
      .decode(&tokens, true)
      .map_err(anyhow::Error::msg)?;

    Ok(text)
  }

  fn decode_greedy(
    &mut self,
    audio_features: &Tensor,
  ) -> Result<Vec<u32>> {
    let mut tokens = vec![
      self.token_id(whisper_model::SOT_TOKEN)?,
      self.token_id(whisper_model::TRANSCRIBE_TOKEN)?,
      self.token_id(whisper_model::NO_TIMESTAMPS_TOKEN)?,
    ];

    let max_len = 50; // Short sequence for real-time processing

    for i in 0..max_len {
      let tokens_t = Tensor::new(tokens.as_slice(), &self.device)?.unsqueeze(0)?;
      let ys = self
        .model
        .decoder_forward(&tokens_t, audio_features, i == 0)?;

      let (_, seq_len, _) = ys.dims3()?;
      let logits = self
        .model
        .decoder_final_linear(&ys.i((..1, seq_len - 1..))?)?
        .i(0)?
        .i(0)?;

      // Get most likely token
      let logits_v: Vec<f32> = logits.to_vec1()?;
      let next_token = logits_v
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.total_cmp(b))
        .map(|(i, _)| u32::try_from(i).unwrap())
        .unwrap();

      if next_token == self.token_id(whisper_model::EOT_TOKEN)? {
        break;
      }

      tokens.push(next_token);
    }

    Ok(tokens)
  }

  fn token_id(
    &self,
    token: &str,
  ) -> Result<u32> {
    self
      .tokenizer
      .token_to_id(token)
      .ok_or_else(|| anyhow::anyhow!("Token not found: {}", token))
  }
}
