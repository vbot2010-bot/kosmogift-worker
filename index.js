export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // GET /balance
    if (request.method === "GET" && path === "/balance") {
      const balance = await env.BALANCE_KV.get("balance");
      return new Response(JSON.stringify({ balance: parseFloat(balance || "0") }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST /deposit
    if (request.method === "POST" && path === "/deposit") {
      const body = await request.json();
      const amount = parseFloat(body.amount);

      if (!amount || amount < 0.1) {
        return new Response(JSON.stringify({ error: "Минимум 0.1 TON" }), { status: 400 });
      }

      const current = parseFloat(await env.BALANCE_KV.get("balance") || "0");
      const newBalance = current + amount;

      await env.BALANCE_KV.put("balance", newBalance.toString());

      return new Response(JSON.stringify({ ok: true, balance: newBalance }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
