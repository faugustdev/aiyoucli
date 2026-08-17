# Roadmap

Living source of truth for what's next. Supersedes the gap tables in
`docs/RUFLO-V3-VS-AIYOUCLI.md` and `docs/COMPARISON.md` (both are frozen
historical snapshots — see the notice at the top of each).

**Working style: small, independently-shippable items only.** Every entry
here should land in one PR without needing a design doc first. When you pick
one up: open a GitHub issue linking back to this entry, ship it, add a
`CHANGELOG.md` entry under `[Unreleased]`, check it off here. No big-bang
rewrites — if an item feels like it needs one, split it first.

Last audited against actual source: 2026-08-16.

---

## Already done (the old gap docs were wrong about these)

The Ruflo comparison docs (written at the 1.0 migration) list these as
missing. They've since shipped — corrected here so nobody re-implements them:

| Item | Evidence |
|---|---|
| Q-table persistence | `.aiyoucli/q-table.json`, auto-saved on `hooks_post_task` (`src/mcp/tools/hooks-tools.ts`) |
| Experience replay | `replay_buffer_size` / `replay_buffer_full` in `routing.rs` Q-learning stats |
| HNSW in memory tools | `enable_hnsw` (default `true`) on `memory_init` / `aiyoucli memory init` |
| Monitoring / tool-call metrics | `metrics` MCP tool — `action: tools_summary\|latency\|cost\|memory` |
| AST analyzer | Real tree-sitter (19 languages) via `aiyouvector-codebase`, not regex — `crates/aiyoucli-napi/src/ast.rs` |
| Memory export/import | `aiyoucli memory export`/`memory import`, `memory_export`/`memory_import` MCP tools — shipped 2026-08-16 |
| Fish/PowerShell completions | `aiyoucli completions fish\|powershell` — shipped 2026-08-16 |
| `daemon`/`update` real implementations | No longer stubs — `daemon start\|status\|stop` (PID-file based), `update check\|install` — shipped 2026-08-16. Note: the daemon's task queue still has no default producer wired up (`WorkerDaemon.dispatch()` is available for future callers) |

---

## Next up (small, low-risk — pick any, one PR each)

Empty right now — the three items that were here (memory export/import, fish/
powershell completions, real daemon/update) all shipped 2026-08-16, moved to
"Already done" above. Pull the next batch from "Needs re-verification" below,
or from `docs/RUFLO-V3-VS-AIYOUCLI.md`'s "Media prioridad" table.

## Needs re-verification before scoping

Carried over from the historical gap doc but not re-checked in this audit —
confirm current state before treating these as open:

| Item | Original gap (2026, at 1.0 migration) |
|---|---|
| Semantic router uses real embeddings by default | `route` tool's `hybrid`/`enhanced` modes accept caller-supplied `embedding_scores` or fall back to a knowledge-graph hint — unclear if ONNX embeddings are wired in by default vs. opt-in only |
| MoE router (8 specialized experts with learned weights) | Was keyword-heuristic only; may still be |
| Coverage router (route by test-coverage gaps, parse nyc/c8) | Not present as of last check |
| Hooks: pre/post-edit | Only `pre_task`/`post_task`/`route`/`stats` exist |
| Init wizard (interactive mode with options) | `init` generates everything directly, no wizard |
| aiyou-team delegation support in Claude Code | `docs/mcp-tools.md` notes this is owned by the OpenCode plugin and "deferred" for Claude Code; no plan currently on file |
| Deep research (`rd_*`) tools | `docs/mcp-tools.md` notes these are implemented internally but not registered as MCP tools — needs a decision on what "finish it" means before exposing |

## Explicitly out of scope (won't do)

Carried from `docs/RUFLO-V3-VS-AIYOUCLI.md` — still valid, listed here so
nobody re-opens these without a reason:

| Item | Why not |
|---|---|
| Plugin system (lifecycle, store, discovery) | Prematuro — 0 usuarios de plugins |
| IPFS pattern transfer | Infraestructura compleja para poco uso |
| Appliance/RVFA binary packaging | Pertenece a `aiyoudev`, no a aiyoucli |
| ruvLLM bridge (3-tier local LLM routing) | Requiere GGUF engine, scope demasiado grande |
| Guidance control plane (compile/enforce/prove/evolve) | Over-engineered para una CLI |
| `agent`/`swarm`/`task`/`session`/`hive-mind` commands | Coordinación multi-agente distribuida es concern del orquestador (`aiyoudev`), no del CLI |

---

## Process

- **Issues**: file one per item picked up, on [faugustdev/aiyoucli](https://github.com/faugustdev/aiyoucli/issues), linking back to its row here.
- **Changelog**: every merged PR gets an entry in `CHANGELOG.md` under `[Unreleased]`, moved to a version section at release time.
- **Releases**: `scripts/version.js <version>` → commit `chore(release): bump to vX.Y.Z` → tag `vX.Y.Z` → push. Tag push publishes to npm via CI — see `.github/workflows/ci.yml`.
