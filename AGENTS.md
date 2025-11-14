# AGENTS.md

Overview

This document defines guidelines and rules for all agents collaborating on this repository (the core‑cloudflare‑management‑api project). It ensures consistency, quality, and that automation & testing adhere to our standards.

⸻

Agent Roles

We have several agent types in the project. Each must follow the rules below.

• Testing Agents

Includes any agent whose role is testing: e.g. grok tests, QA agents, build agents, infrastructure agents, and any agents with prefix agent-* used for test/integration tasks.

• Development Agents

Agents working on feature development, backend & frontend implementation, API integration, documentation, etc.

• Maintenance Agents

Agents focused on code cleanup, dependency updates, security patches, monitoring, etc.

⸻

Agent Guidelines

For All Agents
	1.	Agents must operate under a clear name and role (for traceability).
	2.	Agents must commit changes in self‑contained commits with descriptive messages.
	3.	Agents must reference relevant tickets/issues where applicable.
	4.	Agents must respect the repo’s branching strategy (e.g., main (or master) for production‑ready, develop for integration, feature branches for each task).
	5.	Agents must write documented code, include necessary tests and update README / docs as needed.

For Testing Agents (specific rules)

These are mandatory for all testing‑type agents:
	•	Rule: All testing agents must use ./safe_test.sh instead of calling curl directly.
This ensures consistent timeouts, prevents hanging processes, and enforces standard JSON parsing for all /health or /unit‑tests endpoints.
	•	Testing agents must be configured to fail builds if safe_test.sh returns non‑zero or unexpected output.
	•	Testing agents should include both happy‑path and edge‑path tests for all API endpoints.
	•	Test output must be machine‑parsable (JSON) so that CI systems can consume the results.
	•	Test agents should generate coverage reports and ensure coverage thresholds are maintained.
	•	Any new integration tests must be registered in the test manifest/config (e.g., tests/integration_manifest.yaml) and executed via CI.

For Development Agents
	•	New API endpoints must be documented in the docs/ directory (with examples).
	•	Agents must include versioning / changelog updates when the API surface changes.
	•	Agents must write automated tests (unit + integration) corresponding to any added functionality before merging.
	•	Agents must adhere to code style guidelines (linting, formatting) as defined (e.g., .eslintrc, go fmt, etc).
	•	Agents should reason about backwards compatibility: any breaking changes must bump major version or provide migration notes.
	•	**Cloudflare API Reference**: When working with Cloudflare API integrations, agents MUST consult the OpenAPI schema located at `api-schemas-main/common.yaml` for accurate endpoint definitions, request/response formats, and authentication requirements.

For Maintenance Agents
	•	Agents handling dependency upgrades must run a full test suite (via ./safe_test.sh) before merging.
	•	Agents handling security fixes must update relevant documentation and announce in CHANGELOG or SECURITY.md as appropriate.
	•	Agents must check that automated monitoring/logging is still valid after maintenance changes.

⸻

Agent Workflow
	1.	Agent identifies task/issue and creates a dedicated branch, naming it with prefix and issue number (e.g., agent‑qa/issue‑1234, agent‑backend/feature‑user‑roles).
	2.	Agent develops code/tests. For testing agents: ensure all calls use ./safe_test.sh.
	3.	Agent runs all tests locally.
	4.	Agent pushes branch and creates a pull request.
	5.	Reviewer (human or another agent) ensures compliance with guidelines (tests pass, code style, documentation updated).
	6.	Merge into develop (or appropriate branch). Then merge into main when release ready.
	7.	Agent closes issue, updates CHANGELOG.md if applicable.
	8.	Any “agent‑*” specific logs, outputs or artifacts should be stored in ci/artifacts/ or equivalent directory for retention.

⸻

CI/CD Integration
	•	The CI configuration must call ./safe_test.sh as the test entry point for all testing agents.
	•	Any direct API calls via curl (in scripts or pipeline steps) that are not invoked through safe_test.sh must be replaced or justified.
	•	CI must capture test results, coverage metrics, and fail builds if thresholds are not met.
	•	CI must enforce strict lint/format checks before allowing merges.

⸻

Monitoring & Reporting
	•	Agents should log operations in a standardized structured format (e.g., JSON with fields: agent, task, status, duration, timestamp).
	•	Any failures must trigger alerts (via Slack, email, or other) with relevant logs/artifacts.
	•	Agents that alter API behavior must update stakeholder documentation and notify relevant teams.

⸻

Escalation & Exceptions
	•	If an agent must bypass a rule (e.g., temporarily calling curl due to environment constraints), the agent must document the exception in the PR description and tag it with @agent‑exception label.
	•	Exceptions must be reviewed and approved by a human maintainer.
	•	Persistent or repeated exceptions without justification will trigger review of the agent’s behavior.

⸻

Cloudflare API Schema Reference

This project includes the official Cloudflare API OpenAPI schema for reference and validation.

Location
	•	Path: /Volumes/Projects/workers/core-cloudflare-management-api/api-schemas-main/common.yaml
	•	Source: Official Cloudflare API schemas (https://github.com/cloudflare/api-schemas)

When to Use
	•	Implementing new Cloudflare API integrations
	•	Validating API endpoint paths and parameters
	•	Understanding request/response formats
	•	Checking authentication requirements
	•	Looking up permission group names and IDs
	•	Debugging API integration issues

Best Practices
	•	Always consult the schema before implementing new API calls
	•	Use the schema to validate request/response structures in tests
	•	Reference the schema when documenting API integrations
	•	Keep the schema up-to-date by syncing with the official repository

Example Usage
	•	Finding permission groups: Search for "permission_groups" in common.yaml
	•	Checking endpoint paths: Look under the "paths" section
	•	Understanding authentication: Review the "securitySchemes" section
	•	Validating request bodies: Check the "requestBody" schema for each endpoint

⸻

Summary

By following these guidelines, all agents—whether building, testing, or maintaining—will contribute in a consistent, reliable manner to the core‑cloudflare‑management‑api project.

Let's keep it clean, automated, and dependable.

⸻

