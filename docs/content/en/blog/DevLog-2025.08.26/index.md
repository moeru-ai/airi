---
title: DevLog @ 2025.08.26
category: DevLog
date: 2025-08-26
excerpt: |
  Sharing some progress on the pure-vision direction of `airi-factorio`, to solidify my thoughts before they evaporate.
preview-cover:
# TODO
---


<script setup lang="ts">
import NmsIou from './components/nms-iou.vue'
</script>


Long time no see, everyone. I am [@LemonNeko](https://github.com/LemonNekoGH), one of the maintainers of AIRI. ~~Ah, I am a bit tired of opening like this, like an LLM.~~


In my previous [DevLog](../DevLog-2025.07.18/index.md), I mentioned that I took a brief look at the [Factorio Learning Environment](https://arxiv.org/abs/2503.09617) paper and briefly talked about how we plan to improve `airi-factorio`. But... what I want to share today is not that, but the progress on the pure-vision direction.


In June of this year, [@nekomeowww](https://github.com/nekomeowww) released an almost real-time [VLM Playground](https://huggingface.co/spaces/moeru-ai/smolvlm-realtime-webgpu-vue) HuggingFace Space, which felt really cool. So I decided to first try simple real-time image recognition (at that time I still confused object detection with image recognition), then hand it to an AI for decision-making in some way, and finally output actions to the game to execute in some way.


Let me show you the result first:


<video src="/blog/DevLog-2025.08.26/assets/airi-factorio-yolo-v0-playground-vnc.mp4" controls />


In the video, I connected to VNC in the browser to play Factorio. The object detection results are on the right, almost real-time. I also deployed it to a [HuggingFace Space](https://huggingface.co/spaces/proj-airi/factorio-yolo-v0-playground); you are welcome to try it.


So, how did I do it?


## Putting the Factorio Client into Docker


To let the AI see the game screen, we need to ensure Factorio runs in a controllable environment, unaffected by our window size, position, etc. At the same time, we want this environment to be usable out of the box. So I chose to put Factorio into Docker.


Factorio officially provides a [Docker image](https://hub.docker.com/r/factoriotools/factorio), but it is server-only. To let the AI see the screen and control the game, we need a client. However, I could not find a ready-made Docker image (and Factorio's license does not allow distributing the client this way), so we had to package it ourselves (and we still cannot distribute our packaged client image; we can only share the Dockerfile).


So how many steps does it take to put the Factorio client ~~this elephant~~ into Docker ~~the refrigerator~~?


1. Download the Factorio client: of course, it is the protagonist.
2. Prepare a virtual display: applications with a GUI need a display to show their screen.
3. Prepare a VNC service: it can read the virtual display content, send the screen to an external VNC client, and pass user input to the game.


Seems like something is missing? Ah, audio? What audio? There is no audio. The current AI cannot hear sounds yet, so let's ignore it.


### Downloading the Factorio Client


On the official Factorio website, you can download directly by clicking, but it requires manual login, which is inconvenient for automating the build process. So I found a download script [factorio-dl](https://github.com/moviuro/factorio-dl/), a very complex shell script. Give it a username, password, and the version to download, and it will automatically download the corresponding client based on the system architecture.


### Preparing a Virtual Display


This step is a bit more involved, but not as complex as installing an entire desktop environment. It was also when I learned that GUI programs do not need a desktop environment or a window manager — just a minimal X environment and a display server is enough.


Very simple:

```bash
sudo apt install -y xvfb x11-apps mesa-utils
```


Where:


- `xvfb` is a virtual framebuffer and X server.
- `x11-apps` is a set of X-related tools; installing it also installs the X environment.
- `mesa-utils` is a set of Mesa-related tools. Mesa is a software implementation of OpenGL, and it provides tools to help us test and debug OpenGL programs.


### Preparing the VNC Service


VNC stands for Virtual Network Computing. It is a remote desktop protocol that lets us remotely control another computer, as if we were sitting right in front of it.

```bash
sudo apt install -y x11vnc
```


With these in place, we can run the Factorio client in Docker and control it with VNC.


But that is not enough. My goal was to play in the browser and run object detection inference in real time. However, browsers can only use the HTTP protocol, so we need a tool like `websockify` to convert the VNC protocol to HTTP. At the same time, for easier debugging, we also need a web interface to display the VNC screen, so we also need to install `novnc`.

```bash
sudo apt install -y websockify novnc
```


Okay, with that the Docker image is ready. You can see the complete [Dockerfile](https://github.com/moeru-ai/airi-factorio/blob/a6bf243f14cbc0d765ff7ed13389bca33c1fdfa2/docker/Dockerfile) and [usage instructions](https://github.com/moeru-ai/airi-factorio/tree/ba46a4e47b31187dd064b06314b595b551ed3411/apps/factorio-yolo-v0-playground).


## Training the Object Detection Model


For quick validation, I directly used the YOLO11n pretrained model as the basis to train our object detection model.


### Preparing the Dataset


This is how I collected the dataset:


1. Use the [`surface.create_entity`](https://lua-api.factorio.com/latest/classes/LuaSurface.html#create_entity) function to place machines at random positions in the scene, along with the size and position of the machines' selection boxes.
2. Use [`game.take_screenshot`](https://lua-api.factorio.com/latest/classes/LuaGameScript.html#take_screenshot) to take screenshots at various zoom levels and lighting conditions (daytime).
3. Generate annotation data based on the selection boxes and use [`helpers.write_file`](https://lua-api.factorio.com/latest/classes/LuaHelpers.html#write_file) to save them to files.


My collection script is [here](https://github.com/moeru-ai/airi-factorio/blob/ba46a4e47b31187dd064b06314b595b551ed3411/packages/factorio-rcon-snippets-for-node/src/factorio_yolo_dataset_collector_v0.ts). It uses `typescript-to-lua` to compile TypeScript into Lua, then uses RCON to pass it to Factorio for execution.


In the script, I collected three models of assembling machines and conveyor belts, 20 images per machine, each image 1280x1280 resolution, without UI.


Oh, also, to better debug my collection script, I developed a [VSCode extension](https://github.com/moeru-ai/airi-factorio/blob/ba46a4e47b31187dd064b06314b595b551ed3411/packages/vscode-factorio-rcon-evaluator/README.md) that provides a CodeLens action to compile and execute my script with one click.


After collecting the images and annotation data, we need to organize the dataset in [YOLO's official format](https://docs.ultralytics.com/datasets/detect/), then upload it to [Ultralytics Hub](https://www.ultralytics.com/hub) to see the effect:


![](/blog/DevLog-2025.08.26/assets/factorio-ultralytics-hub-preview.jpg)


Does it look okay? Then let's start training!


### Training the Model


Since I am a beginner, I started directly from [Get Started](https://docs.ultralytics.com/tasks/detect/) and copied these few lines of code:

```python
from ultralytics import YOLO

model = YOLO("yolo11n.pt")

model.train(data="./dataset/detect.yaml", epochs=100, imgsz=640, device="mps")

model.export(format="onnx")
```


At 640x640 resolution, using the MPS device (on macOS, using the MPS device gives better performance), I trained for 100 epochs with 5 batches per epoch, reaching the best result around epoch 70, and exported the ONNX model. Training took about 8 minutes, and the model is about 10MB.


You can see the dataset, training code, and exported ONNX model [here](https://github.com/moeru-ai/airi-factorio/blob/ba46a4e47b31187dd064b06314b595b551ed3411/apps/factorio-yolo-v0-playground).


## Running Inference


Now we can assemble the two parts above. I used:


1. `@novnc/novnc` to display the VNC screen in the browser, while extracting the canvas data to feed the model.
2. `onnxruntime-web` to run inference in the browser; it provides WebGPU support and can leverage GPU performance.


At first, inference was very slow — around 400ms — and it froze the UI, making it hard to even display VNC properly. I learned a bit of WebWorker usage on the fly and separated inference from display to solve the problem. I also discovered that I had not actually enabled WebGPU, so the speed was still slow.

```typescript
ort.InferenceSession.create(model, { executionProviders: ['webgpu', 'wasm'] })
```


You need to explicitly allow both WebGPU and WASM execution, so that when WebGPU is unavailable, it automatically falls back to WASM execution.


After enabling WebGPU, inference improved to around 80ms. I still thought it was slow, but I did not know how to keep optimizing. At that point, Cursor told me: "When normalizing pixel color values, you keep dividing by 255. You should compute `1/255` first and then multiply by that value, avoiding the division."


Hmm, wait — is division really slower than multiplication? It seems the computer science classes I skipped still need to be made up.


Following Cursor's advice, I changed the code, and inference improved to around 20ms — the experience is already very good.


We skipped the part about processing the model output. Now let's see how to handle it.


### Handling the Model Output


The model outputs an array of 84000 elements, with `dims` of `[1, 10, 8400]`. This means the 84000 elements are grouped in sets of 10: each group has the bounding box center x and y coordinates, the bounding box width and height, and the confidence for 6 classes — 8400 groups in total.


After filtering out low-confidence boxes with a confidence threshold of 0.6, we also need to use IOU as the NMS method to filter out overlapping boxes.


For IOU and NMS, you can refer to [this article](https://medium.com/@jesse419419/understanding-iou-and-nms-by-a-j-dcebaad60652). In short: add the areas of two boxes, subtract their overlap area to get the actual occupied area, then divide the overlap area by the actual occupied area to get the IOU.


I used a very simple NMS implementation: sort all boxes by confidence, iterate from high to low, and if a box's IOU with another is greater than 0.7, consider them the same object and filter it out.

```typescript
function nms(boxes: Box[], iouThreshold: number): Box[] {
  // 1. Filter by confidence and sort in descending order

  const candidates = boxes

    .filter(box => box.confidence > 0.6)

    .sort((a, b) => b.confidence - a.confidence)

  const result: Box[] = []

  while (candidates.length > 0) {
    // 2. Pick the box with the highest confidence

    const bestCandidate = candidates.shift()!

    result.push(bestCandidate)

    // 3. Compare with remaining boxes and remove ones with high IOU

    for (let i = candidates.length - 1; i >= 0; i--) {
      // The iou() function needs to be implemented separately, as described in the article.

      if (iou(bestCandidate, candidates[i]) > iouThreshold) {
        candidates.splice(i, 1)
      }
    }
  }

  return result
}
```


You can see the entire Playground source code [here](https://github.com/moeru-ai/airi-factorio/tree/ba46a4e47b31187dd064b06314b595b551ed3411/apps/factorio-yolo-v0-playground).


You can also play with IOU and NMS in the visualization component below by dragging the labels to move the boxes:

<div class="flex justify-center">
  <NmsIou />
</div>


### Problems Found


Through this practice, I found several problems:


1. Non-square images cannot be recognized: once a non-square image is encountered, the confidence of all results output by the model is very low, or even 0.
2. The model can distinguish level-1 and level-2 assembling machines, but it also recognizes square objects like chests as assembling machines.
3. In the actual game, machine sprites often have status indicators overlaid, such as power, the current recipe, and equipped modules, which interfere with the model's recognition.


## Finally


That is what I achieved this month. It was very rewarding. Many thanks to [@nekomeowww](https://github.com/nekomeowww), [@dsh0416](https://github.com/dsh0416), and [makito](https://github.com/sumimakito) for their help. Next, I should find ways to improve the model's performance, and then let the AI control the game in some way.

