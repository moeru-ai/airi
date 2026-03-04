# Windows — Troubleshooting & Diagnostic Guide

This document provides practical guidance to reproduce, diagnose, and mitigate common Windows-specific problems when running or packaging the project.

## Common symptom: application crashes at startup (example: "Cannot find module 'ms'")
**Symptom**: The packaged application exits immediately or logs a `Cannot find module 'ms'` error.

**Quick actions**
1. Run the application from a command prompt to capture stdout/stderr:
   ```powershell
   "C:\path\to\airi.exe"
