# redis-live — Upstash Redis keep-alive via Cloudflare Worker

This repo contains a small Cloudflare Worker that sends a tiny write to one or more Upstash Redis instances once per day to prevent the free tier from sleeping after 14 days without writes.

Files added
- `src/index.js` — Worker source. Exposes a scheduled handler and a manual `/run` endpoint.
- `wrangler.toml` — Wrangler config with a default daily cron.

How it works
- The Worker reads two environment entries:
  - `REDIS_URLS` (vars in `wrangler.toml`) — newline- or comma-separated Upstash HTTPS base URLs (e.g. `https://adapted-hawk-11134.upstash.io`).
  - `REDIS_PASSWORDS` (secret) — newline-separated passwords for each instance in the same order. If only one password is provided, it will be reused for all URLs.
- Each run performs: `SET keepalive:<timestamp> 1 EX 86400` for each instance.

Deploy (recommended safe sequence)

1) Put the repository in your local workspace (already here).

2) Set the secret `REDIS_PASSWORDS` using `wrangler` (this is interactive):

```bash
# If you have a single instance, run:
wrangler secret put REDIS_PASSWORDS
# then paste the password (the Upstash token) and press Enter.
```

If you prefer non-interactive and have `wrangler` configured in CI, you can pipe the secret:

```bash
echo -n "<your-password>" | wrangler secret put REDIS_PASSWORDS
```

For multiple instances, paste multiple lines (one password per line, in same order as `REDIS_URLS`).

3) Publish the worker:

```bash
wrangler publish
```

4) Verify: Cloudflare dashboard -> Workers -> your worker, or call the manual endpoint:

```bash
curl -s https://<your-worker-domain>/run | jq
```

Notes & security
- Never commit secrets. `wrangler secret put` stores secrets securely in Cloudflare and they do not appear in git.
- Default cron in `wrangler.toml` runs daily at 00:00 UTC. Change the `crons` value if you want a different schedule (e.g., every 6 hours: `0 */6 * * *`).

Cron implementation (how it works)

- The worker implements a `scheduled` handler and registers Cron Triggers via the Wrangler configuration. Cloudflare will call the `scheduled` handler on the configured cron schedule (UTC).
- Key points from the code:
  - `src/index.js` exports a default object with two handlers: `scheduled(controller, env, ctx)` and `fetch(request, env, ctx)`.
  - The `scheduled` handler reads `env.REDIS_URLS` and `env.REDIS_PASSWORDS`, then for each URL issues a POST to the Upstash REST endpoint with the Redis command as a JSON array, for example:

    ["SET", "keepalive:<timestamp>", "1", "EX", "86400"]

  - Authentication: the worker first attempts `Authorization: Bearer <token>` (Upstash REST token). If that returns 401, it falls back to Basic Auth (`Authorization: Basic base64(default:<token>)`). This makes the worker robust across Upstash credential styles.
  - Cron schedule is declared in `wrangler.toml` under the `[triggers]` table, for example:

    [triggers]
    crons = ["0 0 * * *"]

    Cloudflare requires the `scheduled` handler and that triggers be declared under `[triggers]` for Wrangler-managed projects (see Cloudflare docs).

How to add more Redis instances

- Edit `wrangler.toml` and add more endpoints to `REDIS_URLS` (comma or newline separated), for example:

  ```toml
  [vars]
  REDIS_URLS = "https://a.upstash.io,https://b.upstash.io"
  [triggers]
  crons = ["0 0 * * *"]
  ```

- Then set `REDIS_PASSWORDS` secret with one token per line in the same order (or a single token will be reused):

  ```bash
  # interactive
  wrangler secret put REDIS_PASSWORDS

  # or non-interactive (example with two tokens)
  printf "token-for-a\ntoken-for-b" | wrangler secret put REDIS_PASSWORDS
  ```

Verification & logs

- You can manually trigger an immediate run with the `/run` endpoint:

  ```bash
  curl -s https://<your-worker-domain>/run | jq
  ```

- Cron executions and history appear in the Cloudflare dashboard (Workers -> Settings -> Triggers -> Cron Events) and in Workers Logs.

If you want, I can push this repository to GitHub for you (I will run `git add/commit/push` from the workspace). After pushing I will report the remote status and the commit id.
