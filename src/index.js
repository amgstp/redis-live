// Cloudflare Worker: Upstash Redis keep-alive
// Reads REDIS_URLS (newline- or comma-separated) and REDIS_PASSWORDS (newline-separated secret)
// For each pair it performs: POST to the Upstash REST endpoint with JSON body ["SET", "keepalive:<ts>", "1", "EX", "86400"]

const parseList = (s) => {
  if (!s) return [];
  return s.split(/\r?\n|,/) .map(x => x.trim()).filter(Boolean);
};

const makeBasicAuth = (username, password) => {
  return 'Basic ' + btoa(`${username}:${password}`);
};

async function pingInstance(url, password, username = 'default') {
  const key = `keepalive:${new Date().toISOString()}`;
  const body = JSON.stringify(["SET", key, "1", "EX", "86400"]);
  try {
    // Try Bearer token first (Upstash supports token auth)
    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${password}`,
        'Content-Type': 'application/json'
      },
      body
    });

    // If Bearer failed with 401, try Basic auth fallback
    if (res.status === 401) {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': makeBasicAuth(username, password),
          'Content-Type': 'application/json'
        },
        body
      });
    }

    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function scheduled(event, env, ctx) {
  // Called by Cloudflare Cron Trigger
  const urls = parseList(env.REDIS_URLS);
  const passwords = parseList(env.REDIS_PASSWORDS);

  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const password = passwords[i] || passwords[0] || '';
    results.push({ url, result: await pingInstance(url, password) });
  }

  // Optionally keep lightweight logs in workers logs
  results.forEach((r) => {
    console.log('keepalive:', r.url, r.result && (r.result.status || r.result.error));
  });
  return results;
}

export default {
  async fetch(request, env, ctx) {
    // Manual trigger + health endpoint
    const urlObj = new URL(request.url);
    if (urlObj.pathname === '/run') {
      const urls = parseList(env.REDIS_URLS);
      const passwords = parseList(env.REDIS_PASSWORDS);
      const results = [];
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const password = passwords[i] || passwords[0] || '';
        results.push({ url, result: await pingInstance(url, password) });
      }
      return new Response(JSON.stringify({ ok: true, results }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (urlObj.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ready' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Upstash keepalive worker. Use /run to trigger or configure Cron.', { status: 200 });
  }
};
