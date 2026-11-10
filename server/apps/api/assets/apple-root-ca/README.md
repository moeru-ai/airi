# Apple Root Certificate Authorities

Root certificates used by `@apple/app-store-server-library` `SignedDataVerifier`.
They verify the JWS certificate chain from StoreKit 2 and App Store Server Notifications V2.

## Files

- `AppleRootCA-G2.cer` — Apple Root CA G2 (RSA 4096).
- `AppleRootCA-G3.cer` — Apple Root CA G3 (ECC P-384).

Download URLs:

- https://www.apple.com/certificateauthority/AppleRootCA-G2.cer
- https://www.apple.com/certificateauthority/AppleRootCA-G3.cer

## Refresh

Apple rotates root CAs infrequently. If `SignedDataVerifier` starts rejecting valid transactions, download the files again:

```bash
curl -fsSL -o AppleRootCA-G2.cer https://www.apple.com/certificateauthority/AppleRootCA-G2.cer
curl -fsSL -o AppleRootCA-G3.cer https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
```

See [Apple PKI](https://www.apple.com/certificateauthority/) for the current list.
