# Native file chooser

Use this path only after DOM inspection shows that the flow does not expose an addressable HTML file input. Examples include platform-native pickers, a native bridge that returns file handles, and controls implemented outside the inspected renderer.

Agent Browser's `upload` command assigns files to an HTML input; it does not drive arbitrary operating-system picker windows. Choose the boundary that owns the picker:

- In Electron, use `$agent-browser-electron` to identify the renderer and determine whether the application ultimately creates an HTML input there. If it does, return to the attached or detached method.
- For a genuine Electron main-process or operating-system dialog, use the platform automation mechanism supported by the test environment, then return to Agent Browser for renderer verification.
- For Android or iOS native document pickers, use emulator/simulator automation and report that separately from browser-layout coverage.
- If the picker cannot be controlled safely, report the native selection checkpoint as not runnable. Do not substitute a typed path, synthetic filename, or viewport emulation and call it covered.

After native selection, use [verify-upload.md](verify-upload.md) to validate the application-visible result.
