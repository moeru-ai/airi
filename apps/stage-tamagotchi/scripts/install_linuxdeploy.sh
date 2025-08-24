#!/bin/bash
# Install linuxdeploy and gstreamer plugin for AppImage packaging

set -e

# Download linuxdeploy
if ! command -v linuxdeploy &>/dev/null; then
    echo "[AIRI-AppImage] Installing linuxdeploy"
    curl -LO -f https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage
    chmod +x linuxdeploy-x86_64.AppImage
    sudo mv linuxdeploy-x86_64.AppImage /usr/local/bin/linuxdeploy
fi

# Download linuxdeploy-plugin-gstreamer
if ! command -v linuxdeploy-plugin-gstreamer &>/dev/null; then
    echo "[AIRI-AppImage] Installing linuxdeploy-plugin-gstreamer"
    curl -LO -f https://github.com/linuxdeploy/linuxdeploy-plugin-gstreamer/releases/download/continuous/linuxdeploy-plugin-gstreamer-x86_64.AppImage
    chmod +x linuxdeploy-plugin-gstreamer-x86_64.AppImage
    sudo mv linuxdeploy-plugin-gstreamer-x86_64.AppImage /usr/local/bin/linuxdeploy-plugin-gstreamer
fi

echo "[AIRI-AppImage] linuxdeploy setup completed"

