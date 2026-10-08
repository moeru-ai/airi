# Steam managed services

Steam uses bundled Sherpaw transcription and project-managed chat, ordinary speech, and vision services. Silence remains an explicit choice. Other distributions retain their provider choices.

Provider discovery, saved instances, catalogs, factories, and direct transports enforce the same allowed definitions. Steam disables drawing, Tavily, Discord, and X configuration and execution. Uploaded images remain available for vision.

Restore the reviewed restrictions from commits 6567c7547 and de69f1e7f without restoring remote transcription. Verify stale selections and settings URLs. Run related tests, root typecheck, lint, desktop build, and Windows packaging. Keep account data and unrelated edits. Do not upload or submit this build during implementation.

A successful local test does not certify Steam installation or AI content disclosure. Final acceptance requires the exact Steam build and a user-confirmed audible response.

## Release status on 2026-10-08

The implementation phase is complete for the local Windows candidate. The user authorized its Steam upload after a clean-profile manual test.

Build 25797796 is live on `internal-test`. Its Windows depot uses the new candidate. Its macOS and Linux depots retain older packages.

The default branch still uses build 24551505. No new review request is complete.

The user chose to retain all three platforms. Submission waits for the same fixes and runtime acceptance on macOS and Linux.

The current Content Survey still describes remote transcription. Update that description after all supported platform packages match the local transcription policy.

The removed allowance paragraph is not part of the account page. The Content Survey and review notes still explain service costs and allowance limits.

See [the submission plan](steam-review-submission-2026-10-08.md) for draft text, depot provenance, and acceptance requirements.
