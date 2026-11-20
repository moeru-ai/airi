# External gateway tool-result patch

This directory contains a patch and HTTP contract tests. It does not contain a gateway or account configuration.
The patch targets the external `zcgw-server.mjs` adapter. AIRI's OpenAI Compatible provider needs no product change.

## Failure and contract

AIRI returns `[{type: 'image_url', image_url: {url: 'data:image/png;base64,...'}}]` from `computer_use_read_image`.
The original adapter stringifies that array inside an Anthropic `tool_result`.
The model receives JSON text instead of an image.

The patch preserves ordered text/image blocks in native Anthropic content.
It accepts text strings and nonempty content arrays containing text or inline PNG, JPEG, and WebP images.
It validates canonical Base64, an 8 MiB decoded limit, MIME allowlist, and image signature agreement.
Signature validation is not a complete image decoder. A provider can reject corrupt image pixels explicitly.
Remote URLs and other content types fail with HTTP 400 before the upstream request.
A malformed successful model envelope fails with HTTP 502. Ordinary upstream HTTP errors remain explicit errors.

## Apply outside AIRI

Use an independent copy of the external gateway. Keep its account files and data directory outside this repository.
The source SHA-256 before newline normalization is `97ff0deb294cbc1576c49b127260c3a5c3c1a1132d05b716cd7de94fc0be0cfe`.
The normalized source hash is `c542916bec082a286b0ccc44be9615cdee7d44f9dace4a0ffe844130d2ec91a6`.
The normalized patched source hash is `fc645b84625a61d9f77d3e92ce1bad39a9249c7e64dda0295047e5b10ebc7697`.
Git's newline settings can change byte hashes. Verify the normalized source when line endings differ.

Set `GATEWAY_SANDBOX` to an existing external gateway copy. Then run these commands from the AIRI root:

```powershell
$gatewayRoot = (Resolve-Path $env:GATEWAY_SANDBOX).Path
$patch = (Resolve-Path ./scripts/gateway-tool-result/gateway-image-fix.patch).Path
git -C $gatewayRoot apply --unidiff-zero --check $patch
git -C $gatewayRoot apply --unidiff-zero $patch
$env:GATEWAY_SOURCE = Join-Path $gatewayRoot 'zcgw-server.mjs'
$env:TEST_TMPDIR = Join-Path $gatewayRoot 'contract-tests'
node --test --test-timeout=30000 scripts/gateway-tool-result/gateway-image.test.mjs
```

The tests copy only gateway source and `zcgw-fingerprint.mjs` into a fresh temporary directory.
They generate a dummy account and profile, start the actual gateway HTTP handler, and use a local fake upstream.
They set `ZCODE_HOME` to an empty test directory. Existing account stores are not read.
The tests do not call a real model, Electron, AUV, or the desktop.
Node.js 22 or later and the two external gateway source files are required. No new npm dependency is required.

## Real model configuration

Provide your authorized account and provider profile through the external gateway's existing setup.
Do not commit `accounts.json`, `zcode-profile.json`, gateway keys, or live traces.
Set these values only for the isolated gateway process:

| Setting | Value |
| --- | --- |
| HOST | 127.0.0.1 |
| PORT | 8789, or another available loopback port |
| GATEWAY_KEY | A process-private generated secret |
| ZCGW_DATA_DIR | The independent gateway data directory |
| ZCODE_HOME | An empty isolated directory, to prevent reading the existing client store |
| ZCODE_MODEL | GLM-5.3-Flash for the verified trial |

In AIRI, add an OpenAI Compatible provider in an independent Desktop profile.
Use the isolated gateway base URL ending in `/v1/`, its private key, and the exact model name.
Enable tool use and a model that accepts native tool-result images.
Select `Use computer` for that request. Keep all write operations closed.
For background verification, use a unique offscreen window and a random visual nonce absent from the prompt.
Ask the model to list windows, capture that window by title, read the image, and report its nonce and shapes.
Check native window identity and the fixture's independent expected result.

## Verified behavior

The original adapter failed image preservation, mixed content, invalid MIME rejection, and malformed model-envelope checks.
The patched adapter passed all 18 HTTP contract tests.
Two independent real Chat turns recognized fresh unknown visual nonces and both shape colors.
The second turn also retained the actual upstream Anthropic `tool_result.content[].type=image` request.
A real malformed-image request returned HTTP 400 with no upstream model request.

Those real turns used a new gateway directory and a new Electron profile.
The app's product code matched the accepted read-only baseline. Windows stayed offscreen or hidden throughout.
The first model trial guessed two invalid target forms before recovering. Its failures remain in the local trajectory.
The second trial inspected command help and selected the title correctly.
Local full traces, binary identity, image artifacts and native Oracle records are retained outside Git.

The external original gateway remains unchanged. Apply this patch in its own project through a separate reviewed change.
