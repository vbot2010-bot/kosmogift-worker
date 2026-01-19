const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    // GET /balance
    if (request.method === "GET" && path === "/balance") {
      const userId = url.searchParams.get("user_id");
      const balance = await env.BALANCE_KV.get("balance_" + userId);
      return new Response(JSON.stringify({ balance: parseFloat(balance || "0") }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // GET /inventory
    if (request.method === "GET" && path === "/inventory") {
      const userId = url.searchParams.get("user_id");
      const inventory = await env.INVENTORY_KV.get("inv_" + userId);
      return new Response(JSON.stringify({ inventory: JSON.parse(inventory || "[]") }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // GET /daily
    if (request.method === "GET" && path === "/daily") {
      const userId = url.searchParams.get("user_id");
      const last = await env.DAILY_KV.get("daily_" + userId);
      return new Response(JSON.stringify({ last: last || null }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // POST /open-daily
    if (request.method === "POST" && path === "/open-daily") {
      const body = await request.json();
      const userId = body.user_id;

      const last = await env.DAILY_KV.get("daily_" + userId);
      const now = Date.now();

      if (last && now - parseInt(last) < 24 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({ error: "Вы уже открывали кейс сегодня" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Save last open time
      await env.DAILY_KV.put("daily_" + userId, now.toString());

      // Prize logic
      const rnd = Math.random() * 100;
      let prize;

      if (rnd < 90) prize = { type: "ton", value: 0.01 };
      else if (rnd < 95) prize = { type: "ton", value: 0.02 };
      else if (rnd < 97.5) prize = { type: "ton", value: 0.03 };
      else if (rnd < 98.5) prize = { type: "ton", value: 0.04 };
      else if (rnd < 99.25) prize = { type: "ton", value: 0.05 };
      else if (rnd < 99.75) prize = { type: "ton", value: 0.06 };
      else if (rnd < 99.99) prize = { type: "nft", name: "NFT lol pop", price: 3.26 };
      else prize = { type: "nft", name: "NFT rare", price: 10 };

      return new Response(JSON.stringify({ prize }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // POST /add-ton
    if (request.method === "POST" && path === "/add-ton") {
      const body = await request.json();
      const userId = body.user_id;
      const amount = parseFloat(body.amount);

      const currentBalance = parseFloat(await env.BALANCE_KV.get("balance_" + userId) || "0");
      const newBalance = currentBalance + amount;

      await env.BALANCE_KV.put("balance_" + userId, newBalance.toString());

      return new Response(JSON.stringify({ balance: newBalance }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // POST /add-nft
    if (request.method === "POST" && path === "/add-nft") {
      const body = await request.json();
      const userId = body.user_id;
      const nft = body.nft;

      const inventoryRaw = await env.INVENTORY_KV.get("inv_" + userId);
      const inventory = JSON.parse(inventoryRaw || "[]");

      inventory.push(nft);
      await env.INVENTORY_KV.put("inv_" + userId, JSON.stringify(inventory));

      return new Response(JSON.stringify({ inventory }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // POST /sell-nft
    if (request.method === "POST" && path === "/sell-nft") {
      const body = await request.json();
      const userId = body.user_id;
      const nftName = body.nft_name;
      const price = parseFloat(body.price);

      const inventoryRaw = await env.INVENTORY_KV.get("inv_" + userId);
      const inventory = JSON.parse(inventoryRaw || "[]");

      const index = inventory.findIndex(i => i.name === nftName);
      if (index === -1) {
        return new Response(JSON.stringify({ error: "NFT не найден" }), { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      inventory.splice(index, 1);
      await env.INVENTORY_KV.put("inv_" + userId, JSON.stringify(inventory));

      const currentBalance = parseFloat(await env.BALANCE_KV.get("balance_" + userId) || "0");
      const newBalance = currentBalance + price;
      await env.BALANCE_KV.put("balance_" + userId, newBalance.toString());

      return new Response(JSON.stringify({ balance: newBalance, inventory }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
