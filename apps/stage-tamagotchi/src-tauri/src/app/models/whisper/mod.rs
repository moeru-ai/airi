use anyhow::Result;
use byteorder::{ByteOrder, LittleEndian};
use candle_core::{D, Device, IndexOp, Tensor};
use candle_nn::{VarBuilder, ops::softmax};
use candle_transformers::models::whisper::{self as whisper_model, Config, audio};
use clap::ValueEnum;
use hf_hub::{Repo, RepoType, api::sync::ApiBuilder};
use log::info;
use tauri::Runtime;
use tokenizers::Tokenizer;

use crate::helpers::huggingface::create_progress_emitter;

mod languages;

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

  pub fn reset_kv_cache(&mut self) {
    match self {
      Self::Normal(model) => model.reset_kv_cache(),
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

  pub const fn is_multilingual(self) -> bool {
    match self {
      Self::Tiny
      | Self::Base
      | Self::Small
      | Self::Medium
      | Self::Large
      | Self::LargeV2
      | Self::LargeV3
      | Self::LargeV3Turbo
      | Self::DistilLargeV2 => true,
      Self::TinyEn | Self::BaseEn | Self::SmallEn | Self::MediumEn | Self::DistilMediumEn => false,
    }
  }
}

pub struct Processor {
  pub model:       WhisperModel,
  pub tokenizer:   Tokenizer,
  pub config:      Config,
  pub mel_filters: Vec<f32>,
  pub device:      Device,
  pub model_type:  WhichWhisperModel,

  // Special tokens
  pub sot_token:           u32,
  pub transcribe_token:    u32,
  pub translate_token:     u32,
  pub eot_token:           u32,
  pub no_timestamps_token: u32,
  pub suppress_tokens:     Tensor,
}

impl Processor {
  pub fn new<R: Runtime>(
    model_type: WhichWhisperModel,
    device: Device,
    window: tauri::WebviewWindow<R>,
  ) -> Result<Self> {
    let (model_id, revision) = model_type.model_and_revision();

    let cache_api = hf_hub::Cache::from_env();
    let cache_repo = cache_api.repo(Repo::with_revision(
      model_id.to_string(),
      RepoType::Model,
      revision.to_string(),
    ));

    let api = ApiBuilder::new().with_progress(false).build()?;
    let repo = api.repo(Repo::with_revision(
      model_id.to_string(),
      RepoType::Model,
      revision.to_string(),
    ));

    let config_filename_sub_name = "config.json";
    let config_filename = match cache_repo.get(config_filename_sub_name) {
      None => repo.download_with_progress(
        config_filename_sub_name,
        create_progress_emitter(window.clone(), config_filename_sub_name.to_string()),
      )?,
      Some(p) => p,
    };
    info!("config_filename: {:?}", config_filename.display());

    let tokenizer_filename_sub_name = "tokenizer.json";
    let tokenizer_filename = match cache_repo.get(tokenizer_filename_sub_name) {
      None => repo.download_with_progress(
        tokenizer_filename_sub_name,
        create_progress_emitter(window.clone(), tokenizer_filename_sub_name.to_string()),
      )?,
      Some(p) => p,
    };
    info!("tokenizer_filename: {:?}", tokenizer_filename.display());

    let model_filename_sub_name = "model.safetensors";
    let model_filename = match cache_repo.get(model_filename_sub_name) {
      None => repo.download_with_progress(
        model_filename_sub_name,
        create_progress_emitter(window.clone(), model_filename_sub_name.to_string()),
      )?,
      Some(p) => p,
    };
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

    // Initialize special tokens
    let sot_token = Self::token_id_static(&tokenizer, whisper_model::SOT_TOKEN)?;
    let transcribe_token = Self::token_id_static(&tokenizer, whisper_model::TRANSCRIBE_TOKEN)?;
    let translate_token = Self::token_id_static(&tokenizer, whisper_model::TRANSLATE_TOKEN)?;
    let eot_token = Self::token_id_static(&tokenizer, whisper_model::EOT_TOKEN)?;
    let no_timestamps_token =
      Self::token_id_static(&tokenizer, whisper_model::NO_TIMESTAMPS_TOKEN)?;

    // Create suppress tokens
    let suppress_values: Vec<f32> = (0..config.vocab_size as u32)
      .map(|i| {
        if config.suppress_tokens.contains(&i) {
          f32::NEG_INFINITY
        } else {
          0.0f32
        }
      })
      .collect();

    let suppress_tokens = Tensor::new(suppress_values.as_slice(), &device)?;

    Ok(Self {
      model,
      tokenizer,
      config,
      mel_filters,
      device,
      model_type,
      sot_token,
      transcribe_token,
      translate_token,
      eot_token,
      no_timestamps_token,
      suppress_tokens,
    })
  }

  pub fn transcribe(
    &mut self,
    audio: &[f32],
    language: Option<&str>,
  ) -> Result<(String, String)> {
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

    // Get language token - either specified or detected
    let (language_token, detected_language) = match language {
      Some(lang) => {
        let token = self.get_language_token(lang)?;
        (Some(token), lang.to_string())
      },
      None => {
        if self.model_type.is_multilingual() {
          let (token, lang) = self.detect_language(&mel)?;
          (Some(token), lang)
        } else {
          // English-only models don't use language tokens
          (None, "english".to_string())
        }
      },
    };

    // Run encoder
    let audio_features = self.model.encoder_forward(&mel, true)?;

    // Decode with the determined language
    let tokens = self.decode_whisper_with_language_token(&audio_features, language_token)?;

    // Filter out special tokens
    let filtered_tokens: Vec<u32> = tokens
      .into_iter()
      .filter(|&token| !self.is_special_token(token))
      .collect();

    let text = self
      .tokenizer
      .decode(&filtered_tokens, true)
      .map_err(anyhow::Error::msg)?;

    // Reset KV cache for next inference
    self.model.reset_kv_cache();

    Ok((text.trim().to_string(), detected_language))
  }

  fn detect_language(
    &mut self,
    mel: &Tensor,
  ) -> Result<(u32, String)> {
    let (_bsize, _, seq_len) = mel.dims3()?;
    let mel = mel.narrow(2, 0, usize::min(seq_len, self.config.max_source_positions))?;
    let device = mel.device();

    // Get all language token IDs
    let language_token_ids = languages::LANGUAGES
      .iter()
      .map(|(code, _)| Self::token_id_static(&self.tokenizer, &format!("<|{}|>", code)))
      .collect::<Result<Vec<_>, _>>()?;

    let audio_features = self.model.encoder_forward(&mel, true)?;
    let tokens = Tensor::new(&[[self.sot_token]], device)?;
    let language_token_ids_tensor = Tensor::new(language_token_ids.as_slice(), device)?;

    let ys = self
      .model
      .decoder_forward(&tokens, &audio_features, true)?;
    let logits = self
      .model
      .decoder_final_linear(&ys.i(..1)?)?
      .i(0)?
      .i(0)?;

    // Get logits for language tokens only
    let logits = logits.index_select(&language_token_ids_tensor, 0)?;
    let probs = softmax(&logits, D::Minus1)?;
    let probs = probs.to_vec1::<f32>()?;

    // Combine with language info and sort by probability
    let mut language_probs = languages::LANGUAGES
      .iter()
      .zip(probs.iter())
      .collect::<Vec<_>>();

    language_probs.sort_by(|(_, p1), (_, p2)| p2.total_cmp(p1));

    // Log top 5 detected languages
    info!("Language detection results:");
    for ((_, name), prob) in language_probs.iter().take(5) {
      info!("  {}: {:.3}", name, prob);
    }

    // Return the most likely language
    let best_language = language_probs[0].0;
    let language_token =
      Self::token_id_static(&self.tokenizer, &format!("<|{}|>", best_language.0))?;

    Ok((language_token, best_language.1.to_string()))
  }

  fn get_language_token(
    &self,
    language: &str,
  ) -> Result<u32> {
    let language_lower = language.to_lowercase();

    // Check if it's a language code or name
    for (code, name) in languages::LANGUAGES.iter() {
      if code == &language_lower || name == &language_lower {
        let token = format!("<|{}|>", code);
        return Self::token_id_static(&self.tokenizer, &token);
      }
    }

    anyhow::bail!("Unsupported language: {}", language)
  }

  fn decode_whisper_with_language_token(
    &mut self,
    audio_features: &Tensor,
    language_token: Option<u32>,
  ) -> Result<Vec<u32>> {
    // Initialize with proper Whisper token sequence
    let mut tokens = vec![self.sot_token];

    // Add language token if provided (for multilingual models)
    if let Some(lang_token) = language_token {
      tokens.push(lang_token);
    }

    tokens.push(self.transcribe_token);
    tokens.push(self.no_timestamps_token);

    let max_len = 200;

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

      // Apply suppression tokens
      let logits = logits.broadcast_add(&self.suppress_tokens)?;

      // Apply softmax and get most likely token
      let probs = softmax(&logits, 0)?;
      let probs_vec: Vec<f32> = probs.to_vec1()?;

      let next_token = probs_vec
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.total_cmp(b))
        .map(|(i, _)| i as u32)
        .unwrap();

      tokens.push(next_token);

      if next_token == self.eot_token {
        break;
      }
    }

    Ok(tokens)
  }

  fn is_special_token(
    &self,
    token: u32,
  ) -> bool {
    // Check basic special tokens
    if token == self.sot_token
      || token == self.eot_token
      || token == self.transcribe_token
      || token == self.translate_token
      || token == self.no_timestamps_token
    {
      return true;
    }

    // Check if it's a language token
    for (code, _) in languages::LANGUAGES.iter() {
      if let Ok(lang_token) = Self::token_id_static(&self.tokenizer, &format!("<|{}|>", code)) {
        if token == lang_token {
          return true;
        }
      }
    }

    false
  }

  fn token_id_static(
    tokenizer: &Tokenizer,
    token: &str,
  ) -> Result<u32> {
    tokenizer
      .token_to_id(token)
      .ok_or_else(|| anyhow::anyhow!("Token not found: {}", token))
  }
}
