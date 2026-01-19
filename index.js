export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (path === "/balance") return getBalance(url, env);
    if (path === "/daily") return daily(url, env);
    if (path === "/daily-status") return dailyStatus(url, env);
    if (path === "/inventory") return inventory(url, env);
    if (path === "/add-nft") return addNft(request, env);
    if (path === "/sell-nft") return sellNft(request, env);
    if (path === "/add-balance") return addBalance(request, env);

    return new Response("Not found", { status: 404 });
  }
}

const json = (data) =>
  new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });

/* ================== BALANCE ================== */
async function getBalance(url, env) {
  const user = url.searchParams.get("user");
  const bal = await env.BALANCE_KV.get(user) || "0";
  return json({ balance: Number(bal) });
}

async function addBalance(request, env) {
  const { user, amount } = await request.json();
  const bal = Number(await env.BALANCE_KV.get(user) || 0);
  const newBal = bal + Number(amount);
  await env.BALANCE_KV.put(user, String(newBal));
  return json({ ok: true, balance: newBal });
}

/* ================== DAILY STATUS ================== */
async function dailyStatus(url, env) {
  return json({ ok: true, remaining: 0, last: 0 });
}

/* ================== DAILY ================== */
async function daily(url, env) {
  return json({ ok: true });
}

/* ================== INVENTORY ================== */
async function inventory(url, env) {
  const user = url.searchParams.get("user");
  const inv = JSON.parse(await env.INVENTORY_KV.get(user) || "[]");
  return json(inv);
}

async function addNft(request, env) {
  const { user, nft } = await request.json();
  const inv = JSON.parse(await env.INVENTORY_KV.get(user) || "[]");
  inv.push(nft);
  await env.INVENTORY_KV.put(user, JSON.stringify(inv));
  return json({ ok: true, inventory: inv });
}

async function sellNft(request, env) {
  const { user, index } = await request.json();
  const inv = JSON.parse(await env.INVENTORY_KV.get(user) || "[]");
  const nft = inv[index];
  if (!nft) return json({ error: "not_found" });

  inv.splice(index, 1);
  await env.INVENTORY_KV.put(user, JSON.stringify(inv));

  const bal = Number(await env.BALANCE_KV.get(user) || 0);
  const newBal = bal + Number(nft.price || 0);
  await env.BALANCE_KV.put(user, String(newBal));

  return json({ ok: true, balance: newBal, inventory: inv });
}
