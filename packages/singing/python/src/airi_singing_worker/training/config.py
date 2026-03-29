"""RVC v2 40kHz training hyperparameters.

Derived from upstream RVC v2 48k config, adjusted for 40kHz sample rate.
The model architecture matches _RVC_V2_40K_CONFIG used throughout this project.

Training enhancements over vanilla RVC:
  - Warmup + Cosine Annealing LR schedule (replaces ExponentialLR)
  - EMA generator weights for stable inference
  - Multi-scale mel spectrogram loss (BigVGAN-v2 style)
  - Gradient accumulation for larger effective batch size
  - Early stopping on validation mel loss
  - R1 gradient penalty for discriminator regularization
  - BFloat16 support on Ampere+ GPUs
  - Best-checkpoint tracking by validation mel loss
"""

from dataclasses import dataclass, field


@dataclass
class TrainingConfig:
    # ── Audio / STFT ──
    sampling_rate: int = 40000
    filter_length: int = 2048
    hop_length: int = 400
    win_length: int = 2048
    n_mel_channels: int = 128
    mel_fmin: float = 0.0
    mel_fmax: float | None = None
    max_wav_value: float = 32768.0

    # ── Model architecture (must match _RVC_V2_40K_CONFIG) ──
    inter_channels: int = 192
    hidden_channels: int = 192
    filter_channels: int = 768
    n_heads: int = 2
    n_layers: int = 6
    kernel_size: int = 3
    p_dropout: int = 0
    resblock: str = "1"
    resblock_kernel_sizes: list[int] = field(default_factory=lambda: [3, 7, 11])
    resblock_dilation_sizes: list[list[int]] = field(
        default_factory=lambda: [[1, 3, 5], [1, 3, 5], [1, 3, 5]]
    )
    upsample_rates: list[int] = field(default_factory=lambda: [10, 10, 2, 2])
    upsample_initial_channel: int = 512
    upsample_kernel_sizes: list[int] = field(default_factory=lambda: [16, 16, 4, 4])
    use_spectral_norm: bool = False
    gin_channels: int = 256
    spk_embed_dim: int = 109

    # ── Training ──
    learning_rate: float = 1e-4
    betas: tuple[float, float] = (0.8, 0.99)
    eps: float = 1e-9
    segment_size: int = 12800
    batch_size: int = 8
    epochs: int = 200
    seed: int = 1234

    # ── Precision ──
    fp16_run: bool = True
    use_bf16: bool = True  # prefer BF16 on Ampere+; falls back to FP16

    # ── Learning Rate Schedule: Warmup + Cosine Annealing ──
    warmup_epochs: int = 10
    lr_min: float = 1e-6
    cosine_t0: int = 0  # 0 = auto (epochs - warmup_epochs)
    cosine_t_mult: int = 1

    # ── EMA (Exponential Moving Average for Generator) ──
    ema_enabled: bool = True
    ema_decay: float = 0.999
    ema_start_epoch: int = 20

    # ── Gradient Accumulation ──
    grad_accum_steps: int = 1

    # ── Gradient Clipping ──
    max_grad_norm_g: float = 10.0
    max_grad_norm_d: float = 10.0

    # ── Loss weights ──
    c_mel: float = 45.0
    c_kl: float = 1.0

    # ── Multi-scale Mel Loss (BigVGAN-v2 / Qwen3-TTS style) ──
    multi_scale_mel: bool = True
    ms_mel_scales: list[dict] = field(default_factory=lambda: [
        {"n_fft": 512, "hop": 128, "win": 512},
        {"n_fft": 1024, "hop": 256, "win": 1024},
        {"n_fft": 2048, "hop": 400, "win": 2048},
    ])
    c_ms_mel: float = 15.0

    # ── R1 Gradient Penalty (Discriminator regularization) ──
    r1_enabled: bool = True
    r1_gamma: float = 5.0
    r1_interval: int = 16

    # ── Early Stopping ──
    early_stopping: bool = True
    patience: int = 200
    min_delta: float = 0.01

    # ── Best Model Tracking ──
    save_best: bool = True

    # ── Checkpoint ──
    save_every_epoch: int = 50
    log_interval: int = 10
    val_interval: int = 25

    # ── GPU Data Caching ──
    cache_data_on_gpu: bool = True

    @property
    def spec_channels(self) -> int:
        return self.filter_length // 2 + 1

    @property
    def segment_frames(self) -> int:
        """Number of mel/spec frames per training segment."""
        return self.segment_size // self.hop_length

    def effective_cosine_t0(self) -> int:
        if self.cosine_t0 > 0:
            return self.cosine_t0
        return max(self.epochs - self.warmup_epochs, 1)

    def model_kwargs(self) -> dict:
        """Kwargs matching SynthesizerTrnMs768NSFsid(**model_kwargs)."""
        return dict(
            inter_channels=self.inter_channels,
            hidden_channels=self.hidden_channels,
            filter_channels=self.filter_channels,
            n_heads=self.n_heads,
            n_layers=self.n_layers,
            kernel_size=self.kernel_size,
            p_dropout=self.p_dropout,
            resblock=self.resblock,
            resblock_kernel_sizes=self.resblock_kernel_sizes,
            resblock_dilation_sizes=self.resblock_dilation_sizes,
            upsample_rates=self.upsample_rates,
            upsample_initial_channel=self.upsample_initial_channel,
            upsample_kernel_sizes=self.upsample_kernel_sizes,
            use_spectral_norm=self.use_spectral_norm,
            gin_channels=self.gin_channels,
            spk_embed_dim=self.spk_embed_dim,
        )
