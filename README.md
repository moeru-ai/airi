# AIRI Enhanced Fork

> Enhanced fork of [Project AIRI](https://github.com/moeru-ai/airi) with improved Live2D integration and audio pipeline optimization.

## Fork Enhancements

### 🎭 Live2D Integration Improvements
- **Transparent Background Support**: Clean visual presentation for Live2D models
- **Performance Optimization**: Reduced audio processing overhead and improved frame rates

### 🔧 Technical Fixes
- **TypeScript Compliance**: Resolved all TypeScript errors and improved type safety
- **Code Cleanup**: Removed debug logging and unnecessary comments for production readiness
- **Memory Management**: Optimized audio buffer handling and reduced memory leaks

### 🎵 Audio System Enhancements
- **Enhanced Speech Synthesis**: Improved audio quality and processing reliability

### 🎨 UI/UX Improvements
- **Optimized Window Size**: Better default dimensions for desktop application
- **Clean Interface**: Removed development artifacts for cleaner user experience
- **Voicing**: Added buttons on\off to chat to voicing output text.

## Quick Start

### Prerequisites
- Node.js and pnpm
- Rust toolchain
- **Whisper** (for audio transcription):
  ```bash
  # Install Whisper via pip
  pip install openai-whisper
  
  # Download recommended model (base model - good balance of speed/accuracy)
  whisper --model base --download-root ~/.cache/whisper
  
  # Alternative: smaller model for faster processing
  whisper --model tiny --download-root ~/.cache/whisper
  ```

### Installation

```shell
# Install dependencies
pnpm i
# Run desktop version with Live2D enhancements
pnpm dev:tamagotchi
```

## Original Project

For complete documentation, setup instructions, and project information, please visit the original [Project AIRI](https://github.com/moeru-ai/airi) repository.

## Key Differences from Original

This fork specifically focuses on:
- Audio processing pipeline optimization

All other features and capabilities remain the same as the original project.

## Future Development Plans

### 🎯 Roadmap
- **Simplified Settings Menu**: Streamline configuration options for better user experience
- **Widget-Only Version**: Focus development on Tamagotchi widget as the primary interface
- **Enhanced UI/UX**: Further interface improvements and modernization
- **Performance Optimization**: Continue optimizing audio processing and Live2D rendering

### 🚀 Vision
This fork aims to become a lightweight, user-friendly desktop companion focused on the Tamagotchi experience with minimal configuration complexity.
