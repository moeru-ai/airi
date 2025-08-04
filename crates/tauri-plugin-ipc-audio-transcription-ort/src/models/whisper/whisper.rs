use std::{borrow::Cow, collections::HashMap, path::PathBuf};

use anyhow::{Result, anyhow};
use clap::ValueEnum;
use hf_hub::{
  Repo,
  RepoType,
  api::sync::{Api, ApiBuilder},
};
use ndarray::{Array2, ArrayView3, Axis, s};
use ort::{
  execution_providers::{
    CPUExecutionProvider,
    CUDAExecutionProvider,
    CoreMLExecutionProvider,
    DirectMLExecutionProvider,
  },
  session::{Session, SessionInputValue, builder::GraphOptimizationLevel},
  value::Value,
};
use serde::Deserialize;
use tauri::Runtime;
use tokenizers::Tokenizer;

use super::whisper_processor::WhisperProcessor;
use crate::helpers::huggingface::create_progress_emitter;

// Helper function to provide a default value of true for serde
const fn default_true() -> bool {
  true
}

#[derive(Deserialize, Debug)]
pub struct WhisperConfig {
  pub num_mel_bins:           i64,
  pub decoder_start_token_id: i64,
  pub eos_token_id:           i64,
  // Corrected: Use serde default for missing is_multilingual field
  #[serde(default = "default_true")]
  pub is_multilingual:        bool,
  #[serde(default)]
  pub no_timestamps_token_id: Option<i64>,
  #[serde(default)]
  pub lang_to_id:             HashMap<String, i64>,
}

#[derive(Debug)]
pub struct GenerationConfig {
  pub language:          Option<String>,
  pub task:              String,
  pub return_timestamps: bool,
  pub max_new_tokens:    usize,
}

impl Default for GenerationConfig {
  fn default() -> Self {
    Self {
      language:          Some("en".to_string()),
      task:              "transcribe".to_string(),
      return_timestamps: true,
      max_new_tokens:    128,
    }
  }
}

static WHISPER_LANGUAGES: std::sync::LazyLock<HashMap<&'static str, &'static str>> =
  std::sync::LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert("en", "english");
    m.insert("zh", "chinese");
    m.insert("de", "german");
    m.insert("es", "spanish");
    m.insert("ru", "russian");
    m.insert("ko", "korean");
    m.insert("fr", "french");
    m.insert("ja", "japanese");
    m.insert("pt", "portuguese");
    m.insert("tr", "turkish");
    m.insert("pl", "polish");
    m.insert("ca", "catalan");
    m.insert("nl", "dutch");
    m.insert("ar", "arabic");
    m.insert("sv", "swedish");
    m.insert("it", "italian");
    m.insert("id", "indonesian");
    m.insert("hi", "hindi");
    m.insert("fi", "finnish");
    m.insert("vi", "vietnamese");
    m.insert("he", "hebrew");
    m.insert("uk", "ukrainian");
    m.insert("el", "greek");
    m.insert("ms", "malay");
    m.insert("cs", "czech");
    m.insert("ro", "romanian");
    m.insert("da", "danish");
    m.insert("hu", "hungarian");
    m.insert("ta", "tamil");
    m.insert("no", "norwegian");
    m.insert("th", "thai");
    m.insert("ur", "urdu");
    m.insert("hr", "croatian");
    m.insert("bg", "bulgarian");
    m.insert("lt", "lithuanian");
    m.insert("la", "latin");
    m.insert("mi", "maori");
    m.insert("ml", "malayalam");
    m.insert("cy", "welsh");
    m.insert("sk", "slovak");
    m.insert("te", "telugu");
    m.insert("fa", "persian");
    m.insert("lv", "latvian");
    m.insert("bn", "bengali");
    m.insert("sr", "serbian");
    m.insert("az", "azerbaijani");
    m.insert("sl", "slovenian");
    m.insert("kn", "kannada");
    m.insert("et", "estonian");
    m.insert("mk", "macedonian");
    m.insert("br", "breton");
    m.insert("eu", "basque");
    m.insert("is", "icelandic");
    m.insert("hy", "armenian");
    m.insert("ne", "nepali");
    m.insert("mn", "mongolian");
    m.insert("bs", "bosnian");
    m.insert("kk", "kazakh");
    m.insert("sq", "albanian");
    m.insert("sw", "swahili");
    m.insert("gl", "galician");
    m.insert("mr", "marathi");
    m.insert("pa", "punjabi");
    m.insert("si", "sinhala");
    m.insert("km", "khmer");
    m.insert("sn", "shona");
    m.insert("yo", "yoruba");
    m.insert("so", "somali");
    m.insert("af", "afrikaans");
    m.insert("oc", "occitan");
    m.insert("ka", "georgian");
    m.insert("be", "belarusian");
    m.insert("tg", "tajik");
    m.insert("sd", "sindhi");
    m.insert("gu", "gujarati");
    m.insert("am", "amharic");
    m.insert("yi", "yiddish");
    m.insert("lo", "lao");
    m.insert("uz", "uzbek");
    m.insert("fo", "faroese");
    m.insert("ht", "haitian creole");
    m.insert("ps", "pashto");
    m.insert("tk", "turkmen");
    m.insert("nn", "nynorsk");
    m.insert("mt", "maltese");
    m.insert("sa", "sanskrit");
    m.insert("lb", "luxembourgish");
    m.insert("my", "myanmar");
    m.insert("bo", "tibetan");
    m.insert("tl", "tagalog");
    m.insert("mg", "malagasy");
    m.insert("as", "assamese");
    m.insert("tt", "tatar");
    m.insert("haw", "hawaiian");
    m.insert("ln", "lingala");
    m.insert("ha", "hausa");
    m.insert("ba", "bashkir");
    m.insert("jw", "javanese");
    m.insert("su", "sundanese");
    m
  });

static WHISPER_TO_LANGUAGE_CODE: std::sync::LazyLock<HashMap<&'static str, &'static str>> =
  std::sync::LazyLock::new(|| {
    let mut m: HashMap<&'static str, &'static str> = WHISPER_LANGUAGES
      .iter()
      .map(|(k, v)| (*v, *k))
      .collect();
    m.insert("burmese", "my");
    m.insert("valencian", "ca");
    m.insert("flemish", "nl");
    m.insert("haitian", "ht");
    m.insert("letzeburgesch", "lb");
    m.insert("pushto", "ps");
    m.insert("panjabi", "pa");
    m.insert("moldavian", "ro");
    m.insert("moldovan", "ro");
    m.insert("sinhalese", "si");
    m.insert("castilian", "es");
    m
  });

pub fn whisper_language_to_code(language: &str) -> Result<String> {
  let lower_lang = language.to_lowercase();
  if let Some(&code) = WHISPER_TO_LANGUAGE_CODE.get(lower_lang.as_str()) {
    return Ok(code.to_string());
  }
  if WHISPER_LANGUAGES.contains_key(lower_lang.as_str()) {
    return Ok(lower_lang);
  }
  Err(anyhow!("Language '{}' is not supported.", language))
}

fn get_or_download_file<R: Runtime>(
  cache_repo: &hf_hub::CacheRepo,
  repo: &hf_hub::api::sync::ApiRepo,
  window: tauri::WebviewWindow<R>,
  file_sub_path: &str,
  event_name: &str,
) -> Result<PathBuf, hf_hub::api::sync::ApiError> {
  match cache_repo.get(file_sub_path) {
    Some(p) => Ok(p),
    None => repo.download_with_progress(
      file_sub_path,
      create_progress_emitter(window.clone(), event_name, file_sub_path.to_string()),
    ),
  }
}

pub struct Whisper {
  encoder_session: Session,
  decoder_session: Session,
  config:          WhisperConfig,
}

impl Whisper {
  pub fn new<R: Runtime>(
    model_id: &str,
    revision: &str,
    window: tauri::WebviewWindow<R>,
  ) -> Result<Self> {
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

    let encoder_model_path = get_or_download_file(
      &cache_repo,
      &repo,
      window.clone(),
      "onnx/encoder_model.onnx",
      "tauri-plugins:tauri-plugin-ipc-audio-transcription-ort:load-model-whisper-progress",
    )?;

    let decoder_model_path = get_or_download_file(
      &cache_repo,
      &repo,
      window.clone(),
      "onnx/decoder_model.onnx",
      "tauri-plugins:tauri-plugin-ipc-audio-transcription-ort:load-model-whisper-progress",
    )?;

    let config_path = match cache_repo.get("config.json") {
      Some(path) => path,
      None => repo.download_with_progress(
        "config.json",
        create_progress_emitter(
          window.clone(),
          "tauri-plugins:tauri-plugin-ipc-audio-transcription-ort:load-model-whisper-progress",
          "config.json".to_string(),
        ),
      )?,
    };

    let tokenizer_config_path = match cache_repo.get("tokenizer_config.json") {
      Some(path) => path,
      None => repo.download_with_progress(
        "tokenizer_config.json",
        create_progress_emitter(
          window.clone(),
          "tauri-plugins:tauri-plugin-ipc-audio-transcription-ort:load-model-whisper-progress",
          "tokenizer_config.json".to_string(),
        ),
      )?,
    };

    let encoder_session = Self::create_optimized_session(encoder_model_path)?;
    let decoder_session = Self::create_optimized_session(decoder_model_path)?;

    let mut config: WhisperConfig = serde_json::from_str(&std::fs::read_to_string(config_path)?)?;
    let tokenizer_config: serde_json::Value =
      serde_json::from_str(&std::fs::read_to_string(tokenizer_config_path)?)?;

    if let Some(added_tokens) = tokenizer_config["added_tokens"].as_array() {
      let lang_to_id = added_tokens
        .iter()
        .filter_map(|token| {
          let content = token["content"].as_str()?;
          let id = token["id"].as_i64()?;
          if content.starts_with("<|")
            && content.ends_with("|>")
            && content.len() >= 4
            && content.len() <= 6
          {
            Some((content.to_string(), id))
          } else {
            None
          }
        })
        .collect();
      config.lang_to_id = lang_to_id;
    }

    Ok(Self {
      encoder_session,
      decoder_session,
      config,
    })
  }

  fn create_optimized_session(model_path: PathBuf) -> Result<Session> {
    let session = Session::builder()?
      .with_optimization_level(GraphOptimizationLevel::Level3)?
      .with_parallel_execution(true)?
      .with_execution_providers([
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
    Ok(session)
  }

  fn retrieve_init_tokens(
    &self,
    gen_config: &GenerationConfig,
  ) -> Result<Vec<i64>> {
    let mut init_tokens = vec![self.config.decoder_start_token_id];
    let task_id = if gen_config.task == "translate" {
      50358
    } else {
      50359
    };

    if self.config.is_multilingual {
      let lang = gen_config.language.as_deref().unwrap_or("en");
      let lang_code = whisper_language_to_code(lang)?;
      let lang_token = format!("<|{lang_code}|>");
      let lang_token_id = self
        .config
        .lang_to_id
        .get(&lang_token)
        .ok_or_else(|| anyhow!("Language token not found for: {}", lang_token))?;
      init_tokens.push(*lang_token_id);
    }
    init_tokens.push(task_id);

    if !gen_config.return_timestamps
      && let Some(no_timestamps_id) = self.config.no_timestamps_token_id
    {
      init_tokens.push(no_timestamps_id);
    }
    Ok(init_tokens)
  }

  pub fn generate(
    &mut self,
    input_features: ArrayView3<f32>,
    gen_config: &GenerationConfig,
  ) -> Result<Vec<i64>> {
    let (batch_size, num_mel_bins, sequence_length) = input_features.dim();
    let expected_mel_bins = usize::try_from(self.config.num_mel_bins)?;

    if batch_size != 1 || num_mel_bins != expected_mel_bins {
      return Err(anyhow!(
        "Incorrect input feature shape. Expected [1, {}, ...], but got [{}, {}, {}]",
        expected_mel_bins,
        batch_size,
        num_mel_bins,
        sequence_length
      ));
    }

    let mut decoder_input_ids = self.retrieve_init_tokens(gen_config)?;

    let owned_input = input_features.to_owned();
    let inputs = vec![("input_features", Value::from_array(owned_input)?)];
    let encoder_outputs = self.encoder_session.run(inputs)?;
    let encoder_hidden_states = encoder_outputs.get("last_hidden_state").unwrap();

    let mut generated_tokens = Vec::new();

    // KV Cache
    // let num_decoder_layers = self.config.decoder_layers as usize;
    // let head_dim = self.config.d_model / self.config.decoder_attention_heads;
    // let mut past_key_values: Vec<Array4<f32>> = (0..num_decoder_layers * 2)
    //   .map(|_| Array4::<f32>::zeros((1, self.config.decoder_attention_heads as usize, 0, head_dim as usize)))
    //   .collect();

    for _step in 0..gen_config.max_new_tokens {
      let decoder_input_ids_array =
        Array2::from_shape_vec((1, decoder_input_ids.len()), decoder_input_ids.clone())?
          .mapv(|x| x);

      // KV Cache
      // let mut decoder_inputs: Vec<(Cow<'_, str>, SessionInputValue<'_>)> = Vec::with_capacity(2 + past_key_values.len());

      let decoder_inputs: Vec<(Cow<'_, str>, SessionInputValue<'_>)> = vec![
        // name = encoder_hidden_states, type = tensor: float32[batch_size,encoder_sequence_length / 2,512]
        ("encoder_hidden_states".into(), encoder_hidden_states.into()),
        // name = input_ids, type = tensor: int64[batch_size,decoder_sequence_length]
        (
          "input_ids".into(),
          Value::from_array(decoder_input_ids_array)?.into(),
        ),
      ];

      let decoder_outputs = self.decoder_session.run(decoder_inputs)?;
      let logits_ref = decoder_outputs.get("logits").unwrap().view();
      let logits_view = logits_ref.try_extract_array::<f32>()?;
      let next_token_logits = logits_view.slice(s![0, -1, ..]);

      let next_token = next_token_logits
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
        .map(|(index, _)| i64::try_from(index).unwrap())
        .unwrap();

      if next_token == self.config.eos_token_id {
        break;
      }

      generated_tokens.push(next_token);
      decoder_input_ids = vec![next_token];
    }

    Ok(generated_tokens)
  }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum WhichModel {
  Tiny,
  Base,
  Small,
  Medium,
  LargeV3,
  LargeV3Turbo,
}

impl WhichModel {
  pub const fn model_and_revision(self) -> (&'static str, &'static str) {
    match self {
      Self::Tiny => ("onnx-community/whisper-tiny-ONNX", "main"),
      Self::Base => ("onnx-community/whisper-base-ONNX", "main"),
      Self::Small => ("onnx-community/whisper-small-ONNX", "main"),
      Self::Medium => ("onnx-community/whisper-medium-ONNX", "main"),
      Self::LargeV3 => ("onnx-community/whisper-large-v3-ONNX", "main"),
      Self::LargeV3Turbo => ("onnx-community/whisper-large-v3-turbo-ONNX", "main"),
    }
  }
}

/// A pipeline that encapsulates the full Whisper transcription process.
pub struct WhisperPipeline {
  model:     Whisper,
  processor: WhisperProcessor,
  tokenizer: Tokenizer,
}

impl WhisperPipeline {
  pub fn new<R: Runtime>(
    which_model: WhichModel,
    model_id: &str,
    revision: &str,
    window: tauri::WebviewWindow<R>,
  ) -> Result<Self> {
    let model = Whisper::new(model_id, revision, window.clone())?;

    // Initialize our new processor
    let processor = WhisperProcessor::new(which_model)?;

    let cache_api = hf_hub::Cache::from_env();
    let cache_repo = cache_api.repo(Repo::with_revision(
      model_id.to_string(),
      RepoType::Model,
      revision.to_string(),
    ));

    let api = Api::new()?;
    let repo = api.repo(hf_hub::Repo::with_revision(
      model_id.to_string(),
      hf_hub::RepoType::Model,
      revision.to_string(),
    ));

    let tokenizer_path = get_or_download_file(
      &cache_repo,
      &repo,
      window.clone(),
      "tokenizer.json",
      "tauri-plugins:tauri-plugin-ipc-audio-transcription-ort:load-model-whisper-progress",
    )?;

    let tokenizer = Tokenizer::from_file(tokenizer_path)
      .map_err(|e| anyhow!("Failed to load tokenizer: {}", e))?;

    Ok(Self {
      model,
      processor,
      tokenizer,
    })
  }

  pub fn transcribe(
    &mut self,
    audio: &[f32],
    gen_config: &GenerationConfig,
  ) -> Result<String> {
    // 1. Process the raw audio into a mel spectrogram with the correct shape [80, 3000] for normal, and [128, 3000] for large-v3
    let input_features = self.processor.process(audio);

    // 2. Add the batch dimension, making the shape [1, 80, 3000] for normal, and [1, 128, 3000] for large-v3
    let input_features = input_features.insert_axis(Axis(0));

    // 3. Generate tokens. This will now work without a shape error.
    let generated_tokens = self
      .model
      .generate(input_features.view(), gen_config)?;

    // The rest of the function remains the same...
    let generated_tokens_u32: Vec<u32> = generated_tokens
      .iter()
      .map(|&x| u32::try_from(x).unwrap())
      .collect();

    let transcript = self
      .tokenizer
      .decode(&generated_tokens_u32, true)
      .map_err(|e| anyhow!("Failed to decode tokens: {}", e))?;

    Ok(transcript)
  }
}
