"""RVC GAN loss functions.

Ported from upstream RVC (MIT license):
  https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI
  infer/lib/train/losses.py
"""

import torch


def feature_loss(fmap_r: list[list[torch.Tensor]], fmap_g: list[list[torch.Tensor]]) -> torch.Tensor:
    """Feature matching loss between real and generated feature maps."""
    loss = torch.tensor(0.0, device=fmap_r[0][0].device)
    for dr, dg in zip(fmap_r, fmap_g):
        for rl, gl in zip(dr, dg):
            rl = rl.float().detach()
            gl = gl.float()
            loss += torch.mean(torch.abs(rl - gl))
    return loss * 2


def discriminator_loss(
    disc_real_outputs: list[torch.Tensor],
    disc_generated_outputs: list[torch.Tensor],
) -> tuple[torch.Tensor, list[torch.Tensor], list[torch.Tensor]]:
    """Hinge-style discriminator loss."""
    loss = torch.tensor(0.0, device=disc_real_outputs[0].device)
    r_losses: list[torch.Tensor] = []
    g_losses: list[torch.Tensor] = []
    for dr, dg in zip(disc_real_outputs, disc_generated_outputs):
        dr = dr.float()
        dg = dg.float()
        r_loss = torch.mean((1 - dr) ** 2)
        g_loss = torch.mean(dg**2)
        loss += r_loss + g_loss
        r_losses.append(r_loss.item())
        g_losses.append(g_loss.item())
    return loss, r_losses, g_losses


def generator_loss(
    disc_outputs: list[torch.Tensor],
) -> tuple[torch.Tensor, list[torch.Tensor]]:
    """Generator adversarial loss (least-squares GAN)."""
    loss = torch.tensor(0.0, device=disc_outputs[0].device)
    gen_losses: list[torch.Tensor] = []
    for dg in disc_outputs:
        dg = dg.float()
        l = torch.mean((1 - dg) ** 2)
        gen_losses.append(l.item())
        loss += l
    return loss, gen_losses


def kl_loss(
    z_p: torch.Tensor,
    logs_q: torch.Tensor,
    m_p: torch.Tensor,
    logs_p: torch.Tensor,
    z_mask: torch.Tensor,
) -> torch.Tensor:
    """KL divergence between posterior and prior in latent space."""
    z_p = z_p.float()
    logs_q = logs_q.float()
    m_p = m_p.float()
    logs_p = logs_p.float()
    z_mask = z_mask.float()

    kl = logs_p - logs_q - 0.5
    kl += 0.5 * ((z_p - m_p) ** 2) * torch.exp(-2.0 * logs_p)
    kl = torch.sum(kl * z_mask)
    loss = kl / torch.sum(z_mask)
    return loss
