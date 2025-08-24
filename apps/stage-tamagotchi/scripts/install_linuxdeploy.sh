#!/bin/bash
# Install linuxdeploy and gstreamer plugin for AppImage packaging

set -e

# Download linuxdeploy
if ! command -v linuxdeploy &>/dev/null; then
    echo "[AIRI-AppImage] Installing linuxdeploy"
    curl -L -o linuxdeploy-$(arch).AppImage \
    https://github.com/linuxdeploy/linuxdeploy/releases/download/1-alpha-20250213-2/linuxdeploy-$(arch).AppImage
    chmod +x linuxdeploy-$(arch).AppImage
    sudo cp linuxdeploy-$(arch).AppImage /usr/local/bin/linuxdeploy
fi

# Download linuxdeploy-plugin-gstreamer
if ! command -v linuxdeploy-plugin-gstreamer &>/dev/null; then
    echo "[AIRI-AppImage] Installing linuxdeploy-plugin-gstreamer"
    curl -L -o linuxdeploy-plugin-gstreamer.sh \
    https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gstreamer/2a2e67491c32995a3f279ad0ecbe77abd512b42a/linuxdeploy-plugin-gstreamer.sh

    chmod +x linuxdeploy-plugin-gstreamer.sh
    sudo cp linuxdeploy-plugin-gstreamer.sh /usr/local/bin/linuxdeploy-plugin-gstreamer
fi

echo "[AIRI-AppImage] linuxdeploy setup completed"

