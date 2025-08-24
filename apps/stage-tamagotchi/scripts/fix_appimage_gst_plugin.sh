#!/bin/bash
# AIRI AppImage execution fix script
# Sets GStreamer and WebKitGTK environment variables inside AppImage

APPDIR="$1"  # AppDir path passed by afterBuildCommand

echo "[AIRI-AppImage] Setting WebKit and GStreamer environment"

# Library paths
export LD_LIBRARY_PATH="$APPDIR/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
export XDG_DATA_DIRS="$APPDIR/usr/share:$APPDIR/usr/local/share:$XDG_DATA_DIRS"
export GSETTINGS_SCHEMA_DIR="$APPDIR/usr/share/glib-2.0/schemas"

# GStreamer
export GST_PLUGIN_PATH="$APPDIR/usr/lib/x86_64-linux-gnu/gstreamer-1.0"
export GST_PLUGIN_SCANNER="$APPDIR/usr/lib/x86_64-linux-gnu/gstreamer-1.0/gst-plugin-scanner"

# Include GStreamer plugins using linuxdeploy-plugin-gstreamer
if [ -f "$APPDIR/AppRun" ]; then
    echo "[AIRI-AppImage] Including GStreamer plugins"
    linuxdeploy-plugin-gstreamer --appdir "$APPDIR"
fi

echo "[AIRI-AppImage] fix completed"

