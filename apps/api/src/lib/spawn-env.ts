// Environment for spawned agent CLIs (Codex/Claude/Gemini) and their usage probes.
//
// These subprocesses can, on some providers, run shell during a turn — so they must NOT inherit
// Oplyr-internal secrets they have no need for. Most importantly the local API token: an agent that
// could read $LOCAL_API_AUTH_TOKEN from its own environment could drive the local API. We keep the
// rest of the parent env (PATH, HOME, and the provider's own API keys the CLI legitimately needs)
// and strip only Oplyr-internal values.
const STRIPPED_KEYS = ['LOCAL_API_AUTH_TOKEN'];

export function agentSpawnEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of STRIPPED_KEYS) {
    delete env[key];
  }
  return env;
}
