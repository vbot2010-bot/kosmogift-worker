export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/balance") return getBalance(url, env)
    if (path === "/daily") return daily(url, env)
    if (path === "/daily-status") return dailyStatus(url, env)
    if (path === "/inventory") return inventory(url, env)
    if (path === "/add-nft") return addNft(request, env)
    if (path === "/sell-nft") return sellNft(request, env)

    return new Response("Not found", { status: 404 })
  }
}

const json = data =>
  new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  })

async function getBalance(url, env) {
  const user = url.searchParams.get("user")
  const bal = await env.BALANCE_KV.get(user) || "0"
  return json({ balance: Number(bal) })
}

async function dailyStatus(url, env) {
  const user = url.searchParams.get("user")
  const last = await env.DAILY_KV.get(user)

  if (!last) {
    return json({ ok: true, remaining: 0, last: 0 })
  }

  const now = Date.now()
  const diff = now - Number(last)
  const remaining = diff >= 86400000 ? 0 : 86400000 - diff

  return json({ ok: true, remaining, last: Number(last) })
}
async function daily(url, env) {
  const user = url.searchParams.get("user")
  if (!user) return json({ error: "no_user" })

  const last = await env.DAILY_KV.get(user)
  const now = Date.now()

  if (last && now - Number(last) < 86400000) {
    return json({ error: "already" })
  }

  await env.DAILY_KV.put(user, String(now))

  return json({ ok: true })
}

  await env.DAILY_KV.put(user, String(now))

  // награда (с шансами)
  const prizes = [
    { type: "ton", value: 0.01, chance: 90 },
    { type: "ton", value: 0.02, chance: 5 },
    { type: "ton", value: 0.03, chance: 2.5 },
    { type: "ton", value: 0.04, chance: 1 },
    { type: "ton", value: 0.05, chance: 0.75 },
    { type: "ton", value: 0.06, chance: 0.5 },
    { type: "ton", value: 0.07, chance: 0.24 },
    { type: "nft", value: "lol pop", chance: 0.01 }
  ];

  const rand = Math.random() * 100;
  let sum = 0;
  let prize = prizes[0];

  for (const p of prizes) {
    sum += p.chance;
    if (rand <= sum) {
      prize = p;
      break;
    }
  }

  const bal = Number(await env.BALANCE_KV.get(user) || 0);

  if (prize.type === "ton") {
    const newBal = bal + prize.value;
    await env.BALANCE_KV.put(user, String(newBal));
    return json({ ok: true, type: "ton", value: prize.value, balance: newBal });
  } else {
    const inv = JSON.parse(await env.INVENTORY_KV.get(user) || "[]");
    inv.push({ name: prize.value, price: 3.27 });
    await env.INVENTORY_KV.put(user, JSON.stringify(inv));
    return json({ ok: true, type: "nft", value: prize.value, balance: bal });
  }
}

async function inventory(url, env) {
  const user = url.searchParams.get("user")
  const inv = JSON.parse(await env.INVENTORY_KV.get(user) || "[]")
  return json(inv)
}

async function addNft(request, env) {
  const { user, nft } = await request.json()
  const inv = JSON.parse(await env.INVENTORY_KV.get(user) || "[]")
  inv.push(nft)
  await env.INVENTORY_KV.put(user, JSON.stringify(inv))
  return json(inv)
}

async function sellNft(request, env) {
  const { user, index } = await request.json()
  const inv = JSON.parse(await env.INVENTORY_KV.get(user) || "[]")
  const nft = inv[index]
  if (!nft) return json({ error: "not_found" })

  inv.splice(index, 1)
  await env.INVENTORY_KV.put(user, JSON.stringify(inv))

  const bal = Number(await env.BALANCE_KV.get(user) || 0)
  const newBal = bal + Number(nft.price || 0)

  await env.BALANCE_KV.put(user, String(newBal))
  return json({ balance: newBal, inventory: inv })
}
