# Cloud client

This package contains the generated client for AIRI Cloud. Use it for Cloud announcements and wallet reads. Keep Auth and resource calls in their existing clients.

The contract source is the Cloud protobuf API. The backend generates OpenAPI through gRPC Gateway. Copy the resulting Cloud OpenAPI document to `openapi.yaml`, then run `pnpm -F @proj-airi/cloud-client generate`.

Do not edit `src/generated`. Pass the base URL and request options per call. Public announcement calls do not send credentials.
