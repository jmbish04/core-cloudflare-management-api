# Agent Guidelines

This document describes the guidelines and rules for all agents working on this project.

## Testing Agents

### Grok and Test-Related Agents

All testing agents (including Grok, QA agents, build agents, infrastructure agents, and any agent-* variants) must follow these rules:

**Rule: All testing agents must use ./safe_test.sh instead of calling curl directly.**

This ensures consistent timeouts, prevents hanging processes, and enforces standard JSON parsing for all /health/unit-tests endpoints.

