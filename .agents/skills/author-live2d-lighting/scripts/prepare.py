"""Unpack a neutral capture and create alpha-masked atlas contact sheets.

Usage: python prepare.py CAPTURE_JSON MODEL_ZIP OUTPUT_DIRECTORY
The capture comes from captureNormalReference in an isolated devtool renderer.
"""
import base64
import io
import json
import math
import pathlib
import posixpath
import sys
import zipfile

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

capture_path, archive_path, output_path = sys.argv[1:]
out = pathlib.Path(output_path)
out.mkdir(parents=True, exist_ok=True)
capture = json.loads(pathlib.Path(capture_path).read_text())
for key in ("neutral", "ownership", "coverage"):
    (out / f"{key}.png").write_bytes(base64.b64decode(capture.pop(key).split(",", 1)[1]))
    capture[key] = f"{key}.png"
(out / "capture.json").write_text(json.dumps(capture))
with zipfile.ZipFile(archive_path) as archive:
    models = [p for p in archive.namelist() if p.endswith(".model3.json") and not p.startswith("__MACOSX/")]
    if len(models) != 1:
        raise ValueError("Select an archive with exactly one model3.json before creating the contact sheet.")
    model = models[0]
    textures = json.loads(archive.read(model))["FileReferences"]["Textures"]
    textures = [Image.open(io.BytesIO(archive.read(posixpath.join(posixpath.dirname(model), p)))).convert("RGBA") for p in textures]
font = ImageFont.load_default(size=13)
for page in range(math.ceil(len(capture["drawables"]) / 48)):
    sheet = Image.new("RGB", (960, 1280), (38, 42, 50))
    draw = ImageDraw.Draw(sheet)
    for slot, drawable in enumerate(capture["drawables"][page * 48:(page + 1) * 48]):
        atlas = textures[drawable["texture"]]
        uv = drawable["atlasUvs"]
        points = [(uv[i] * atlas.width, (1 - uv[i + 1]) * atlas.height) for i in range(0, len(uv), 2)]
        box = (math.floor(min(p[0] for p in points)), math.floor(min(p[1] for p in points)), math.ceil(max(p[0] for p in points)), math.ceil(max(p[1] for p in points)))
        crop = atlas.crop(box)
        mask = Image.new("L", crop.size)
        raster = ImageDraw.Draw(mask)
        indices = drawable["indices"]
        for i in range(0, len(indices), 3):
            raster.polygon([(points[k][0] - box[0], points[k][1] - box[1]) for k in indices[i:i + 3]], fill=255)
        crop.putalpha(ImageChops.multiply(crop.getchannel("A"), mask))
        crop = ImageOps.contain(crop, (150, 132))
        x, y = slot % 6 * 160, slot // 6 * 160
        sheet.paste(crop, (x + (160 - crop.width) // 2, y + 22 + (132 - crop.height) // 2), crop)
        draw.text((x + 4, y + 3), f'{page * 48 + slot}: {drawable["id"]}', font=font, fill="white")
    sheet.save(out / f"layers-{page + 1}.png")
print(f"Wrote capture and {page + 1} contact sheets to {out}")
