use anyhow::{Result, anyhow};
use byteorder::{ByteOrder, LittleEndian};
use ndarray::{Array1, Array2, s};
use rustfft::{FftPlanner, num_complex::Complex};

use super::whisper::WhichModel;

// Constants from the Whisper paper/implementation
const SAMPLE_RATE: usize = 16000;
const N_FFT: usize = 400;
const N_MELS: usize = 80; // <--- Crucial: Use 80 for base, 128 for large-v3
const HOP_LENGTH: usize = 160;
const CHUNK_LENGTH: usize = 30;
const N_SAMPLES: usize = CHUNK_LENGTH * SAMPLE_RATE; // 480000 samples
const N_FRAMES: usize = N_SAMPLES / HOP_LENGTH; // 3000 frames

pub struct WhisperProcessor {
  mel_filters: Array2<f32>,
}

impl WhisperProcessor {
  pub fn new(which_model: WhichModel) -> Result<Self> {
    // Load the 80-bin mel filters
    if which_model == WhichModel::LargeV3 || which_model == WhichModel::LargeV3Turbo {
      let mel_bytes = include_bytes!("./melfilters128.bytes");
      let mut mel_filters_vec = vec![0f32; mel_bytes.len() / 4];
      LittleEndian::read_f32_into(mel_bytes, &mut mel_filters_vec);

      // The shape is [80, 201]. N_FFT/2 + 1 = 201.
      let mel_filters = Array2::from_shape_vec((N_MELS, N_FFT / 2 + 1), mel_filters_vec)
        .map_err(|e| anyhow!("Failed to create mel filters array: {}", e))?;

      Ok(Self { mel_filters })
    } else {
      let mel_bytes = include_bytes!("./melfilters.bytes");
      let mut mel_filters_vec = vec![0f32; mel_bytes.len() / 4];
      LittleEndian::read_f32_into(mel_bytes, &mut mel_filters_vec);

      // The shape is [80, 201]. N_FFT/2 + 1 = 201.
      let mel_filters = Array2::from_shape_vec((N_MELS, N_FFT / 2 + 1), mel_filters_vec)
        .map_err(|e| anyhow!("Failed to create mel filters array: {}", e))?;

      Ok(Self { mel_filters })
    }
  }

  /// Processes raw audio PCM data into a mel spectrogram.
  pub fn process(
    &self,
    audio: &[f32],
  ) -> Array2<f32> {
    // 1. Pad or truncate the audio to 30 seconds
    let mut pcm_data = audio.to_vec();
    if pcm_data.len() < N_SAMPLES {
      pcm_data.resize(N_SAMPLES, 0.0);
    } else {
      pcm_data.truncate(N_SAMPLES);
    }
    let pcm_data = Array1::from_vec(pcm_data);

    // 2. Compute the Short-Time Fourier Transform (STFT)
    let stft = self.stft(&pcm_data);
    // 3. Apply the mel filter bank
    let mel_spectrogram = self.mel_filters.dot(&stft);
    // 4. Apply logarithmic scaling
    self.log_mel_spectrogram(&mel_spectrogram)
  }

  /// Computes the Short-Time Fourier Transform (STFT) of the input audio.
  fn stft(
    &self,
    pcm_data: &Array1<f32>,
  ) -> Array2<f32> {
    // Create a Hann window
    let window: Array1<f32> = Array1::from_shape_fn(N_FFT, |i| {
      0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / N_FFT as f32).cos())
    });

    // Pad the input data
    let mut padded_data = Array1::zeros(pcm_data.len() + N_FFT);

    let end = padded_data.len() - N_FFT / 2;
    padded_data
      .slice_mut(s![N_FFT / 2..end])
      .assign(pcm_data);

    let frames = padded_data
      .windows(N_FFT)
      .into_iter()
      .step_by(HOP_LENGTH);

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(N_FFT);

    // Process each frame
    let mut stft_result = Array2::zeros((N_FFT / 2 + 1, N_FRAMES));
    for (i, frame) in frames.enumerate() {
      if i >= N_FRAMES {
        break;
      }

      // Apply window
      let windowed_frame = frame.to_owned() * window.view();

      // Prepare buffer for FFT
      let mut buffer: Vec<Complex<f32>> = windowed_frame
        .iter()
        .map(|&x| Complex { re: x, im: 0.0 })
        .collect();

      // Perform FFT
      fft.process(&mut buffer);

      // Compute magnitude and store it
      for j in 0..=(N_FFT / 2) {
        stft_result[[j, i]] = buffer[j].norm_sqr().sqrt();
      }
    }

    stft_result
  }

  /// Converts a mel spectrogram to a log-scaled mel spectrogram.
  fn log_mel_spectrogram(
    &self,
    mel_spec: &Array2<f32>,
  ) -> Array2<f32> {
    let mut log_spec = mel_spec.mapv(|x| x.max(1e-10).log10());
    log_spec =
      log_spec.mapv(|x| x.max(log_spec.fold(f32::NEG_INFINITY, |acc, &v| acc.max(v)) - 8.0));
    log_spec = (log_spec + 4.0) / 4.0;
    log_spec
  }
}
