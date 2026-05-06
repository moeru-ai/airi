"""RVC v2 GAN fine-tuning loop — Enhanced Edition.

Single-GPU training loop that fine-tunes a pretrained RVC Generator
and Discriminator on target voice data.

Enhancements over vanilla RVC training:
  - Warmup + Cosine Annealing LR (replaces ExponentialLR)
  - EMA generator weights for inference stability
  - Best-checkpoint selection by mel reconstruction loss
  - Gradient accumulation for larger effective batch size
  - Multi-scale mel spectrogram loss (BigVGAN-v2 style)
  - R1 gradient penalty for discriminator regularization
  - BFloat16 support on Ampere+ GPUs
  - Early stopping on mel loss plateau
  - Gradient norm logging for diagnostics
  - Training resume from checkpoint

Reference:
  https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI
  NVIDIA/BigVGAN (multi-scale mel loss)
  Mescheder et al. 2018 (R1 gradient penalty)
"""

from __future__ import annotations

import gc
import json
import os
import signal
import time
from pathlib import Path
from typing import Callable

import torch
from torch.nn import functional as F
from torch.utils.data import DataLoader

from ..compat import patch_torch_load
from .config import TrainingConfig
from .data_loader import RVCCollate, RVCTrainingDataset
from .ema import ExponentialMovingAverage
from .losses import discriminator_loss, feature_loss, generator_loss, kl_loss
from .mel_processing import clear_mel_caches, mel_spectrogram_torch, spec_to_mel_torch
from .schedulers import WarmupCosineAnnealingLR

patch_torch_load()

ProgressCallback = Callable[[int, int, float, float, dict[str, float]], None]

_interrupted = False


def _signal_handler(sig, frame):
    """Handle SIGINT/SIGTERM to allow graceful cleanup."""
    global _interrupted
    _interrupted = True
    print(f"\n  Signal {sig} received — finishing current epoch then cleaning up...", flush=True)


def release_gpu_resources(
    net_g=None, net_d=None,
    optim_g=None, optim_d=None,
    ema=None, dataset=None,
) -> None:
    """Explicitly free all GPU resources held by training objects.

    Called in the finally block of run_training() to guarantee cleanup
    regardless of whether training completed, was interrupted, or crashed.
    Does NOT move models to CPU — it deletes references outright so the
    CUDA allocator can reclaim the memory.
    """
    print("  Releasing GPU resources...", flush=True)

    if ema is not None:
        ema.release()

    if dataset is not None and hasattr(dataset, "release"):
        dataset.release()

    # Clear optimizer states (they hold GPU tensors for Adam moments)
    for opt in [optim_g, optim_d]:
        if opt is not None:
            try:
                opt.state.clear()
            except Exception:
                pass

    # Clear mel processing caches (hann windows + mel filter banks on GPU)
    clear_mel_caches()

    # Force Python GC to drop all remaining tensor references,
    # then tell CUDA to release its cached allocations.
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.synchronize()
        torch.cuda.empty_cache()

    print("  GPU resources released.", flush=True)


def _slice_segments(x: torch.Tensor, ids_str: torch.Tensor, segment_size: int) -> torch.Tensor:
    """Slice segments from a batch tensor given start indices."""
    ret = torch.zeros_like(x[..., :segment_size])
    for i in range(x.size(0)):
        idx_str = int(ids_str[i].item())
        idx_end = idx_str + segment_size
        s = x[i, ..., idx_str:idx_end]
        actual = s.shape[-1]
        if actual < segment_size:
            ret[i, ..., :actual] = s
        else:
            ret[i] = s
    return ret


def _load_pretrained_state(path: str, device: str) -> dict:
    cpt = torch.load(path, map_location=device, weights_only=False)
    if isinstance(cpt, dict) and "model" in cpt:
        return cpt["model"]
    if isinstance(cpt, dict) and "weight" in cpt:
        return cpt["weight"]
    return cpt


def _build_generator(config: TrainingConfig, device: str):
    """Build SynthesizerTrnMs768NSFsid from rvc_python."""
    from rvc_python.lib.infer_pack.models import SynthesizerTrnMs768NSFsid

    net_g = SynthesizerTrnMs768NSFsid(
        config.spec_channels,
        config.segment_frames,
        **config.model_kwargs(),
        is_half=False,
        sr=config.sampling_rate,
    )
    return net_g.to(device)


def _build_discriminator(config: TrainingConfig, device: str):
    """Build MultiPeriodDiscriminatorV2 from rvc_python."""
    from rvc_python.lib.infer_pack.models import MultiPeriodDiscriminatorV2

    net_d = MultiPeriodDiscriminatorV2(config.use_spectral_norm)
    return net_d.to(device)


def _resolve_precision(config: TrainingConfig, use_cuda: bool) -> tuple[bool, str]:
    """Determine precision mode: BF16 > FP16 > FP32."""
    if not use_cuda or not config.fp16_run:
        return False, "float32"

    if config.use_bf16 and torch.cuda.is_bf16_supported():
        return True, "bfloat16"
    return True, "float16"


def _compute_multi_scale_mel_loss(
    y_hat: torch.Tensor,
    wave_sliced: torch.Tensor,
    scales: list[dict],
    sampling_rate: int,
    n_mels: int = 128,
    mel_fmin: float = 0.0,
    mel_fmax: float | None = None,
) -> torch.Tensor:
    """Multi-scale mel spectrogram L1 loss across multiple STFT resolutions.

    Each scale uses a different (n_fft, hop, win) to capture both
    fine-grained and coarse-grained spectral details.
    """
    loss = torch.tensor(0.0, device=y_hat.device)
    y_hat_wav = y_hat.squeeze(1)
    y_wav = wave_sliced.squeeze(1)

    for scale in scales:
        n_fft = scale["n_fft"]
        hop = scale["hop"]
        win = scale["win"]

        mel_hat = mel_spectrogram_torch(
            y_hat_wav, n_fft, n_mels, sampling_rate, hop, win, mel_fmin, mel_fmax
        )
        mel_ref = mel_spectrogram_torch(
            y_wav, n_fft, n_mels, sampling_rate, hop, win, mel_fmin, mel_fmax
        )
        loss += F.l1_loss(mel_hat, mel_ref)

    return loss / len(scales)


def _r1_penalty(
    net_d: torch.nn.Module,
    real: torch.Tensor,
) -> torch.Tensor:
    """R1 gradient penalty: E[||∇D(x_real)||²], averaged over dimensions and periods.

    Stabilizes discriminator by penalizing the gradient magnitude on real data.
    Uses mean (not sum) over spatial dimensions to keep the penalty scale-invariant
    regardless of audio segment length or number of discriminator periods.
    Reference: Mescheder et al. "Which Training Methods for GANs do actually
    Converge?" (ICML 2018)
    """
    real_input = real.detach().requires_grad_(True)
    real_pred, _, _, _ = net_d(real_input, real_input)
    penalties = []
    for pred in real_pred:
        grad = torch.autograd.grad(
            outputs=pred.sum(),
            inputs=real_input,
            create_graph=True,
            retain_graph=True,
        )[0]
        penalties.append(grad.pow(2).mean())
    return sum(penalties) / len(penalties)


def run_training(
    exp_dir: str,
    config: TrainingConfig,
    device: str = "cpu",
    pretrained_g_path: str = "",
    pretrained_d_path: str = "",
    progress_callback: ProgressCallback | None = None,
    resume_checkpoint_dir: str = "",
) -> str:
    """Run the GAN fine-tuning loop with all enhancements.

    All GPU resources are guaranteed to be released when this function
    returns — whether training completed normally, was interrupted by
    signal, or raised an exception.

    Returns path to the best generator checkpoint (by mel loss).
    """
    global _interrupted
    _interrupted = False

    # Install signal handlers for graceful shutdown
    prev_sigint = signal.getsignal(signal.SIGINT)
    prev_sigterm = signal.getsignal(signal.SIGTERM)
    try:
        signal.signal(signal.SIGINT, _signal_handler)
        signal.signal(signal.SIGTERM, _signal_handler)
    except (OSError, ValueError):
        pass  # signals may not be settable in all environments

    torch.manual_seed(config.seed)
    use_cuda = device.startswith("cuda")
    if use_cuda:
        torch.cuda.manual_seed_all(config.seed)

    use_amp, precision_dtype = _resolve_precision(config, use_cuda)
    amp_dtype = torch.bfloat16 if precision_dtype == "bfloat16" else torch.float16

    # These are declared here so the finally block can always reference them
    net_g = None
    net_d = None
    optim_g = None
    optim_d = None
    ema: ExponentialMovingAverage | None = None
    dataset = None

    try:
        print(f"Building models on {device} (precision: {precision_dtype})...", flush=True)
        net_g = _build_generator(config, device)
        net_d = _build_discriminator(config, device)

        # Load pretrained weights
        if pretrained_g_path and Path(pretrained_g_path).exists():
            state = _load_pretrained_state(pretrained_g_path, device)
            missing = net_g.load_state_dict(state, strict=False)
            print(f"Loaded pretrained G: {len(missing.missing_keys)} missing, "
                  f"{len(missing.unexpected_keys)} unexpected keys", flush=True)
            del state
        else:
            print("WARNING: No pretrained generator -- training from scratch", flush=True)

        if pretrained_d_path and Path(pretrained_d_path).exists():
            state = _load_pretrained_state(pretrained_d_path, device)
            missing = net_d.load_state_dict(state, strict=False)
            print(f"Loaded pretrained D: {len(missing.missing_keys)} missing, "
                  f"{len(missing.unexpected_keys)} unexpected keys", flush=True)
            del state
        else:
            print("WARNING: No pretrained discriminator -- training D from scratch", flush=True)

        # Optimizers
        optim_g = torch.optim.AdamW(
            net_g.parameters(),
            lr=config.learning_rate,
            betas=config.betas,
            eps=config.eps,
        )
        optim_d = torch.optim.AdamW(
            net_d.parameters(),
            lr=config.learning_rate,
            betas=config.betas,
            eps=config.eps,
        )

        # LR Scheduler: Warmup + Cosine Annealing
        t0 = config.effective_cosine_t0()
        scheduler_g = WarmupCosineAnnealingLR(
            optim_g,
            warmup_epochs=config.warmup_epochs,
            t_0=t0,
            t_mult=config.cosine_t_mult,
            lr_min=config.lr_min,
        )
        scheduler_d = WarmupCosineAnnealingLR(
            optim_d,
            warmup_epochs=config.warmup_epochs,
            t_0=t0,
            t_mult=config.cosine_t_mult,
            lr_min=config.lr_min,
        )

        # EMA
        if config.ema_enabled:
            ema = ExponentialMovingAverage(net_g, decay=config.ema_decay)
            print(f"EMA enabled (decay={config.ema_decay}, starts epoch {config.ema_start_epoch})", flush=True)

        # Mixed precision
        scaler = torch.amp.GradScaler("cuda", enabled=(use_amp and precision_dtype == "float16"))
        autocast_ctx = lambda: torch.amp.autocast("cuda", enabled=use_amp, dtype=amp_dtype)

        # Dataset with optional GPU caching
        print("Loading training dataset...", flush=True)
        cache_dev = device if (config.cache_data_on_gpu and use_cuda) else None
        dataset = RVCTrainingDataset(exp_dir, config, cache_device=cache_dev)
        print(f"Training samples: {len(dataset)}", flush=True)

        loader = DataLoader(
            dataset,
            batch_size=config.batch_size,
            shuffle=True,
            collate_fn=RVCCollate(),
            num_workers=0,
            pin_memory=(use_cuda and cache_dev is None),
            drop_last=True if len(dataset) > config.batch_size else False,
        )

        if len(loader) == 0:
            print("WARNING: DataLoader has 0 batches. Using batch_size=1.", flush=True)
            loader = DataLoader(
                dataset, batch_size=1, shuffle=True, collate_fn=RVCCollate(),
                num_workers=0, pin_memory=use_cuda,
            )

        ckpt_dir = os.path.join(exp_dir, "checkpoints")
        os.makedirs(ckpt_dir, exist_ok=True)

        # Resume from checkpoint
        start_epoch = 1
        if resume_checkpoint_dir:
            start_epoch = _try_resume(
                resume_checkpoint_dir, net_g, net_d, optim_g, optim_d,
                scheduler_g, scheduler_d, ema, device,
            )

        net_g.train()
        net_d.train()

        # Best model tracking
        best_mel_loss = float("inf")
        best_g_path = ""
        epochs_since_best = 0
        last_epoch = start_epoch

        grad_accum = max(config.grad_accum_steps, 1)

        print(f"\n=== Starting GAN Training: {config.epochs} epochs ===", flush=True)
        print(f"  LR schedule: warmup={config.warmup_epochs} -> cosine(T0={t0})", flush=True)
        print(f"  Grad accumulation: {grad_accum} steps (effective batch={config.batch_size * grad_accum})", flush=True)
        if config.multi_scale_mel:
            scales_desc = ", ".join(f"{s['n_fft']}" for s in config.ms_mel_scales)
            print(f"  Multi-scale mel loss: [{scales_desc}] (weight={config.c_ms_mel})", flush=True)
        if config.r1_enabled:
            print(f"  R1 penalty: γ={config.r1_gamma}, interval={config.r1_interval}", flush=True)
        if config.early_stopping:
            print(f"  Early stopping: patience={config.patience}, min_delta={config.min_delta}", flush=True)

        t_start = time.time()

        for epoch in range(start_epoch, config.epochs + 1):
            last_epoch = epoch

            # Check for interrupt signal
            if _interrupted:
                print(f"\n  Interrupted at epoch {epoch}. Saving checkpoint...", flush=True)
                _save_checkpoint(
                    net_g, net_d, optim_g, optim_d, epoch, ckpt_dir,
                    ema=ema, tag=f"interrupted_epoch{epoch}",
                    scheduler_g=scheduler_g, scheduler_d=scheduler_d,
                    best_mel_loss=best_mel_loss,
                )
                break

            epoch_loss_g = 0.0
            epoch_loss_d = 0.0
            epoch_loss_mel = 0.0
            epoch_loss_fm = 0.0
            epoch_loss_gen = 0.0
            epoch_loss_kl = 0.0
            epoch_loss_ms_mel = 0.0
            epoch_loss_r1 = 0.0
            epoch_grad_norm_g = 0.0
            epoch_grad_norm_d = 0.0
            n_batches = 0

            optim_g.zero_grad()
            optim_d.zero_grad()

            for batch_idx, batch in enumerate(loader):
                (phone, phone_lengths, pitch, pitchf,
                 spec, spec_lengths, wave, wave_lengths, sid) = batch

                # RVCCollate always produces CPU tensors (it creates new
                # padded tensors), so we must move to CUDA every time.
                if use_cuda:
                    phone = phone.cuda(non_blocking=True)
                    phone_lengths = phone_lengths.cuda(non_blocking=True)
                    pitch = pitch.cuda(non_blocking=True)
                    pitchf = pitchf.cuda(non_blocking=True)
                    spec = spec.cuda(non_blocking=True)
                    spec_lengths = spec_lengths.cuda(non_blocking=True)
                    wave = wave.cuda(non_blocking=True)
                    sid = sid.cuda(non_blocking=True)

                # ── Generator forward ──
                with autocast_ctx():
                    (
                        y_hat, ids_slice, x_mask, z_mask,
                        (z, z_p, m_p, logs_p, m_q, logs_q),
                    ) = net_g(phone, phone_lengths, pitch, pitchf, spec, spec_lengths, sid)

                    mel = spec_to_mel_torch(
                        spec,
                        config.filter_length,
                        config.n_mel_channels,
                        config.sampling_rate,
                        config.mel_fmin,
                        config.mel_fmax,
                    )
                    y_mel = _slice_segments(mel, ids_slice, config.segment_frames)

                    with torch.amp.autocast("cuda", enabled=False):
                        y_hat_mel = mel_spectrogram_torch(
                            y_hat.float().squeeze(1),
                            config.filter_length,
                            config.n_mel_channels,
                            config.sampling_rate,
                            config.hop_length,
                            config.win_length,
                            config.mel_fmin,
                            config.mel_fmax,
                        )

                    if use_amp and precision_dtype == "float16":
                        y_hat_mel = y_hat_mel.half()
                    elif use_amp and precision_dtype == "bfloat16":
                        y_hat_mel = y_hat_mel.to(torch.bfloat16)

                    wave_sliced = _slice_segments(
                        wave, ids_slice * config.hop_length, config.segment_size
                    )

                # ── Discriminator update ──
                with autocast_ctx():
                    y_d_hat_r, y_d_hat_g, _, _ = net_d(wave_sliced, y_hat.detach())
                with torch.amp.autocast("cuda", enabled=False):
                    loss_disc, _, _ = discriminator_loss(y_d_hat_r, y_d_hat_g)

                # R1 gradient penalty (every r1_interval steps)
                loss_r1_val = torch.tensor(0.0, device=device)
                if config.r1_enabled and (epoch * len(loader) + batch_idx) % config.r1_interval == 0:
                    with torch.amp.autocast("cuda", enabled=False):
                        loss_r1_val = _r1_penalty(net_d, wave_sliced.float()) * config.r1_gamma
                        loss_disc = loss_disc + loss_r1_val

                loss_disc_scaled = loss_disc / grad_accum
                scaler.scale(loss_disc_scaled).backward()

                if (batch_idx + 1) % grad_accum == 0 or (batch_idx + 1) == len(loader):
                    scaler.unscale_(optim_d)
                    gn_d = torch.nn.utils.clip_grad_norm_(net_d.parameters(), max_norm=config.max_grad_norm_d)
                    scaler.step(optim_d)
                    optim_d.zero_grad()
                    epoch_grad_norm_d += gn_d.item() if isinstance(gn_d, torch.Tensor) else gn_d

                # ── Generator update ──
                with autocast_ctx():
                    y_d_hat_r, y_d_hat_g, fmap_r, fmap_g = net_d(wave_sliced, y_hat)

                with torch.amp.autocast("cuda", enabled=False):
                    loss_mel = F.l1_loss(y_mel, y_hat_mel) * config.c_mel
                    loss_kl_val = kl_loss(z_p, logs_q, m_p, logs_p, z_mask) * config.c_kl
                    loss_fm = feature_loss(fmap_r, fmap_g)
                    loss_gen, _ = generator_loss(y_d_hat_g)
                    loss_gen_all = loss_gen + loss_fm + loss_mel + loss_kl_val

                    # Multi-scale mel loss
                    loss_ms_mel = torch.tensor(0.0, device=device)
                    if config.multi_scale_mel:
                        with torch.amp.autocast("cuda", enabled=False):
                            loss_ms_mel = _compute_multi_scale_mel_loss(
                                y_hat.float(), wave_sliced.float(),
                                config.ms_mel_scales,
                                config.sampling_rate,
                                config.n_mel_channels,
                                config.mel_fmin,
                                config.mel_fmax,
                            ) * config.c_ms_mel
                        loss_gen_all = loss_gen_all + loss_ms_mel

                loss_gen_scaled = loss_gen_all / grad_accum
                scaler.scale(loss_gen_scaled).backward()

                if (batch_idx + 1) % grad_accum == 0 or (batch_idx + 1) == len(loader):
                    scaler.unscale_(optim_g)
                    gn_g = torch.nn.utils.clip_grad_norm_(net_g.parameters(), max_norm=config.max_grad_norm_g)
                    scaler.step(optim_g)
                    scaler.update()
                    optim_g.zero_grad()
                    epoch_grad_norm_g += gn_g.item() if isinstance(gn_g, torch.Tensor) else gn_g

                epoch_loss_g += loss_gen_all.item()
                epoch_loss_d += loss_disc.item()
                epoch_loss_mel += loss_mel.item()
                epoch_loss_fm += loss_fm.item()
                epoch_loss_gen += loss_gen.item()
                epoch_loss_kl += loss_kl_val.item()
                epoch_loss_ms_mel += loss_ms_mel.item()
                epoch_loss_r1 += loss_r1_val.item()
                n_batches += 1

            # EMA update
            if ema is not None and epoch >= config.ema_start_epoch:
                ema.update(net_g)

            scheduler_g.step()
            scheduler_d.step()

            denom = max(n_batches, 1)
            avg_loss_g = epoch_loss_g / denom
            avg_loss_d = epoch_loss_d / denom
            avg_mel = epoch_loss_mel / denom
            avg_mel_raw = avg_mel / max(config.c_mel, 1e-8)
            accum_steps = max(n_batches // grad_accum, 1)
            loss_details = {
                "mel": avg_mel,
                "mel_raw": round(avg_mel_raw, 6),
                "fm": epoch_loss_fm / denom,
                "gen": epoch_loss_gen / denom,
                "kl": epoch_loss_kl / denom,
                "ms_mel": epoch_loss_ms_mel / denom,
                "r1": epoch_loss_r1 / denom,
                "grad_norm_g": epoch_grad_norm_g / accum_steps,
                "grad_norm_d": epoch_grad_norm_d / accum_steps,
            }

            if progress_callback:
                progress_callback(epoch, config.epochs, avg_loss_g, avg_loss_d, loss_details)

            # Best model tracking (by raw mel reconstruction loss)
            is_best = False
            if config.save_best and avg_mel_raw < best_mel_loss - config.min_delta:
                best_mel_loss = avg_mel_raw
                epochs_since_best = 0
                is_best = True
                best_g_path = _save_checkpoint(
                    net_g, net_d, optim_g, optim_d, epoch, ckpt_dir,
                    ema=ema, tag="best", scheduler_g=scheduler_g, scheduler_d=scheduler_d,
                    best_mel_loss=best_mel_loss,
                )
                print(f"  [BEST] New best model (mel_raw={avg_mel_raw:.6f}) saved at epoch {epoch}", flush=True)
            else:
                epochs_since_best += 1

            if epoch % config.log_interval == 0 or epoch == start_epoch:
                lr = optim_g.param_groups[0]["lr"]
                elapsed = time.time() - t_start
                eta = elapsed / max(epoch - start_epoch + 1, 1) * (config.epochs - epoch)
                print(
                    f"  Epoch {epoch}/{config.epochs} | "
                    f"G: {avg_loss_g:.4f} | D: {avg_loss_d:.4f} | "
                    f"mel: {loss_details['mel']:.3f} | mel_raw: {avg_mel_raw:.5f} | "
                    f"fm: {loss_details['fm']:.3f} | gen: {loss_details['gen']:.3f} | "
                    f"kl: {loss_details['kl']:.3f} | ms_mel: {loss_details['ms_mel']:.3f} | "
                    f"r1: {loss_details['r1']:.3f} | "
                    f"gradG: {loss_details['grad_norm_g']:.1f} | gradD: {loss_details['grad_norm_d']:.1f} | "
                    f"LR: {lr:.2e} | "
                    f"best_mel: {best_mel_loss:.5f} ({'BEST' if is_best else f'wait {epochs_since_best}'}) | "
                    f"ETA: {eta/60:.0f}min",
                    flush=True,
                )

            # Periodic checkpoint
            if epoch % config.save_every_epoch == 0:
                _save_checkpoint(
                    net_g, net_d, optim_g, optim_d, epoch, ckpt_dir,
                    ema=ema, tag=f"epoch{epoch}",
                    scheduler_g=scheduler_g, scheduler_d=scheduler_d,
                    best_mel_loss=best_mel_loss,
                )

            # Early stopping
            if config.early_stopping and epochs_since_best >= config.patience:
                print(
                    f"\n  Early stopping triggered at epoch {epoch} "
                    f"(no improvement for {config.patience} epochs, "
                    f"best_mel_raw={best_mel_loss:.6f})",
                    flush=True,
                )
                break

        # Save final checkpoint
        final_path = _save_checkpoint(
            net_g, net_d, optim_g, optim_d, last_epoch, ckpt_dir,
            ema=ema, tag="final", scheduler_g=scheduler_g, scheduler_d=scheduler_d,
            best_mel_loss=best_mel_loss,
        )

        result_path = best_g_path if best_g_path else final_path
        print(f"\n=== GAN Training Complete ({last_epoch} epochs) ===", flush=True)
        print(f"  Best mel_raw: {best_mel_loss:.6f}", flush=True)
        print(f"  Using checkpoint: {result_path}", flush=True)
        return result_path

    finally:
        # ── Guaranteed GPU resource cleanup ──
        release_gpu_resources(
            net_g=net_g, net_d=net_d,
            optim_g=optim_g, optim_d=optim_d,
            ema=ema, dataset=dataset,
        )
        # Restore original signal handlers
        try:
            signal.signal(signal.SIGINT, prev_sigint)
            signal.signal(signal.SIGTERM, prev_sigterm)
        except (OSError, ValueError):
            pass


def _save_checkpoint(
    net_g: torch.nn.Module,
    net_d: torch.nn.Module,
    optim_g: torch.optim.Optimizer,
    optim_d: torch.optim.Optimizer,
    epoch: int,
    ckpt_dir: str,
    *,
    ema: ExponentialMovingAverage | None = None,
    tag: str = "",
    scheduler_g=None,
    scheduler_d=None,
    best_mel_loss: float = float("inf"),
) -> str:
    """Save G and D checkpoints with full training state for resume."""
    suffix = f"_{tag}" if tag else f"_epoch{epoch}"

    # For "best" checkpoint, use EMA weights if available
    if tag == "best" and ema is not None:
        ema.apply_shadow(net_g)
        g_state = net_g.state_dict()
        ema.restore(net_g)
    else:
        g_state = net_g.state_dict()

    g_path = os.path.join(ckpt_dir, f"G{suffix}.pth")
    d_path = os.path.join(ckpt_dir, f"D{suffix}.pth")

    g_payload = {
        "model": g_state,
        "iteration": epoch,
        "optimizer": optim_g.state_dict(),
        "learning_rate": optim_g.param_groups[0]["lr"],
        "best_mel_loss": best_mel_loss,
    }
    if scheduler_g is not None:
        g_payload["scheduler"] = scheduler_g.state_dict()
    if ema is not None:
        g_payload["ema"] = ema.state_dict()

    d_payload = {
        "model": net_d.state_dict(),
        "iteration": epoch,
        "optimizer": optim_d.state_dict(),
        "learning_rate": optim_d.param_groups[0]["lr"],
    }
    if scheduler_d is not None:
        d_payload["scheduler"] = scheduler_d.state_dict()

    torch.save(g_payload, g_path)
    torch.save(d_payload, d_path)
    print(f"  Checkpoint saved: {tag or f'epoch {epoch}'}", flush=True)
    return g_path


def _try_resume(
    ckpt_dir: str,
    net_g, net_d, optim_g, optim_d,
    scheduler_g, scheduler_d,
    ema: ExponentialMovingAverage | None,
    device: str,
) -> int:
    """Try to resume training from the latest checkpoint. Returns start epoch."""
    ckpt_path = Path(ckpt_dir)
    g_files = sorted(ckpt_path.glob("G_epoch*.pth"))
    if not g_files:
        g_files = sorted(ckpt_path.glob("G_final.pth"))
    if not g_files:
        print("No checkpoint found for resume, starting fresh.", flush=True)
        return 1

    latest_g = str(g_files[-1])
    latest_d = latest_g.replace("/G_", "/D_").replace("\\G_", "\\D_")

    g_cpt = torch.load(latest_g, map_location=device, weights_only=False)
    net_g.load_state_dict(g_cpt["model"])
    if "optimizer" in g_cpt:
        optim_g.load_state_dict(g_cpt["optimizer"])
    if "scheduler" in g_cpt and scheduler_g is not None:
        scheduler_g.load_state_dict(g_cpt["scheduler"])
    if "ema" in g_cpt and ema is not None:
        ema.load_state_dict(g_cpt["ema"])

    if Path(latest_d).exists():
        d_cpt = torch.load(latest_d, map_location=device, weights_only=False)
        net_d.load_state_dict(d_cpt["model"])
        if "optimizer" in d_cpt:
            optim_d.load_state_dict(d_cpt["optimizer"])
        if "scheduler" in d_cpt and scheduler_d is not None:
            scheduler_d.load_state_dict(d_cpt["scheduler"])

    resume_epoch = g_cpt.get("iteration", 0) + 1
    print(f"Resumed from checkpoint (epoch {resume_epoch - 1})", flush=True)
    return resume_epoch
