# CLI slash commands — reference for Oplyr `/` command support

> Captured **2026-07-28** from the official docs, cross-checked against installed versions on the
> build machine: **Claude Code 2.1.220**, **Codex CLI 0.145.0**. These lists drift with CLI
> versions — re-verify against the sources at the bottom before building.
>
> **Goal:** support `/` commands inside Oplyr's chat/room composer. Typing `/` should open an
> autocomplete (like the existing `@mention`), and each command maps to an Oplyr action or the
> active provider's behaviour.

---

## How we'll approach this in Oplyr

Oplyr drives the CLIs **non-interactively** (`codex exec`, Claude Code exec, NDJSON streaming) — it
does **not** run their interactive TUIs. So most of these commands can't be "passed through" verbatim;
we implement an Oplyr-native slash layer that falls into three buckets:

- **(A) Map to an existing Oplyr feature** — we already do the thing; just wire a `/` alias to it.
- **(B) Implement natively** — sensible in Oplyr, needs new UI/logic.
- **(C) TUI-only / N/A / defer** — meaningless outside the CLI's own terminal, or out of scope.

**Already have the underlying behaviour today** (wire these first — bucket A):
- `/status`, `/usage`, `/cost` → the live provider-usage scrape (Topbar meters + Settings → Agents).
- `/model`, `/effort` → the Topbar model + effort pickers.
- `/clear` → "Clear chat" (keeps the Brain).
- `/mention` → the `@mention` room autocomplete.
- `/diff` + approvals → the approval-gated diff review flow.
- `/init` → connect-a-folder / Codebase Map.
- `/memory`, `/memories` → the Brain (capture + recall).
- `/compact` → chat history is per-project + summarised into the Brain.
- `/login`, `/logout` → provider connect/disconnect in Settings.
- `/review`, `/security-review` → future: run against the current diff.

Everything below is the **full** documented set per CLI, grouped, so we can decide bucket per command.

---

## Claude Code — `/` commands (2.1.220)

**Session & conversation**
- `/clear` — new conversation, empty context
- `/compact [instructions]` — summarise the conversation to free context
- `/context [all]` — visualise context usage
- `/resume [name]` — return to an earlier conversation
- `/branch [name]` — branch the conversation to try a direction
- `/fork [prompt]` — copy conversation into a background session
- `/rewind [checkpoint|summary]` — roll code + chat back to a checkpoint
- `/save-checkpoint` — create a named checkpoint
- `/export [filename]` — export conversation as text
- `/copy [N]` — copy the last assistant response
- `/exit` — quit

**Background & subagents**
- `/background [prompt]` — detach session as a background agent
- `/subtask [prompt]` — hand a side task to a subagent
- `/tasks` — list background work (incl. finished subagents)
- `/agents` — manage subagent configs

**Model & behaviour**
- `/model [model]` — switch + save the model
- `/effort [level|auto]` — set model effort level
- `/fast [on|off]` — toggle fast mode
- `/plan` — plan mode before a large change
- `/config [key=value]` — settings (theme/model/output style)
- `/advisor [model|off]` — guidance tool on/off
- `/focus` — minimal view
- `/color [color|default]` — prompt bar colour

**Code, git & files**
- `/diff` — interactive diff of uncommitted changes
- `/run <command>` — run a shell command, capture output
- `/worktree [list|attach <path>]` — manage git worktrees
- `/add-dir <path>` — add a working directory
- `/cd <path>` — change working directory
- `/init` — create a `CLAUDE.md`
- `/test` — run tests, analyse results

**Skills invoked as commands (review / verify / research)**
- `/review [pr#]` — read-only PR review
- `/security-review` — scan the diff for vulnerabilities
- `/simplify` — suggest code simplifications
- `/verify` — verify code correctness
- `/code-review [level] [--fix] [--comment] [target]` — review diff for bugs + cleanup
- `/batch <instruction>` — orchestrate large parallel changes
- `/deep-research <question>` — fan-out web research → cited report
- `/dataviz [request]` — chart/dashboard design guidance
- `/loop [interval] [prompt]` — run a prompt on a repeat
- `/design-sync [hint]`, `/design-login` — design-system upload
- `/fewer-permission-prompts` — scan transcripts, reduce prompts
- `/claude-api [migrate|managed-agents-onboard]` — Claude API reference

**Memory & project**
- `/memory` — edit `CLAUDE.md` + manage auto-memory
- `/projects` — manage project storage
- `/goal [condition|clear]` — work until a condition is met

**Account & plan**
- `/login`, `/logout` — sign in / out
- `/usage` — token usage + cost (`/cost` is an alias)
- `/upgrade` — upgrade to a paid plan
- `/passes` — share a free week

**Diagnostics & help**
- `/status` — session status + background counts
- `/doctor` — setup checkup
- `/debug [description]` — debug logging
- `/heapdump` — JS heap snapshot
- `/insights` — analyse your sessions
- `/tips`, `/help`, `/keybindings`, `/hooks`, `/permissions`

**Integrations**
- `/mcp [...]` — manage MCP servers
- `/ide`, `/chrome`, `/desktop`, `/mobile`, `/teleport` — surfaces / hand-off
- `/install-github-app`, `/install-slack-app`, `/plugins`
- `/web` — web search
- `/feedback` — send feedback
- `/btw [question]` — quick side question

---

## Codex CLI — `/` commands (0.145.0)

**Session**
- `/new` — fresh chat in the same session
- `/clear` — reset terminal + fresh chat
- `/rename` — rename the current chat
- `/archive` — archive session
- `/delete` — permanently remove session
- `/compact` — summarise chat to save tokens
- `/copy` — copy the latest response (also `Ctrl+O`)
- `/resume` — continue a previous session
- `/fork` — branch the current chat
- `/side` (alias `/btw`) — ephemeral side chat
- `/exit`, `/quit` — close the CLI

**Model & behaviour**
- `/model` — switch active model
- `/fast` — toggle Fast service tier
- `/plan` — enable plan mode
- `/personality` — communication style
- `/permissions` — approval + sandbox levels (`/approvals` still works as an alias, not shown in the popup)
- `/experimental` — toggle experimental features
- `/raw` — raw scrollback mode

**Code, git & context**
- `/diff` — show git changes
- `/review` — review the working tree
- `/init` — scaffold `AGENTS.md`
- `/mention` — attach files/folders
- `/goal` — set/manage the task target

**Agents, skills & tools**
- `/agent` (alias `/subagents`) — switch agent threads
- `/skills` — browse + apply task skills
- `/apps` — browse/attach connectors
- `/plugins` — manage plugins
- `/hooks` — view/control lifecycle hooks
- `/mcp` — list MCP tools
- `/import` — migrate external agent configs

**Background**
- `/ps` — monitor background terminals
- `/stop` — cancel background work
- `/approve` — retry a denied auto-review action

**Memory & account**
- `/memories` — control memory injection + generation
- `/status` — session details (model, approval policy, writable roots, token usage)
- `/logout` — sign out
- `/feedback` — report issues

**Editor & environment**
- `/ide` — pull in editor context
- `/keymap` — customise shortcuts
- `/vim` — Vim editing mode
- `/app` — continue in the desktop app
- Windows-only: `/setup-default-sandbox`, `/sandbox-add-read-dir`

---

## Sources
- Claude Code — built-in commands: https://code.claude.com/docs/en/commands
- Claude Code — slash commands / skills: https://code.claude.com/docs/en/slash-commands
- Codex CLI — developer commands (OpenAI): https://learn.chatgpt.com/docs/developer-commands?surface=cli
- Codex CLI — slash commands guide: https://developers.openai.com/codex/guides/slash-commands/
