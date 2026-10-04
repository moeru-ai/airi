# Security Policy

## Supported Versions

AIRI is under active development. Security fixes target the latest official
release, including beta releases, and the default branch.

Older releases do not receive security backports. Upgrade to the latest
release before you reproduce a suspected vulnerability, when possible.

Reports that affect older releases are still welcome. Include the affected
version and explain whether the latest release has the same problem.

## Reporting a Vulnerability

Report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/moeru-ai/airi/security/advisories/new).

Do not publish exploit details in public issues, discussions, or pull requests
before coordinated disclosure.

Include:

- The affected component, version, or commit.
- Your operating system and relevant configuration.
- Reproduction steps and a minimal proof of concept.
- The expected behavior and actual behavior.
- The security impact and any required access or user interaction.

Remove credentials, API keys, session tokens, and personal data from reports.
Use test accounts and synthetic data where possible.

If you cannot reproduce the issue on the latest release, report it anyway.
Explain what you observed and what remains uncertain.

## Scope

We accept reports about AIRI code maintained in this repository, including:

- Web, Electron desktop, and mobile applications.
- Hosted API and authentication services.
- Shared packages, server runtime, and SDKs.
- First-party plugins and integrations.
- Build, release, and deployment workflows.

Examples of relevant vulnerabilities include:

- Unauthorized access to accounts, conversations, credentials, or other data.
- Cross-site scripting through character cards, chat content, or other imports.
- Untrusted content that causes unauthorized tool execution or system access.
- Electron renderer content that gains unauthorized main-process privileges.
- Malicious model files or other imports that escape their intended boundaries.
- Authentication bypass, authorization failures, or account isolation failures.
- Resource exhaustion through realistically reachable application inputs.
- Release or deployment workflows that expose secrets or execute untrusted code
  with privileged access.

Dependency vulnerabilities are relevant when they affect AIRI.
Explain how the affected dependency is reachable through AIRI and what impact
it causes.

## Research Guidelines

Use a local installation or accounts and resources that you own.
Repository scope does not authorize testing against live services.

Do not:

- Access or modify another person's data.
- Disrupt shared services or perform denial-of-service testing against them.
- Install persistence or continue exploitation after you demonstrate the issue.
- Use exposed credentials to access additional systems.

If you encounter private data or credentials, stop that part of the test.
Report the exposure privately without copying unnecessary sensitive data.

## Assessment

We assess reports based on reproducibility, reachability, and security impact.

Authentication requirements or user interaction do not automatically exclude
a vulnerability.

Prompt injection is relevant when it causes a concrete security impact, such
as unauthorized tool execution or access to protected data. Unexpected model
output alone does not establish a security vulnerability.

A dependency advisory or scanner result alone does not establish an AIRI
vulnerability. Include evidence of the affected code path and impact.

## Response and Coordinated Disclosure

We aim to acknowledge reports within seven calendar days.
For reports under investigation, we aim to provide an update at least every
fourteen calendar days.

These are response targets, not guarantees. Fix timelines depend on severity,
complexity, and maintainer availability.

We will explain whether we accept the report and what happens next.
If we decline it, we will explain our reasoning.

For accepted vulnerabilities, we will coordinate disclosure with the reporter.
We will discuss the disclosure date, affected versions, and available fixes.

We publish security advisories when appropriate. We credit reporters with
their permission and respect requests for anonymity.

## Published Advisories

See [AIRI security advisories](https://github.com/moeru-ai/airi/security/advisories)
for disclosed vulnerabilities and available fixes.
