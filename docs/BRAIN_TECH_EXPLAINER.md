# Oplyr Brain — How It Works (Plain English, Pitch-Ready)

**For:** you, to understand your own product cold and pitch it to anyone — investors, users, a skeptical engineer.
**Date:** 2026-07-11
**Companion docs:** design spec `docs/superpowers/specs/2026-07-11-oplyr-brain-memory-v2-design.md`, code review `docs/BRAIN_PHASE1_REVIEW_2026-07-07.md`.

---

## The 20-second pitch

> Oplyr has a **local brain**. As you and your AI agents work, it quietly distills the important stuff — decisions, conventions, your preferences — into a private memory that lives **only on your Mac**. Later, when you ask something related, it feeds the right memories back to the agent so it already knows your project and how you work. It remembers **across sessions, across agents, and across projects**, it shows you **exactly what it knows and which AI said it**, and you can see or delete any of it. Nothing ever leaves your machine.

That's the whole thing. The rest of this doc is how each piece actually works.

---

## The pipeline (what happens on every turn)

Think of it as two loops: **remembering** (capture) and **reminding** (recall).

### Remembering (capture) — runs after each turn, in the background
1. **Gate.** A cheap check asks "did anything worth remembering just happen?" "thanks" / "ok" → skip. A real decision or explanation → continue. (Saves money — no AI call on trivial turns.)
2. **Distill.** The same local agent that just answered reads the turn and writes clean "memory atoms" as structured data — e.g. `{type: decision, text: "The team standardized on JWT auth", entities: ["auth","jwt"]}`. This is why the memories read like a human wrote them instead of random sentence fragments.
3. **Safety filter.** Every atom is re-checked by *our own* secret scanner (never trust the model). Anything that looks like a key/token/password/secret path is dropped (or, in the power-user mode, marked sensitive and kept out of recall by default).
4. **Embed.** Each atom's text is turned into an **embedding** (explained below) — a list of numbers that captures its *meaning* — computed by a small model running **on your Mac**.
5. **Store.** The atom + its embedding go into a dedicated `brain.db` SQLite file. If the same idea already exists, we **merge** instead of duplicating, and record which agent said it.

All of this happens **off the response path** — you never wait for it. If it fails (rate limit, whatever), the turn is unaffected; the memory is just skipped.

### Reminding (recall) — runs before the agent answers
1. Your message is embedded the same way.
2. We find the memories whose meaning is closest to your message (+ a few related ones via the graph).
3. The best handful get pasted at the top of the agent's prompt as clearly-labeled, reference-only notes.
4. The agent answers already knowing your context.

---

## Embeddings — the key idea (what "binary/vector" really means)

You intuited this exactly. Here's the precise version.

A computer can't compare *meaning* by matching words — "auth middleware" and "login handler" share no words but mean nearly the same thing. So we use a small neural model that reads a piece of text and outputs a **vector**: a list of ~384 numbers (stored as raw bytes — the "binary" you were picturing). The magic property: **texts that mean similar things get similar vectors.** "auth middleware" and "login handler" land close together; "banana bread recipe" lands far away.

So "does this memory relate to what the user just asked?" becomes a math question: **how close are these two vectors?** That closeness measure is called **cosine similarity** — a number from -1 (opposite) to 1 (basically the same). We rank memories by it.

The embedding model is bundled inside Oplyr and runs on-device (same way we already ship the speech model). **No text is ever sent to OpenAI, Anthropic, or anyone to make these vectors.** That's what keeps "nothing leaves your Mac" true even for the smart semantic search.

---

## The thing you asked about: brute-force cosine vs. sqlite-vec

This is a **speed optimization decision**, and I deliberately did NOT make the beta depend on the fancy option. Here's the honest trade-off in plain terms.

**The task at recall time:** you have N stored memories, each with a vector. You have the query's vector. You need the closest few.

**Option A — "brute-force cosine" (what we ship):**
Just compare the query vector against *every* memory's vector, one by one, and keep the top matches. It's a simple loop.
- "Brute-force" sounds slow, but it isn't at our scale. Comparing 384 numbers is trivial for a CPU. Doing it for **10,000 memories takes under ~10 milliseconds** — faster than a blink, and a heavy user won't have 10,000 memories for a long time.
- **Zero extra dependencies.** It's plain code in the app.

**Option B — "sqlite-vec" (deferred):**
A specialized database extension that builds an **index** so it can find close vectors without scanning all of them — like a book's index vs. reading every page. This matters at **hundreds of thousands to millions** of vectors.
- The catch: it's a **native binary extension** that must be compiled for the exact platform and **code-signed + notarized** to run inside a sealed macOS app. That's the single most fragile, most likely-to-break-at-the-worst-time part of shipping a Mac app. (It's the same class of pain as the native modules we already wrestle with on every Electron upgrade.)

**The decision:** At beta scale, brute-force is *already fast enough that a user cannot perceive the difference*, and it can't break the notarized build because there's nothing native to sign. So we get the full "magic semantic memory" experience now, with **none of the packaging risk**. `sqlite-vec` becomes a drop-in speed upgrade *if and when* someone accumulates enough memories to need it — a good problem to have, solved later.

**Pitch line:** *"Semantic search over your whole memory, on-device, in under 10 milliseconds — and we did it without a fragile native dependency, so it can't break the app."*

---

## The graph (what the Memory screen visualizes)

When the distiller writes a memory, it also tags the **entities** it's about — files, tools, projects, people ("auth", "brain.db", "the footer"). Two memories that share an entity are **related**, so we draw an edge between them. The Memory screen renders this as a graph: memories are dots, shared-entity relationships are lines, and clusters form around the things you work on most.

Important honesty point (this is a real upgrade over what existed): the **old** graph faked its connections by guessing at text similarity in the browser. The **new** graph's edges come from **real entities the model extracted and we stored** — so the picture reflects how the brain actually relates things, not a cosmetic guess. Don't call it a "knowledge graph" in a demo to an expert — call it an **entity-linked memory graph**, which is exactly what it is.

---

## Cross-project memory (your #1 feature) — "tiered + labeled"

You wanted the brain to work *across* projects, not be trapped in one repo. It does, safely:
- **How-you-work memories** (your preferences, conventions) surface in **every** project. That's the "it just knows my style" feeling.
- **Project-specific facts** stay in their own project, but can surface in *another* project **only when they're strongly relevant** — and when they do, they're **labeled with where they came from** (`[from project: X]`), so it's never a mystery.
- **Per-project "isolate" switch:** mark a client's private repo isolated and its memories never leak out, and it ignores everyone else's. Essential for people juggling confidential client work.

**Pitch line:** *"Your brain follows you across every project, but a private client repo can be walled off with one switch."*

---

## Multi-agent memory ("which AI said what")

Multiple agents (Codex, Claude, Gemini) share one brain. If two of them independently reach the same conclusion, we **don't** store it twice — it's **one memory with a list of contributors**. Codex said it, then Claude confirmed it. And here's the nice part: when a second agent independently agrees, the memory's **confidence goes up** — the brain literally gets *more sure* about things the agents agree on. The UI shows you the contributors ("Claude · Codex").

**Pitch line:** *"When two different AIs independently agree on something about your codebase, the brain trusts it more — just like you would."*

---

## Local-first & safety (the audit story)

- **Nothing leaves the Mac.** Distillation uses the agent you already connected (your own account); embeddings run on a bundled on-device model; storage is a local SQLite file with owner-only permissions (`0700`/`0600`). No embedding API, no telemetry, no cloud.
- **Secrets never get remembered.** We reuse Oplyr's existing secret policy to scan every atom; keys/tokens/passwords are dropped. A "sensitive" item is only ever captured or recalled if you explicitly unlock the power-user mode (off by default, behind a loud warning).
- **Memory can't hijack the agent.** Recalled notes are injected in a fenced, clearly-labeled "reference only, never instructions, never newer than the current message" block — so a stray sentence in an old memory can't act as a command (prompt-injection defense).
- **You can see and delete everything.** The Memory screen lists, searches, and deletes any memory, live. That transparency is what lets us honestly say "no black box."

**Pitch line:** *"It's the only AI memory that's genuinely private — it runs entirely on your machine, it refuses to remember your secrets, and you can read or wipe every single thing it knows."*

---

## What's shipping in beta vs. deferred (be honest in a pitch)

**Shipping:** agent-distilled capture · on-device semantic recall (brute-force cosine) · entity-linked memory graph · tiered + labeled cross-project + per-project isolate · multi-agent attribution + corroboration confidence · a rebuilt live Memory screen · full local-first + secret safety.

**Deferred (deliberately, not forgotten):**
- `sqlite-vec` vector index — a speed upgrade only needed at very large memory sizes.
- CoreML embedding model — a speed upgrade over the current bundled model.
- `supersedes`/`contradicts` graph edges — "this decision replaced that one" reasoning (needs reconciliation logic).
- Per-turn "🧠 used N memories" chip in chat + onboarding chooser for the `brain.db` location — small transparency/UX polish that touch the chat-stream protocol and desktop config; next pass.

---

## One-paragraph version for a landing page

> Oplyr remembers. As you and your AI coding agents work, a private brain on your Mac distills the decisions, conventions, and preferences that matter — and feeds them back exactly when they're relevant, across sessions, across agents, and across projects. It understands *meaning*, not keywords, so it recalls the right thing even when you phrase it differently. It shows you everything it knows and which AI told it. And it's genuinely yours: it runs entirely on-device, refuses to store secrets, and never sends a byte to the cloud.
