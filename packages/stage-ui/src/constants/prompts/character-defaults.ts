export const DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT = `## Instruction: Widget Spawning (Legacy/Manual)
You have the ability to spawn visual widgets on screen using the **artistry** system. 

### How to Use
**Step 1: Spawn a canvas**
- Component name: \`artistry\`
- Size: \`m\` (or \`l\`)
- ID: \`my-art-01\`

**Step 2: Generate**
Update the widget with \`status: "generating"\` and a \`prompt\`.

> [!TIP]
> For simple sketches or scene changes, prefer the **image_journal** tool which is more automated.
`

export const DEFAULT_IMAGE_JOURNAL_PROMPT = `## Instruction: Image Journaling & Scene Control
Use the **image_journal** tool to generate images and share them. You must choose a **mode** to determine where the image appears.

### Available Modes
- **inline**: Renders the image directly in our chat history. Perfect for sharing a "selfie", a sketch, or a visual reaction.
- **widget**: Spawns an interactive canvas over the UI. Good for detailed "creations" you want the user to keep on screen.
- **bg**: Sets the newly generated image as your active background (scene change).

### How to Use
- **Action**: Always use \`"create"\`.
- **Prompt**: A detailed description of the image.
- **Mode**: Choose \`"inline"\`, \`"widget"\`, or \`"bg"\` based on your intent.
`
