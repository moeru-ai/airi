# Airi Tamagotchi - Enhanced Fork


## ✨ Key Features

### 🎤 Voice Recognition & Speech
- **Push-to-talk functionality** - Record voice messages using microphone button
- **Local Whisper transcription** - Speech-to-text conversion using local Whisper model
- **Automatic message sending** - Transcribed text is automatically sent to chat
- **Real-time audio processing** - 16kHz sample rate for optimal Whisper compatibility
- **Recording duration indicator** - Visual feedback during voice recording

### 🔊 Text-to-Speech Features
- **Message playback** - Click speaker button to hear any chat message
- **Voice control toggle** - Enable/disable speech synthesis globally
- **Replay functionality** - Re-play previously spoken messages
- **Multiple TTS providers** - Support for various speech synthesis services:
  - OpenAI Audio Speech
  - ElevenLabs
  - Microsoft Speech
  - Player2 Speech
  - And many more
- **Voice customization** - Configure voice, speed, pitch, and other parameters

### 🖼️ UI/UX Enhancements
- **Optimized window size** - Perfect 300x400px dimensions for desktop widget
- **Always visible controls** - Chat and settings buttons remain accessible in widget mode
- **Clean interface** - Production-ready appearance without debug elements
- **Speech controls** - Integrated microphone and speaker buttons in chat interface


## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## 📋 Requirements

### For Voice Recognition
- **Local Whisper Model** - Download and configure a local Whisper model for speech transcription
- **Microphone access** - Grant microphone permissions for voice recording
- **Audio input device** - Working microphone or audio input device

### For Text-to-Speech
- **TTS Provider** - Configure at least one speech synthesis provider in settings
- **API Keys** - Obtain API keys for your chosen TTS service (if required)
- **Audio output device** - Working speakers or headphones

## 🎮 Usage

### Chat Interaction
1. **Text Chat** - Type messages in the input field and press Enter
2. **Voice Input** - Hold microphone button to record voice messages
3. **Speech Playback** - Click speaker button next to any message to hear it spoken
4. **Voice Toggle** - Use the speech control button to enable/disable TTS globally

### Configuration
1. **Speech Settings** - Configure TTS providers, voices, and parameters
2. **Hearing Settings** - Set up Whisper model and microphone preferences
3. **Provider Setup** - Add API keys and configure speech synthesis services

### Widget Mode
- Minimize to desktop widget with Live2D animations
- All speech and voice features remain functional in widget mode
- Compact interface optimized for continuous use

## 🔗 Original Project

Based on [Airi](https://github.com/airi-ai/airi) - AI companion platform

---

*This fork focuses on production-ready Live2D integration, comprehensive speech synthesis, voice recognition capabilities, and optimized user experience.*
