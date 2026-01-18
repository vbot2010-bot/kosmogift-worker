export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // OPTIONS (важно для CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET /balance
    if (request.method === "GET" && path === "/balance") {
      const balance = await env.BALANCE_KV.get("balance");
      return new Response(JSON.stringify({ balance: parseFloat(balance || "0") }), {
        headers: corsHeaders,
      });
    }

    // GET /deposit?amount=0.1 (тест)
    if (request.method === "GET" && path === "/deposit") {
      const amount = parseFloat(url.searchParams.get("amount") || "0");

      if (!amount || amount < 0.1) {
        return new Response(JSON.stringify({ error: "Минимум 0.1 TON" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const current = parseFloat(await env.BALANCE_KV.get("balance") || "0");
      const newBalance = current + amount;

      await env.BALANCE_KV.put("balance", newBalance.toString());

      return new Response(JSON.stringify({ ok: true, balance: newBalance }), {
        headers: corsHeaders,
      });
    }

    // POST /deposit
    if (request.method === "POST" && path === "/deposit") {
      const body = await request.json();
      const amount = parseFloat(body.amount);

      if (!amount || amount < 0.1) {
        return new Response(JSON.stringify({ error: "Минимум 0.1 TON" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const current = parseFloat(await env.BALANCE_KV.get("balance") || "0");
      const newBalance = current + amount;

      await env.BALANCE_KV.put("balance", newBalance.toString());

      return new Response(JSON.stringify({ ok: true, balance: newBalance }), {
        headers: corsHeaders,
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
