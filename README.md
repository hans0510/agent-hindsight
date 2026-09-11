# hindsight ✈

**给 coding agent 用的"黑匣子"。** 记录每一次 agent 会话，逐步回放，还能把两次运行并排对比 —— 跨 harness 支持 **[pi](https://github.com/badlogic/pi-mono)**、**DeepSeek Harness (dsh)** 和 **Claude Code**。

```
$ hindsight import examples/pi-session.jsonl --title "pi fixes crash"
imported as hs_mtpyugfa_3s543x (pi adapter, 14 events)

$ hindsight diff hs_mtpyuge9_perluf hs_mtpyugfa_3s543x
A: hs_mtpyuge9_perluf — 3 tool calls
B: hs_mtpyugfa_3s543x — 4 tool calls
shared steps: 2, only in A: 1, only in B: 2
files: 2 touched, 2 differ
```

## 为什么需要它

- **"agent 刚才到底干了什么？"** —— 会话看完就消失在终端滚屏里。hindsight 把每次工具调用、输出、文件改动和 token 消耗存成统一的事件流，随时回放。
- **"换模型 / 装插件到底有没有变好？"** —— 同一任务跑两遍，直接 diff 轨迹：哪些步骤一致、最终文件差在哪、各烧了多少 token。不用再靠感觉。
- **可传播的复盘** —— 分享一条会话回放链接，而不是终端截图。

## 安装与快速上手

需要 Node.js ≥ 18，**零依赖**。

```sh
npm install -g agent-hindsight   # 或者：git clone && npm link

hindsight import <会话日志.jsonl>   # 自动识别 pi / claude / native 格式
hindsight list                      # 列出所有已记录会话
hindsight show <id>                 # 终端里看纯文本时间轴
hindsight open                      # 本地网页 UI：http://127.0.0.1:7788
hindsight diff <idA> <idB>          # 终端 diff 摘要（网页版是可视化对比）
hindsight rm <id>
```

先用自带的示例数据试试：

```sh
hindsight import examples/claude-session.jsonl --title "claude fixes crash"
hindsight import examples/pi-session.jsonl --title "pi fixes crash"
hindsight open
```

## 网页 UI

- **回放（Replay）**：user / assistant 消息与工具调用的时间轴，工具输出可展开，顶部汇总 token 与成本。
- **对比（Diff）**：任选两个会话 —— LCS 对齐工具调用序列（跨 harness 做了规范化：`Read`≡`read`、`file_path`≡`path`，不同 agent 跑同一任务也能对齐共享步骤），外加逐文件的最终内容 diff 与行级高亮。

数据存放在 `~/.hindsight`（可用 `$HINDSIGHT_HOME` 覆盖），全部本地存储，不出你的机器。

## 实时录制（ingest API）

harness 插件可以把事件流式推给运行中的 `hindsight open`：

```sh
# 开始一次录制
curl -X POST http://127.0.0.1:7788/api/ingest/start \
  -H 'content-type: application/json' \
  -d '{"agent":"dsh","model":"deepseek-chat","title":"my run"}'
# → {"id":"hs_..."}

# 事件发生时就追加
curl -X POST http://127.0.0.1:7788/api/ingest/hs_... \
  -H 'content-type: application/json' \
  -d '{"events":[{"v":1,"type":"tool_call","tool":"bash","args":{"command":"ls"}}]}'
```

pi 实时录制扩展（`pi.on` → ingest API）和 dsh session-storage 插件已在路线图上（见下）——它们需要的 ingest API 已经稳定。

## 事件格式（hindsight JSONL）

每行一个 JSON 对象，首行是会话头：

```json
{"v":1,"type":"session","id":"hs_...","agent":"pi","model":"deepseek-chat","cwd":"/repo","startedAt":"..."}
{"v":1,"type":"user","ts":"...","text":"fix the crash"}
{"v":1,"type":"assistant","ts":"...","text":"reading the file first"}
{"v":1,"type":"tool_call","ts":"...","id":"c1","tool":"read","args":{"path":"src/index.js"}}
{"v":1,"type":"tool_result","ts":"...","callId":"c1","ok":true,"output":"..."}
{"v":1,"type":"usage","ts":"...","input":4200,"output":260,"cost":0.0021}
{"v":1,"type":"session_end","ts":"...","status":"done"}
```

适配器负责把 pi 会话日志、Claude Code transcripts（`~/.claude/projects/*/*.jsonl`）和原生 hindsight JSONL 转成这一统一格式。

## 路线图

- [ ] pi 零配置实时录制扩展（`pi.on` → ingest API）
- [ ] dsh session-storage 插件（dsh"一切皆插件"的架构下这是原生玩法）
- [ ] 一键导出自包含 HTML 回放页，方便分享
- [ ] "重跑并对比"模式：用不同模型 / 配置重放同一任务并自动 diff
- [ ] 基于你自己真实任务的模型成本 / token 消耗榜单

## 开发

```sh
npm test          # node:test 单元测试
node bin/hindsight.js help
```

欢迎 issue 和 PR。如果你在用某个还没支持的 harness，适配器接口很简单：把它的会话日志转成上面的 JSONL 事件格式即可（参考 `src/adapters/`）。

## License

MIT

---

# hindsight ✈ (English)

**A flight recorder for coding agents.** Record every agent session, replay it step by step, and diff two runs side by side — across harnesses: **pi**, **DeepSeek Harness** (`dsh`), and **Claude Code**.

## Why

- **"What did the agent actually do?"** — sessions vanish into scrollback. hindsight keeps every tool call, output, edit and token count in one normalized event stream.
- **"Did switching model/plugin make it better?"** — run the same task twice and diff the trajectories: shared steps, diverging files, tokens burned. No more guessing.
- **Postmortems that travel** — share a session replay link instead of a terminal screenshot.

## Quickstart

Requires Node.js ≥ 18. Zero dependencies.

```sh
npm install -g agent-hindsight   # or: git clone && npm link

hindsight import <session-log.jsonl>   # auto-detects pi / claude / native format
hindsight list                          # all recorded sessions
hindsight show <id>                     # plain-text timeline in the terminal
hindsight open                          # local web UI at http://127.0.0.1:7788
hindsight diff <idA> <idB>              # terminal diff summary (+ visual diff in the UI)
hindsight rm <id>
```

Data lives in `~/.hindsight` (override with `$HINDSIGHT_HOME`). Everything is local; nothing leaves your machine.

## Web UI

- **Replay**: timeline of user/assistant messages and tool calls with expandable outputs, token & cost totals.
- **Diff**: pick any two sessions — LCS-aligned tool-call sequences (tool names and argument keys canonicalized across harnesses), plus final per-file content diffs with line-level highlighting.

## Ingest API (live recording)

Harness plugins can stream events into a running `hindsight open` instance:

- `POST /api/ingest/start` → `{id}` — start a recording
- `POST /api/ingest/:id` — append events as they happen

## Event format

One JSON object per line (`hindsight JSONL`), first line is the session header. Event types: `session`, `user`, `assistant`, `tool_call`, `tool_result`, `file_edit`, `usage`, `session_end`. Adapters for pi session logs and Claude Code transcripts are included; writing a new adapter is a small mapping function (see `src/adapters/`).

## Roadmap

- [ ] pi extension for zero-config live capture
- [ ] dsh session-storage plugin
- [ ] shareable self-contained HTML export of a replay
- [ ] "rerun & compare" mode against a different model/config
- [ ] cost/token leaderboards across models on your own real tasks

## Development

```sh
npm test          # node:test unit tests
node bin/hindsight.js help
```

## License

MIT
