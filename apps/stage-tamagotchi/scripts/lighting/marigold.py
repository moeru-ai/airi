"""Infer a normal map from one JSON request on stdin; stdout contains only JSON.

The desktop host owns process lifetime. Weights must already exist locally.
"""

import base64
import contextlib
import io
import json
import os
import sys
import time

with contextlib.redirect_stdout(sys.stderr):
    import numpy as np
    import torch
    from diffusers import MarigoldNormalsPipeline
    from PIL import Image

    request = json.load(sys.stdin)
    source = Image.open(io.BytesIO(base64.b64decode(request["png"].split(",", 1)[1]))).convert("RGBA")
    if source.width > 2048 or source.height > 2048:
        raise ValueError("The normal capture exceeds 2048 pixels.")
    rgb = Image.new("RGB", source.size, (127, 127, 127))
    rgb.paste(source, mask=source.getchannel("A"))
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float32 if device == "cpu" else torch.float16
    torch.set_num_threads(4)
    started = time.monotonic()
    checkpoint = "prs-eth/marigold-normals-v1-1"
    revision = "09cfdd258cb281fa006cf1afcd2284376d16687d"
    pipe = MarigoldNormalsPipeline.from_pretrained(
        checkpoint, revision=revision, variant="fp16", torch_dtype=dtype,
        cache_dir=os.environ["AIRI_NORMAL_WEIGHTS"], local_files_only=True,
    ).to(device)
    with torch.inference_mode():
        result = pipe(rgb, num_inference_steps=4, ensemble_size=1,
                      processing_resolution=640, match_input_resolution=True,
                      generator=torch.Generator(device="cpu").manual_seed(17))
    normals = result.prediction[0]
    if normals.shape != (source.height, source.width, 3) or not np.isfinite(normals).all():
        raise ValueError("Marigold returned an invalid normal field.")
    lengths = np.linalg.norm(normals, axis=-1, keepdims=True)
    if np.any(lengths < 0.5):
        raise ValueError("Marigold returned invalid normal vectors.")
    normals = normals / lengths
    pixels = np.round(np.clip(normals * 0.5 + 0.5, 0, 1) * 255).astype(np.uint8)
    output = io.BytesIO()
    Image.fromarray(pixels).save(output, format="PNG")
    response = dict(png=base64.b64encode(output.getvalue()).decode("ascii"),
                    model=checkpoint, revision=revision, steps=4, seed=17,
                    device=device, seconds=time.monotonic() - started)

json.dump(response, sys.stdout)
