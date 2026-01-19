addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method === "GET" && path === "/balance") {
    const user_id = url.searchParams.get("user_id");
    const bal = await BALANCE_KV.get(user_id) || "0";
    return json({ balance: parseFloat(bal) }, 200);
  }

  if (request.method === "GET" && path === "/inventory") {
    const user_id = url.searchParams.get("user_id");
    const inv = await INVENTORY_KV.get(user_id);
    return json({ inventory: inv ? JSON.parse(inv) : [] }, 200);
  }

  if (request.method === "GET" && path === "/daily") {
    const user_id = url.searchParams.get("user_id");
    const last = await DAILY_KV.get(user_id);

    const now = Date.now();
    if (last && now - parseInt(last) < 86400000) {
      return json({ ok: false, error: "already" }, 200);
    }

    return json({ ok: true }, 200);
  }

  if (request.method === "POST" && path === "/open-daily") {
    const body = await request.json();
    const user_id = body.user_id;

    const last = await DAILY_KV.get(user_id);
    const now = Date.now();
    if (last && now - parseInt(last) < 86400000) {
      return json({ ok: false, error: "already" }, 200);
    }

    // Save last open time
    await DAILY_KV.put(user_id, String(now));

    // Prize logic
    const rnd = Math.random() * 100;
    let prize;

    if (rnd < 90) prize = { type: "ton", value: 0.01 };
    else if (rnd < 95) prize = { type: "ton", value: 0.02 };
    else if (rnd < 97.5) prize = { type: "ton", value: 0.03 };
    else if (rnd < 98.5) prize = { type: "ton", value: 0.04 };
    else if (rnd < 99.25) prize = { type: "ton", value: 0.05 };
    else if (rnd < 99.75) prize = { type: "ton", value: 0.06 };
    else if (rnd < 99.99) prize = { type: "ton", value: 0.07 };
    else prize = { type: "nft", name: "NFT lol pop", price: 3.26 };

    return json({ ok: true, prize }, 200);
  }

  if (request.method === "POST" && path === "/add-ton") {
    const body = await request.json();
    const user_id = body.user_id;
    const amount = parseFloat(body.amount);

    const bal = parseFloat(await BALANCE_KV.get(user_id) || "0");
    const newBal = bal + amount;

    await BALANCE_KV.put(user_id, String(newBal));
    return json({ balance: newBal }, 200);
  }

  if (request.method === "POST" && path === "/add-nft") {
    const body = await request.json();
    const user_id = body.user_id;
    const nft = body.nft;

    const invRaw = await INVENTORY_KV.get(user_id);
    const inv = invRaw ? JSON.parse(invRaw) : [];
    inv.push(nft);

    await INVENTORY_KV.put(user_id, JSON.stringify(inv));
    return json({ inventory: inv }, 200);
  }

  if (request.method === "POST" && path === "/sell-nft") {
    const body = await request.json();
    const user_id = body.user_id;
    const nft_name = body.nft_name;
    const price = parseFloat(body.price);

    const invRaw = await INVENTORY_KV.get(user_id);
    const inv = invRaw ? JSON.parse(invRaw) : [];

    const idx = inv.findIndex(x => x.name === nft_name);
    if (idx === -1) return json({ error: "not found" }, 404);

    inv.splice(idx, 1);

    await INVENTORY_KV.put(user_id, JSON.stringify(inv));

    const bal = parseFloat(await BALANCE_KV.get(user_id) || "0");
    const newBal = bal + price;
    await BALANCE_KV.put(user_id, String(newBal));

    return json({ inventory: inv, balance: newBal }, 200);
  }

  return new Response("Not found", { status: 404, headers: CORS_HEADERS });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}
