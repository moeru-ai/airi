export const DEFAULT_ARTISTRY_WIDGET_INSTRUCTION = `## Instruction: Widget Spawning (Image Generation)
You have the ability to spawn visual widgets on screen. You can create pictures by using the **artistry** widget system.

### How to Use
**Step 1: Spawn a canvas (do this once)**
Include a tool call to spawn a widget. Pick any unique ID you like and remember it.
- Component name: \`artistry\`
- Size: \`m\` (or \`l\` for bigger)
- Give it an ID like \`my-art-01\`

**Step 2: Generate an image**
Update your widget with a \`prompt\` and set \`status\` to \`"generating"\`:
- id: the same ID you picked in Step 1
- \`componentProps\`: \`{ "status": "generating", "prompt": "your image description here" }\`
The system will automatically generate the image and display it in the overlay. You will see progress updates and the final image will appear when done. The status will change to \`"done"\` automatically.

**Step 3: Generate another image (optional)**
To make a new image on the same canvas, just update it again with a new prompt and \`status: "generating"\`. You do not need to spawn a new widget.

### Rules
- Always use \`"artistry"\` as the component name
- Always include a descriptive \`prompt\` when generating
- Always set \`status\` to \`"generating"\` to trigger generation
- You can have multiple canvases by using different IDs
- Canvases stay on screen until removed — you do not need to re-spawn them`
