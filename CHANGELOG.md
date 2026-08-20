# Changelog

All notable changes to `@aiyou-dev/cli` (aiyoucli) are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project uses [Semantic Versioning](https://semver.org/). History below was
backfilled from git tags on 2026-08-16 — future releases should add an entry
under `[Unreleased]` as part of the PR that introduces the change, not after
the fact.

## [Unreleased]

Nothing yet.

## [1.7.0] — 2026-08-20

### Added
- **A2A (Agent2Agent) protocol** — minimal `HTTP+JSON` binding hand-rolled against `a2aproject/A2A`'s `a2a.proto` (no new runtime dependencies). Agent Card at `/.well-known/agent-card.json`; `message:send`/`tasks/{id}`/`tasks/{id}:cancel`.
  - `aiyoucli a2a card <url>` / `a2a call <url> "<msg>" --skill <id>` — client direction, works from any host with shell access today.
  - `aiyoucli a2a serve [--agent <name>] [--runtime claude|opencode] [--auth-token <token>]` — server direction, exposing aiyou-team's own agents. `--runtime claude` (default) dispatches via `claude -p --agent <skill>`; `--runtime opencode` dispatches through a running (or auto-managed) `opencode serve`'s HTTP API — `opencode run --agent` can't address aiyou-team's runtime-registered subagents directly, so this goes under the CLI to `POST /session/{id}/message` with the resolved canonical agent id.
  - Secondary `a2a` MCP tool (`card`/`call` modes) for MCP-only hosts, per the existing mcp2cli convention.
- `aiyoucli agent list` / `agent set-model <agent> <model>` — per-agent model overrides (`Config.agents[name].model`), previously hardcoded by tier. Threaded into Claude Code's `.claude/agents/*.md` generation and, as a fallback beneath any explicit `aiyou-team.json` override, into OpenCode's auto model-selection.
- `aiyoucli plugin build [--out <dir>]` — packages the aiyou-team roster as a real Claude Code Plugin (`.claude-plugin/plugin.json`, `agents/*.md`, `hooks/hooks.json`, `.mcp.json`), reusing the same generators as the standalone `.claude/` path. Adds two new hooks beyond what `--with-hooks` already covered: `SessionStart` (roster + CLI-preference reminder as initial context) and `UserPromptSubmit` (routing hint from the existing Q-learning router, emitted only above a confidence threshold to avoid noise).

### Fixed
- A2A server: `message:send` now validates a request's `skillId` against what the server actually publishes (`aiyoucli a2a serve --agent <name>`'s filter) before dispatch, server-side — found via `/security-review` on this same change before release. Previously the filter only shaped the advertised Agent Card; any caller with the server's auth token could still request a different, more privileged agent (e.g. `coding-leader`, with Bash/Edit/Write) than the one the operator intended to expose.

## [1.6.3] — 2026-08-17

### Added
- `aiyoucli init --with-hooks` — opt-in PreToolUse/PostToolUse hooks in `.claude/settings.json` for `Edit|Write|MultiEdit`. Brings Claude Code to parity with OpenCode's `@aiyou-dev/team` lifecycle coverage (routing recommendation before edit, Q-table learning after edit). Off by default to match the `--with-mcp` precedent; existing init users won't see new hooks on re-init. New CLI flags: `pre-task --file <path> --edit-kind <mod|new|delete>` and `post-task --file <path>` (agent defaults to `claude` for Claude Code; set `AIYOUCLI_AUTO_AGENT` to override).
- `aiyoucli init --with-agents` — opt-in writing of 8 `.claude/agents/*.md` files (`coding-leader`, `coordination-leader`, `coding-executor`, `codebase-explorer`, `web-researcher`, `reviewer`, `principal-advisor`, `multimodal-looker`) so Claude Code's `task` tool can dispatch to aiyou-team agents. Off by default to mirror `--with-mcp`/`--with-hooks`. Fixes the user-reported "agents work in OpenCode but not in Claude Code" — Claude Code has no equivalent of OpenCode's `plugin:` field, so the agent identities must be written as project files. Each agent gets a tier-mapped model (`flagship → opus`, `strong/balanced → sonnet`, `fast → haiku`) and a per-agent tool allowlist derived from the upstream `@aiyou-dev/team` `requestedTools` (OpenCode-only names like `look_at`, `todowrite`, `delegate_status` dropped). Idempotent: `writeTextIfNotExists` on re-run; `--force` overwrites.

## [1.6.2] — 2026-08-16

### Changed
- CI: npm publish now authenticates via Trusted Publishing (OIDC) only — `secrets.NPM_TOKEN`/`NODE_AUTH_TOKEN` removed from both `publish` steps in `.github/workflows/ci.yml`, now that the trusted publisher is registered on npmjs.com for all 6 `@aiyou-dev/*` packages. The `NPM_TOKEN` secret itself is left in repo settings for now as an easy revert path until a tagged release has been observed to publish successfully this way — this release is that observation.

## [1.6.1] — 2026-08-16

### Fixed
- `aiyoucli codebase trace --direction callers|callees` — both values silently returned the same result as `both` (the underlying `trace_calls()` speaks `outbound`/`inbound` internally; neither `callers` nor `callees` matched, so both fell through to the both-directions wildcard). Now translated correctly at the `aiyoucli-napi` boundary.
- HNSW index (`aiyouvector-core`) leaked an orphaned graph node on every re-insert of an existing vector id (e.g. calling `memory store --id X` more than once). Now retires the old node the same way `remove()` already did, so the existing rebuild-on-heavy-deletion logic reclaims it.

### Changed
- CI: `publish` job now upgrades to the latest npm CLI before publishing, in preparation for npm Trusted Publishing (OIDC) — `secrets.NPM_TOKEN` stays in place as a fallback until the trusted publisher is registered on npmjs.com for all 6 packages (manual, account-owner-only step; see `ROADMAP.md`).

## [1.6.0] — 2026-08-16

### Added
- `aiyoucli memory export`/`memory import` (and `memory_export`/`memory_import` MCP tools) — dump/restore the vector store as JSON. Backed by a new `VectorDB::export_all()` in `aiyouvector-core`.
- `aiyoucli completions` now supports `fish` and `powershell` (alias `pwsh`), in addition to `bash`/`zsh`.
- `aiyoucli daemon start`/`status`/`stop` — real implementation, wiring up the previously-orphaned `WorkerDaemon`/`WorkerQueue` services. Foreground process + PID file, same shape as `mcp start`.
- `aiyoucli update check`/`install` — real implementation, checks/installs from npm.
- `aiyoucli init --with-mcp` — MCP server wiring (`.mcp.json`/opencode.json) is now **off by default**; agents use the CLI directly via shell. `AGENTS.md` generation now includes CLI-first and graph-first ("use `codebase search|trace|query`, not file reads") guidance.
- `CHANGELOG.md` and `ROADMAP.md` — project now tracked like a proper open-source project; `ROADMAP.md` corrects several stale "still missing" claims in the old Ruflo comparison docs.

### Changed
- `daemon` and `update` no longer print "not yet implemented" — see Added above.

## [1.5.0] — 2026-08-16

### Added
- PDF → Markdown conversion, pure Rust (`pdfrs`), no Python/Poppler/PDFium. `aiyoucli pdf2md <file.pdf>` and the `pdf_to_markdown` MCP tool.

### Fixed
- CI: stop a free-function `dead_code` lint failure; gate `publish` on Rust tests passing.

## [1.4.0] — 2026-08-16

### Added
- Knowledge graph now persists to disk and feeds routing decisions.
- Consolidated aiyouvector's standalone MCP server into aiyoucli (`codebase_*` tools), CLI-first (`aiyoucli codebase ...`).

### Fixed
- Compressor: underflow panic in `truncate_middle`.

## [1.3.2] — 2026-08-12

### Fixed
- Proxy/version/distance fixes; release gate now actually holds on failure instead of publishing anyway.

## [1.3.1] — 2026-07-30

### Fixed
- CI: `publish` job now waits for the build matrix to finish uploading artifacts before running.

## [1.3.0] — 2026-07-30

### Changed
- `semantic.rs` and `ast.rs` replaced with thin wrappers over `aiyouvector-routing` / `aiyouvector-codebase` (removes duplicated logic).
- `agent`/`swarm`/`task`/`session` tools removed from the surface (documented as intentionally descoped — see the Ruflo comparison docs).
- `src/models/` extracted to the optional `@aiyou-dev/models-local` dependency.
- `aiyoucli init` now hooks the aiyouvector daemon watch.
- Codebase-wide `rustfmt` pass for consistent formatting.

### Fixed
- Several CI/publish reliability fixes (cross-compile tolerance, duplicate conditions, deterministic Q-table persistence test).

## [1.2.0] — 2026-07-25

### Added
- Spanish documentation; expanded generator templates (team agent + skill details).
- `aiyoucli team register` / `aiyoucli team doctor` for aiyou-team plugin management.
- Q-table seeding via semantic agent profile exposure.

### Changed
- Consolidated 29 redundant MCP tools into 8 flexible ones (dispatch by `action`/`scope`/`mode`/`type`), plus discovery tools.
- `aiyoucli init` supports `--force` to overwrite `AGENTS.md`.

## [1.0.2] — 2026-07-15

### Added
- Proxy + `rd` crates, ONNX embed server, semantic router.
- Local model engine: interactive start, MinIO, VRAM management, OpenCode integration, Wake-on-Request task modes.
- aiyou-team agent support with automatic OpenCode configuration.

### Changed
- Removed the `aiyoucli` wrapper package; `@aiyou-dev/team` is now a local dependency.

## [0.1.0] — 2026-03-31

Initial public release.

### Added
- Rust NAPI workspace (`crates/aiyoucli-napi`) wrapping `aiyouvector` crates: vector memory (HNSW + redb), SONA learning, attention, Q-learning routing, diff/commit/complexity analysis.
- TypeScript CLI shell — 21 commands, MCP stdio server (51 tools at the time), production hardening (circuit breaker, retry, rate limiter).
- `aiyoucli init` — generates `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, statusline hook.
- Markdown → TOON distiller (~52% token reduction) for skills and `AGENTS.md`.
- Cross-platform npm packaging (5 platform binaries) with CI-driven publish.
- 86 vitest tests across 7 suites.

### Fixed
- Path traversal, prototype pollution, and input validation hardening.
- Vector memory persistence between CLI invocations.

[Unreleased]: https://github.com/faugustdev/aiyoucli/compare/v1.6.2...HEAD
[1.6.2]: https://github.com/faugustdev/aiyoucli/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/faugustdev/aiyoucli/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/faugustdev/aiyoucli/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/faugustdev/aiyoucli/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/faugustdev/aiyoucli/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/faugustdev/aiyoucli/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/faugustdev/aiyoucli/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/faugustdev/aiyoucli/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/faugustdev/aiyoucli/compare/v1.0.2...v1.2.0
[1.0.2]: https://github.com/faugustdev/aiyoucli/compare/v0.1.0...v1.0.2
[0.1.0]: https://github.com/faugustdev/aiyoucli/releases/tag/v0.1.0
