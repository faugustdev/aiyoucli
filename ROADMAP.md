# Roadmap

Living source of truth for what's next. Supersedes the gap tables in
`docs/RUFLO-V3-VS-AIYOUCLI.md` and `docs/COMPARISON.md` (both are frozen
historical snapshots — see the notice at the top of each).

**Working style: small, independently-shippable items only.** Every entry
here should land in one PR without needing a design doc first. When you pick
one up: open a GitHub issue linking back to this entry, ship it, add a
`CHANGELOG.md` entry under `[Unreleased]`, check it off here. No big-bang
rewrites — if an item feels like it needs one, split it first.

Last audited against actual source: 2026-08-20.

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
| AST analyzer | Real tree-sitter (18 languages) via `aiyouvector-codebase`, not regex — `crates/aiyoucli-napi/src/ast.rs` |
| Memory export/import | `aiyoucli memory export`/`memory import`, `memory_export`/`memory_import` MCP tools — shipped 2026-08-16 |
| Fish/PowerShell completions | `aiyoucli completions fish\|powershell` — shipped 2026-08-16 |
| `daemon`/`update` real implementations | No longer stubs — `daemon start\|status\|stop` (PID-file based), `update check\|install` — shipped 2026-08-16. Note: the daemon's task queue still has no default producer wired up (`WorkerDaemon.dispatch()` is available for future callers) |
| `codebase trace --direction callers\|callees` | Fixed 2026-08-16 — was silently returning both directions; see "Confirmed bugs" #1 below for root cause |
| HNSW index node leak on re-insert | Fixed 2026-08-16 in `aiyouvector-core` (`index/hnsw.rs::add()`) — see "Confirmed bugs" #2 below for root cause |
| aiyou-team delegation support in Claude Code | Shipped 2026-08-20 (v1.6.3 → v1.7.1): `.claude/agents/*.md` (already existed), `aiyoucli agent set-model` for per-agent model pinning, an A2A protocol server/client (`aiyoucli a2a serve/call`, Claude Code and OpenCode runtimes) so aiyou-team agents are reachable over the network, and `aiyoucli plugin build` packaging the roster + `SessionStart`/`UserPromptSubmit` hooks as a real Claude Code Plugin — all on by default via `aiyoucli init --tool claude` |

---

## Confirmed bugs (found 2026-08-16, cross-checking [ruflo's changelog](https://github.com/ruvnet/ruflo/blob/main/CHANGELOG.md) for analogous fixed issues)

All three items below are done as of 2026-08-16 — kept here (rather than
moved to "Already done" above) since they're bugfixes with root-cause
writeups worth keeping intact, not gap-doc corrections.

1. ~~`aiyoucli codebase trace --direction callers|callees` silently returns
   both directions instead of filtering.~~ **Fixed 2026-08-16** — see
   "Already done" above. Root cause was a vocabulary mismatch, not the
   `_ =>` wildcard itself being wrong: aiyoucli's public vocabulary
   (`callers`/`callees`/`both`) never got translated to
   `aiyouvector-codebase`'s internal `outbound`/`inbound` vocabulary before
   reaching `trace_calls()`, so both fell through to its both-directions
   wildcard. Fixed entirely within `aiyoucli` (`crates/aiyoucli-napi/src/codebase.rs::translate_direction()`)
   — `aiyouvector`'s own vocabulary is used consistently by its other
   internal callers and tests, so it was left alone.

2. ~~HNSW index leaks a graph node on every re-insert of an existing vector
   id.~~ **Fixed 2026-08-16** — see "Already done" above.
   `index/flat.rs`'s `add()` uses a plain `HashMap::insert`, so re-inserting
   an existing id already overwrote correctly there; `hnsw.rs`'s `add()`
   always allocated a **new** `idx` and repointed `id_to_idx`/`vectors` to
   it, but never retired the *old* `idx`'s node from the graph or from
   `idx_to_id` — every repeated `memory store --id X` with the same `X`
   leaked one orphaned graph node. Directly analogous to ruflo's fixed issue
   #2775 ("memory store to existing key no longer dead-ends"), except
   aiyoucli's failure mode was a silent leak rather than a hard error.
   Fixed in `aiyouvector-core` by retiring the old mapping in `add()`
   exactly like `remove()` already does, reusing the existing
   rebuild-on-heavy-deletion logic to reclaim it. Verified via a new Rust
   unit test asserting `deleted_count` stays bounded across repeated
   re-inserts rather than growing without limit (not observable end-to-end
   from the CLI — `count()`/`search()` were already correct even with the
   bug, since the leak was internal to the HNSW graph structure).

3. ~~Migrate npm publish to Trusted Publishing (OIDC).~~ **Done and confirmed
   working 2026-08-16.** Account owner registered the trusted publisher on
   npmjs.com for all 6 `@aiyou-dev/*` packages (repo `aiyoucli`, workflow
   `ci.yml`, no environment); `NODE_AUTH_TOKEN`/`secrets.NPM_TOKEN` removed
   from both `publish` steps in `.github/workflows/ci.yml`. The v1.6.2
   release published successfully with zero token — "Publish to npm"
   passed in 1m16s and `npm view @aiyou-dev/cli@1.6.2` / `@aiyou-dev/cli-darwin-arm64@1.6.2`
   confirm both are live on the registry with SLSA provenance intact.
   **Optional cleanup remaining**: the `NPM_TOKEN` secret itself still
   physically exists in repo settings — nothing reads it anymore, safe to
   delete whenever the account owner wants to (GitHub repo → Settings →
   Secrets and variables → Actions).

## Next up (small, low-risk — pick any, one PR each)

- **Deep research (`rd_*`) tools** — decided 2026-08-20, not scoped yet. `src/mcp/tools/rd-tools.ts` (8 tools) is complete but was never registered in `registerAllTools()` — confirmed unreachable via grep. It also depends on a native `aiyoucli-rd` binary that the build pipeline never compiles (`build:rs` only builds `aiyoucli-napi`) and no `npm/*/package.json` ever ships, so registering it as-is would throw for every real user. **Explicit constraint: if this ever gets implemented, fold `rd.rs`'s logic into `aiyoucli-napi` — do not ship a second NAPI crate/binary.** Separately, `src/rd/engine.ts`'s `search()` is a hardcoded stub (`results: []`) — the NAPI consolidation alone doesn't make this feature real; the actual search-result-processing logic still needs writing. Until one of those two things happens, `README.md` does not mention this feature (removed 2026-08-20 — was previously advertised as a live capability).

- **OpenCode-side delegate-by-default** — `aiyoucli init --tool claude` now wraps agy/
  opencode/mmx-routed agents' `.claude/agents/*.md` with a "delegate to `aiyoucli
  orchestrate` first" instruction by default (2026-08-21, see CHANGELOG). The same intent
  applies to OpenCode — today, when OpenCode dispatches to a roster agent, it runs on
  whatever model `aiyou-team/src/adapters/opencode/model-selector.ts` resolves, never
  auto-delegating to `agy`/`mmx`. Wiring the equivalent behavior means editing aiyou-team's
  prompt projection (`aiyou-team/src/adapters/opencode/projection.ts`), a different
  package/repo from aiyoucli — explicitly out of scope for the aiyoucli-side change, not
  built yet.

Otherwise empty right now — the three items that were here (memory export/
import, fish/powershell completions, real daemon/update) all shipped
2026-08-16, moved to "Already done" above. Working the confirmed-bugs list
above next; pull further batches from "Needs re-verification" below, or from
`docs/RUFLO-V3-VS-AIYOUCLI.md`'s "Media prioridad" table.

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
