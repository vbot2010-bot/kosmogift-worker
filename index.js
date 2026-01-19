export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e.message }),
        { status: 500, headers: corsHeaders() }
      )
    }
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }
}

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() })
  }

  const url = new URL(request.url)
  const path = url.pathname

  if (path === "/daily") return daily(url, env)
  if (path === "/balance") return balance(url, env)

  return new Response("Not found", { status: 404, headers: corsHeaders() })
}

async function daily(url, env) {
  const user_id = url.searchParams.get("user_id")
  if (!user_id) {
    return json({ error: "no user_id" })
  }

  const last = await env.DAILY_KV.get(user_id)
  const now = Date.now()

  if (last && now - Number(last) < 86400000) {
    return json({ error: "already" })
  }

  await env.DAILY_KV.put(user_id, String(now))
  return json({ ok: true })
}

async function balance(url, env) {
  const user_id = url.searchParams.get("user_id")
  const bal = await env.BALANCE_KV.get(user_id) || "0"
  return json({ balance: bal })
}

function json(data) {
  return new Response(
    JSON.stringify(data),
    {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    }
  )
}
