# Setup SwiftLint Action

A reusable GitHub Action that downloads and installs SwiftLint binary from [SwiftLint releases](https://github.com/realm/SwiftLint/releases/) to `/usr/bin`.

## Usage

### Basic usage

```yaml
- uses: ./.github/actions/setup-swiftlint
```

This will install the latest version of SwiftLint.

### Specify version

```yaml
- uses: ./.github/actions/setup-swiftlint
  with:
    version: '0.58.2'
```

Or use version with `v` prefix:

```yaml
- uses: ./.github/actions/setup-swiftlint
  with:
    version: 'v0.58.2'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `version` | SwiftLint version (e.g., `0.58.2`). If not specified, the latest version will be used | No | `latest` |

## Example workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Install SwiftLint
        uses: ./.github/actions/setup-swiftlint
        with:
          version: '0.58.2'
      
      - name: Run SwiftLint
        run: swiftlint
```

## Supported operating systems

- macOS
- Linux

## Notes

- This action requires `sudo` permissions to install the binary to `/usr/bin`
- After installation, the `swiftlint` command will be globally available in PATH
- If the specified version does not exist, the action will fail with an error message
