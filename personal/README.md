# Personal companion

This folder holds the changes that make this fork your own desktop companion.
Upstream AIRI does not have these changes.

## Where the files are

| File | What it does | Do you edit it? |
| --- | --- | --- |
| `.github/workflows/personal-build-windows.yml` | Builds the Windows installer on GitHub. | No |

## Get the app

You do not need to install development tools for this. GitHub builds the installer for you.

1. Open your fork on GitHub.
2. Click the **Actions** tab.
3. If GitHub asks you to enable workflows for the fork, click the button to enable them.
4. In the list on the left, click **Personal Build (Windows)**.
5. Click **Run workflow**. Select the branch that has your changes, then click the green **Run workflow** button.
6. Wait until the run has a green check mark. A build can take up to one hour.
7. Open the run. Under **Artifacts**, download `airi-personal-windows-x64`. It is a ZIP file.
8. Extract the ZIP file and run `AIRI-<version>-windows-x64-setup.exe`.

The installer has no code signature. Windows SmartScreen can show "Windows protected your PC". Click **More info**, then **Run anyway**.

Do not use the update button inside the app.
The updater downloads the upstream AIRI release, and that release does not have your changes.
To update, run the workflow again and install the new installer.

## Known limits

- The update button inside the app installs upstream AIRI, not your build.
