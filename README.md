# hindsight ✈

**A flight recorder for coding agents.** Record every agent session, replay it step by step, and diff two runs side by side — across harnesses.

Works with **pi** ([pi-mono](https://github.com/badlogic/pi-mono)), **DeepSeek Harness** (`dsh`), and **Claude Code** transcripts.

```
$ hindsight import examples/pi-session.jsonl --title "pi fixes crash"
imported as hs_mtpyugfa_3s543x (pi adapter, 14 events)

$ hindsight diff hs_mtpyuge9_perluf hs_mtpyugfa_3s543x
A: hs_mtpyuge9_perluf — 3 tool calls
B: hs_mtpyugfa_3s543x — 4 tool calls
shared steps: 2, only in A: 1, only in B: 2
files: 2 touched, 2 differ
```

## Why

- **"What did the agent actually do?"** — sessions vanish into scrollback. hindsight keeps every tool call, output, edit and token count in one normalized event stream.
- **"Did switching model/plugin make it better?"** — run the same task twice, diff the trajectories: which steps were shared, which files ended up different, how many tokens each burned.
- **Postmortems that travel** — share a session replay link instead of a screenshot of your terminal.

## Install & quickstart

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

Try it with the bundled examples:

```sh
hindsight import examples/claude-session.jsonl --title "claude fixes crash"
hindsight import examples/pi-session.jsonl --title "pi fixes crash"
hindsight open
```

## The web UI

- **Replay**: timeline of user/assistant messages and tool calls with expandable outputs, token & cost totals.
- **Diff**: pick any two sessions — LCS-aligned tool-call sequences (tool names and argument keys are canonicalized across harnesses, so `Read`≡`read`, `file_path`≡`path`), plus final per-file content diffs with line-level highlighting.

Data lives in `~/.hindsight` (override with `$HINDSIGHT_HOME`). Everything is local; nothing leaves your machine.

## Recording live sessions (ingest API)

Harness plugins can stream events into a running `hindsight open` instance:

```sh
# start a recording
curl -X POST http://127.0.0.1:7788/api/ingest/start \
  -H 'content-type: application/json' \
  -d '{"agent":"dsh","model":"deepseek-chat","title":"my run"}'
# → {"id":"hs_..."}

# append events as they happen
curl -X POST http://127.0.0.1:7788/api/ingest/hs_... \
  -H 'content-type: application/json' \
  -d '{"events":[{"v":1,"type":"tool_call","tool":"bash","args":{"command":"ls"}}]}'
```

A pi extension (live capture via `pi.on`) and a dsh session-storage plugin are on the roadmap below — the ingest API they need is already stable.

## Event format (hindsight JSONL)

One JSON object per line. First line is the session header:

```json
{"v":1,"type":"session","id":"hs_...","agent":"pi","model":"deepseek-chat","cwd":"/repo","startedAt":"..."}
{"v":1,"type":"user","ts":"...","text":"fix the crash"}
{"v":1,"type":"assistant","ts":"...","text":"reading the file first"}
{"v":1,"type":"tool_call","ts":"...","id":"c1","tool":"read","args":{"path":"src/index.js"}}
{"v":1,"type":"tool_result","ts":"...","callId":"c1","ok":true,"output":"..."}
{"v":1,"type":"usage","ts":"...","input":4200,"output":260,"cost":0.0021}
{"v":1,"type":"session_end","ts":"...","status":"done"}
```

Adapters convert pi session logs, Claude Code transcripts (`~/.claude/projects/*/*.jsonl`) and native hindsight JSONL into this single format.

## Roadmap

- [ ] pi extension for zero-config live capture (`pi.on` → ingest API)
- [ ] dsh session-storage plugin (dsh's everything-is-a-plugin architecture makes this native)
- [ ] shareable self-contained HTML export of a replay
- [ ] "rerun & compare" mode: replay a task against a different model/config and auto-diff
- [ ] cost/token leaderboards across models on your own real tasks

## Development

```sh
npm test          # node:test unit tests
node bin/hindsight.js help
```

## License

MIT

---

# hindsight ✈（中文）

**给 coding agent 用的"黑匣子"**：自动记录每次 agent 会话，逐步回放，还能把两次运行并排对比——跨 harness 支持 **pi**、**DeepSeek Harness (dsh)** 和 **Claude Code**。

## 为什么需要它

- **"agent 刚才到底干了什么？"** —— 会话看完就消失在终端滚屏里。hindsight 把每次工具调用、输出、文件改动和 token 消耗存成统一的事件流。
- **"换模型/装插件到底有没有变好？"** —— 同一任务跑两遍，直接 diff 轨迹：哪些步骤一致、最终文件差在哪、各烧了多少 token。
- **可传播的复盘** —— 分享一条回放链接，而不是终端截图。

## 快速上手

需要 Node.js ≥ 18，零依赖：

```sh
hindsight import <会话日志.jsonl>    # 自动识别 pi / claude / native 格式
hindsight list                      # 列出所有会话
hindsight show <id>                 # 终端里看纯文本时间轴
hindsight open                      # 本地网页 UI（http://127.0.0.1:7788）
hindsight diff <idA> <idB>          # 终端 diff 摘要（网页版有可视化对比）
```

数据存放在 `~/.hindsight`（可用 `$HINDSIGHT_HOME` 覆盖），全部本地存储，不出你的机器。

## 实时录制（ingest API）

harness 插件可以把事件流式推给运行中的 `hindsight open`：

- `POST /api/ingest/start` —— 开始录制，返回会话 id
- `POST /api/ingest/:id` —— 追加事件

pi 实时录制扩展和 dsh session-storage 插件已在路线图上（见上方 Roadmap）。

## 贡献

欢迎 issue 和 PR。如果你在用某个还没支持的 harness，适配器接口很简单：把它的会话日志转成上面的 JSONL 事件格式即可（参考 `src/adapters/`）。
