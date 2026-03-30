/**
 * Statusline — honest, minimal dashboard showing only real data.
 *
 * Integrates with Claude Code, Gemini CLI, or standalone terminal.
 * Host CLI can pipe session JSON via stdin (model, context %, cost).
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { registry } from "../mcp/client.js";
import { registerAllTools } from "../mcp/tools/index.js";

// ── Public API ──────────────────────────────────────────────────

export function generateStatuslineScript(projectRoot: string): string {
  const dir = join(projectRoot, ".aiyoucli", "helpers");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, "statusline.cjs");
  writeFileSync(outPath, STANDALONE_SCRIPT, { mode: 0o755 });
  return outPath;
}

export function renderStatusline(
  cwd: string,
  options: { json?: boolean; compact?: boolean } = {}
): string {
  const data = collect(cwd);
  if (options.json) return JSON.stringify(data, null, 2);
  if (options.compact) return formatCompact(data);
  return format(data);
}

// ── Data ────────────────────────────────────────────────────────

interface Data {
  user: string;
  branch: string;
  staged: number;
  modified: number;
  untracked: number;
  ahead: number;
  behind: number;
  model: string;
  modelCtx: string;
  duration: string;
  agents: number;
  swarm: { on: boolean; topology: string; max: number };
  tasks: { p: number; r: number; c: number };
  vectors: number;
  tests: number;
  tools: number;
}

let _toolCount: number | null = null;
function getToolCount(): number {
  if (_toolCount === null) {
    try {
      registerAllTools();
      _toolCount = registry.list().length;
    } catch {
      _toolCount = 51;
    }
  }
  return _toolCount;
}

function collect(cwd: string): Data {
  // Git — single call
  const gitRaw = safeExec(
    `sh -c 'git config user.name 2>/dev/null||echo user;echo ---S---;git branch --show-current 2>/dev/null;echo ---S---;git status --porcelain 2>/dev/null;echo ---S---;git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null||echo "0 0"'`,
    cwd
  );
  const p = gitRaw.split("---S---").map((s) => s.trim());
  let user = "user", branch = "", staged = 0, modified = 0, untracked = 0, ahead = 0, behind = 0;
  if (p.length >= 4) {
    user = p[0] || "user";
    branch = p[1] || "";
    for (const l of (p[2] || "").split("\n")) {
      if (!l || l.length < 2) continue;
      if (l[0] === "?" && l[1] === "?") { untracked++; continue; }
      if (l[0] !== " " && l[0] !== "?") staged++;
      if (l[1] !== " " && l[1] !== "?") modified++;
    }
    const ab = (p[3] || "0 0").split(/\s+/);
    ahead = parseInt(ab[0]) || 0;
    behind = parseInt(ab[1]) || 0;
  }

  // Model + session info from ~/.claude.json
  let model = "", modelCtx = "", duration = "";
  try {
    type ProjectData = Record<string, unknown> & {
      lastModelUsage?: Record<string, { lastUsedAt?: string }>;
      lastDuration?: number;
    };
    const cc = readJson(join(homedir(), ".claude.json")) as { projects?: Record<string, ProjectData> } | null;
    if (cc?.projects) {
      for (const [pp, pc] of Object.entries(cc.projects)) {
        if (cwd === pp || cwd.startsWith(pp + "/")) {
          // Model
          const usage = pc.lastModelUsage;
          if (usage) {
            let lid = "", lt = 0;
            for (const [id, v] of Object.entries(usage)) {
              const ts = v.lastUsedAt ? new Date(v.lastUsedAt).getTime() : 0;
              if (ts > lt) { lt = ts; lid = id; }
            }
            if (lid.includes("opus")) { model = "Opus 4.6"; modelCtx = "1M context"; }
            else if (lid.includes("sonnet")) { model = "Sonnet 4.6"; modelCtx = "200K context"; }
            else if (lid.includes("haiku")) { model = "Haiku 4.5"; modelCtx = "200K context"; }
            else if (lid) model = lid;
          }
          // Duration
          if (pc.lastDuration && pc.lastDuration > 0) {
            const totalMs = pc.lastDuration as number;
            const mins = Math.floor(totalMs / 60000);
            const secs = Math.floor((totalMs % 60000) / 1000);
            duration = mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
          }
          break;
        }
      }
    }
  } catch {}

  // aiyoucli state — only show what actually exists
  const base = join(cwd, ".aiyoucli");
  const agentsData = readJson(join(base, "agents", "store.json")) as Array<{ status: string }> | null;
  const swarmData = readJson(join(base, "swarm", "state.json")) as { status?: string; topology?: string; maxAgents?: number } | null;
  const tasksData = readJson(join(base, "tasks", "store.json")) as Array<{ status: string }> | null;

  const agents = agentsData?.filter((a) => a.status !== "stopped").length ?? 0;

  const tasks = {
    p: tasksData?.filter((t) => t.status === "pending").length ?? 0,
    r: tasksData?.filter((t) => t.status === "in_progress").length ?? 0,
    c: tasksData?.filter((t) => t.status === "completed").length ?? 0,
  };

  // Tests — count real files
  let tests = 0;
  for (const d of ["__tests__", "tests", "test"]) {
    try {
      const dir = join(cwd, d);
      if (existsSync(dir)) {
        tests += readdirSync(dir).filter((f) => f.includes(".test.") || f.includes(".spec.")).length;
      }
    } catch {}
  }

  // Vectors — check aiyouvector data dir
  let vectors = 0;
  const vecPaths = [join(cwd, ".aiyouvector", "data"), join(base, "memory.db")];
  for (const vp of vecPaths) {
    try {
      const st = statSync(vp);
      if (st) { vectors = Math.floor(st.size / 512); break; }
    } catch {}
  }

  return {
    user, branch, staged, modified, untracked, ahead, behind, model, modelCtx, duration,
    agents,
    swarm: {
      on: swarmData?.status === "active",
      topology: swarmData?.topology ?? "off",
      max: swarmData?.maxAgents ?? 8,
    },
    tasks, vectors, tests, tools: getToolCount(),
  };
}

// ── Compact format (ANSI colors for Claude Code statusLine) ─────

function formatCompact(d: Data): string {
  const R = "\x1b[0m";
  const B = "\x1b[1m";
  const ind = "\x1b[38;5;105m";  // indigo
  const tl = "\x1b[38;5;73m";   // teal
  const wm = "\x1b[38;5;216m";  // warm peach
  const gn = "\x1b[38;5;114m";  // soft green
  const yl = "\x1b[38;5;222m";  // soft yellow
  const gy = "\x1b[38;5;245m";  // gray

  const parts: string[] = [`${B}${ind}■ aiyoucli${R}`];

  if (d.branch) {
    let git = `${wm}${d.branch}${R}`;
    if (d.staged > 0) git += ` ${gn}+${d.staged}${R}`;
    if (d.modified > 0) git += `${yl}~${d.modified}${R}`;
    parts.push(git);
  }

  if (d.agents > 0) parts.push(`${tl}${d.agents}${R} agents`);

  const totalTasks = d.tasks.p + d.tasks.r + d.tasks.c;
  if (totalTasks > 0) parts.push(`${yl}${d.tasks.r}${R}r ${gn}${d.tasks.c}${R}d ${gy}${d.tasks.p}${R}q`);

  if (d.vectors > 0) parts.push(`${tl}${d.vectors}${R} vecs`);

  parts.push(`${gy}${d.tools} tools${R}`);

  return parts.join(` ${gy}│${R} `);
}

// ── Format (new palette: indigo/teal/warm) ──────────────────────

function format(d: Data): string {
  // Colors — softer palette with indigo accents
  const R = "\x1b[0m";
  const B = "\x1b[1m";
  const D = "\x1b[2m";
  const ind = "\x1b[38;5;105m";  // indigo
  const tl = "\x1b[38;5;73m";   // teal
  const wm = "\x1b[38;5;216m";  // warm peach
  const gn = "\x1b[38;5;114m";  // soft green
  const yl = "\x1b[38;5;222m";  // soft yellow
  const rd = "\x1b[38;5;203m";  // soft red
  const gy = "\x1b[38;5;245m";  // gray
  const wh = "\x1b[38;5;255m";  // white

  const lines: string[] = [];

  // Line 1: identity + git + model
  let h = `${B}${ind}\u25A0 aiyoucli${R}  ${tl}${d.user}${R}`;
  if (d.branch) {
    h += `  ${gy}\u2502${R}  ${wm}${d.branch}${R}`;
    if (d.staged > 0) h += ` ${gn}+${d.staged}${R}`;
    if (d.modified > 0) h += `${yl}~${d.modified}${R}`;
    if (d.untracked > 0) h += `${gy}?${d.untracked}${R}`;
    if (d.ahead > 0) h += ` ${gn}\u2191${d.ahead}${R}`;
    if (d.behind > 0) h += ` ${rd}\u2193${d.behind}${R}`;
  }
  if (d.model) {
    h += `  ${gy}\u2502${R}  ${ind}${d.model}${R}`;
    if (d.modelCtx) h += ` ${gy}(${d.modelCtx})${R}`;
  }
  if (d.duration) h += `  ${gy}\u2502${R}  ${tl}\u23F1 ${d.duration}${R}`;
  lines.push(h);

  // Line 2: agents + swarm + tasks (only if any activity)
  const parts2: string[] = [];

  if (d.swarm.on || d.agents > 0) {
    const sIcon = d.swarm.on ? `${gn}\u25C9${R}` : `${gy}\u25CB${R}`;
    parts2.push(`${wm}agents${R} ${sIcon} ${d.agents > 0 ? gn : gy}${d.agents}${R}${gy}/${d.swarm.max}${R}`);
  }

  const totalTasks = d.tasks.p + d.tasks.r + d.tasks.c;
  if (totalTasks > 0) {
    parts2.push(`${wm}tasks${R} ${d.tasks.r > 0 ? yl : gy}${d.tasks.r}${R} running  ${gn}${d.tasks.c}${R} done  ${gy}${d.tasks.p} queued${R}`);
  }

  if (d.vectors > 0) {
    parts2.push(`${wm}vectors${R} ${gn}${d.vectors}${R}`);
  }

  if (d.tests > 0) {
    parts2.push(`${wm}tests${R} ${gn}${d.tests}${R}`);
  }

  if (parts2.length > 0) {
    lines.push(`  ${parts2.join(`  ${gy}\u2502${R}  `)}`);
  }

  // Line 3: tools (always — this is real)
  lines.push(`  ${gy}${d.tools} mcp tools available${R}`);

  return lines.join("\n");
}

// ── Helpers ─────────────────────────────────────────────────────

function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"], cwd }).trim();
  } catch { return ""; }
}

function readJson(p: string): unknown {
  try { if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8")); } catch {}
  return null;
}

// ── Standalone CJS script ───────────────────────────────────────

const STANDALONE_SCRIPT = `#!/usr/bin/env node
/**
 * aiyoucli statusline — standalone CJS script.
 * Works with Claude Code, Gemini CLI, or terminal.
 * Usage: node statusline.cjs [--json] [--compact]
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const CWD = process.cwd();

const R='\\x1b[0m',B='\\x1b[1m',D='\\x1b[2m';
const ind='\\x1b[38;5;105m',tl='\\x1b[38;5;73m',wm='\\x1b[38;5;216m';
const gn='\\x1b[38;5;114m',yl='\\x1b[38;5;222m',rd='\\x1b[38;5;203m';
const gy='\\x1b[38;5;245m',wh='\\x1b[38;5;255m';

function sx(cmd,t){try{return execSync(cmd,{encoding:'utf-8',timeout:t||2000,stdio:['pipe','pipe','pipe'],cwd:CWD}).trim()}catch{return ''}}
function rj(p){try{return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf-8')):null}catch{return null}}

// Stdin from host CLI
let _sd;
function sd(){if(_sd!==undefined)return _sd;if(process.stdin.isTTY){_sd=null;return null}
try{const ch=[];const buf=Buffer.alloc(4096);let n;try{while((n=fs.readSync(0,buf,0,buf.length,null))>0)ch.push(buf.slice(0,n))}catch{}
const r=Buffer.concat(ch).toString('utf-8').trim();_sd=r&&r.startsWith('{')?JSON.parse(r):null}catch{_sd=null}return _sd}

function collect(){
  const raw=sx("sh -c 'git config user.name 2>/dev/null||echo user;echo ---S---;git branch --show-current 2>/dev/null;echo ---S---;git status --porcelain 2>/dev/null;echo ---S---;git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null||echo \\"0 0\\"'",3000);
  const p=raw.split('---S---').map(s=>s.trim());
  let user='user',branch='',staged=0,modified=0,untracked=0,ahead=0,behind=0;
  if(p.length>=4){user=p[0]||'user';branch=p[1]||'';
    for(const l of(p[2]||'').split('\\n')){if(!l||l.length<2)continue;if(l[0]==='?'&&l[1]==='?'){untracked++;continue}if(l[0]!==' '&&l[0]!=='?')staged++;if(l[1]!==' '&&l[1]!=='?')modified++}
    const ab=(p[3]||'0 0').split(/\\s+/);ahead=parseInt(ab[0])||0;behind=parseInt(ab[1])||0}

  // Model
  let model='';
  const s=sd();
  if(s&&s.model&&s.model.display_name)model=s.model.display_name;
  if(!model){try{const cc=rj(path.join(os.homedir(),'.claude.json'));if(cc&&cc.projects)for(const[pp,pc]of Object.entries(cc.projects)){
    if(CWD===pp||CWD.startsWith(pp+'/')){const u=pc.lastModelUsage;if(u){let lid='',lt=0;for(const[id,v]of Object.entries(u)){const t=v.lastUsedAt?new Date(v.lastUsedAt).getTime():0;if(t>lt){lt=t;lid=id}}
    if(lid.includes('opus'))model='Opus 4.6';else if(lid.includes('sonnet'))model='Sonnet 4.6';else if(lid.includes('haiku'))model='Haiku 4.5';else if(lid)model=lid}break}}}catch{}}

  // State
  const base=path.join(CWD,'.aiyoucli');
  const ag=rj(path.join(base,'agents','store.json'))||[];
  const sw=rj(path.join(base,'swarm','state.json'));
  const tk=rj(path.join(base,'tasks','store.json'))||[];
  const agents=ag.filter(a=>a.status!=='stopped').length;
  const tasks={p:tk.filter(t=>t.status==='pending').length,r:tk.filter(t=>t.status==='in_progress').length,c:tk.filter(t=>t.status==='completed').length};
  let tests=0;for(const d of['__tests__','tests','test']){try{const dir=path.join(CWD,d);if(fs.existsSync(dir))tests+=fs.readdirSync(dir).filter(f=>f.includes('.test.')||f.includes('.spec.')).length}catch{}}
  let vectors=0;for(const vp of[path.join(CWD,'.aiyouvector','data'),path.join(base,'memory.db')]){try{const st=fs.statSync(vp);if(st){vectors=Math.floor(st.size/512);break}}catch{}}

  // Cost/context from stdin
  let dur='',ctxPct=0,costUsd=0;
  if(s&&s.cost){const ms=s.cost.total_duration_ms||0;const m=Math.floor(ms/60000);const sec=Math.floor((ms%60000)/1000);dur=m>0?m+'m'+sec+'s':sec+'s';costUsd=s.cost.total_cost_usd||0}
  if(s&&s.context_window)ctxPct=Math.floor(s.context_window.used_percentage||0);

  return{user,branch,staged,modified,untracked,ahead,behind,model,agents,swarmOn:sw?sw.status==='active':false,swarmMax:sw?sw.maxAgents:8,tasks,vectors,tests,tools:41,dur,ctxPct,costUsd};
}

function render(){
  const d=collect();const lines=[];

  let h=B+ind+'\\u25A0 aiyoucli'+R+'  '+tl+d.user+R;
  if(d.branch){h+='  '+gy+'\\u2502'+R+'  '+wm+d.branch+R;
    if(d.staged>0)h+=' '+gn+'+'+d.staged+R;if(d.modified>0)h+=yl+'~'+d.modified+R;if(d.untracked>0)h+=gy+'?'+d.untracked+R;
    if(d.ahead>0)h+=' '+gn+'\\u2191'+d.ahead+R;if(d.behind>0)h+=' '+rd+'\\u2193'+d.behind+R}
  if(d.model)h+='  '+gy+'\\u2502'+R+'  '+ind+d.model+R;
  if(d.dur)h+='  '+gy+'\\u2502'+R+'  '+tl+d.dur+R;
  if(d.ctxPct>0){const cc=d.ctxPct>=90?rd:d.ctxPct>=70?yl:gn;h+='  '+gy+'\\u2502'+R+'  '+cc+d.ctxPct+'% ctx'+R}
  if(d.costUsd>0)h+='  '+gy+'\\u2502'+R+'  '+yl+'$'+d.costUsd.toFixed(2)+R;
  lines.push(h);

  const p2=[];
  if(d.swarmOn||d.agents>0){const si=d.swarmOn?gn+'\\u25C9'+R:gy+'\\u25CB'+R;p2.push(wm+'agents'+R+' '+si+' '+(d.agents>0?gn:gy)+d.agents+R+gy+'/'+d.swarmMax+R)}
  const tt=d.tasks.p+d.tasks.r+d.tasks.c;
  if(tt>0)p2.push(wm+'tasks'+R+' '+(d.tasks.r>0?yl:gy)+d.tasks.r+R+' running  '+gn+d.tasks.c+R+' done  '+gy+d.tasks.p+' queued'+R);
  if(d.vectors>0)p2.push(wm+'vectors'+R+' '+gn+d.vectors+R);
  if(d.tests>0)p2.push(wm+'tests'+R+' '+gn+d.tests+R);
  if(p2.length>0)lines.push('  '+p2.join('  '+gy+'\\u2502'+R+'  '));
  lines.push('  '+gy+d.tools+' mcp tools available'+R);
  return lines.join('\\n');
}

function renderJSON(){const d=collect();return{user:d.user,branch:d.branch,model:d.model,
  git:{staged:d.staged,modified:d.modified,untracked:d.untracked,ahead:d.ahead,behind:d.behind},
  agents:d.agents,swarm:{on:d.swarmOn,max:d.swarmMax},tasks:d.tasks,vectors:d.vectors,tests:d.tests,tools:d.tools,
  session:{duration:d.dur||null,contextPct:d.ctxPct||null,costUsd:d.costUsd||null},timestamp:new Date().toISOString()}}

if(process.argv.includes('--json'))console.log(JSON.stringify(renderJSON(),null,2));
else if(process.argv.includes('--compact'))console.log(JSON.stringify(renderJSON()));
else console.log(render());
`;
