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

If you want, I can now set the secret from the `rediss://` string you provided and publish the worker for you. After deploy you can watch the first execution in the Cloudflare dashboard and the Upstash console for write timestamps.
