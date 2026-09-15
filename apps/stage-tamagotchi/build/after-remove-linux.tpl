#!/bin/bash

# NOTICE:
# Electron Builder 26.8.1 removes the launcher path instead of the registered alternatives target.
# Its removal hook also runs after the new package install during an upgrade.
# Source: app-builder-lib/templates/linux/after-remove.tpl and the Fedora ARM64 package lifecycle test.
# Remove this hook when Electron Builder removes the target and preserves upgrade installations correctly.
if [ ! -e '/opt/${sanitizedProductName}/${executable}' ]; then
    if type update-alternatives >/dev/null 2>&1; then
        update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}' || true
    elif [ -L '/usr/bin/${executable}' ] && [ "$(readlink '/usr/bin/${executable}')" = '/opt/${sanitizedProductName}/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi

    APPARMOR_PROFILE_DEST='/etc/apparmor.d/${executable}'
    if [ -f "$APPARMOR_PROFILE_DEST" ]; then
        if apparmor_status --enabled >/dev/null 2>&1; then
            if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
                apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true
            fi
        fi
        rm -f "$APPARMOR_PROFILE_DEST"
    fi

    # RPM can leave unowned package directories after it removes their files.
    # Delete only empty directories so that user-created files remain intact.
    find '/opt/${sanitizedProductName}' -depth -type d -empty -delete 2>/dev/null || true
fi
