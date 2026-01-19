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

    // admin
    if (path === "/admin/set-balance") return setBalance(request, env)

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

  // награда (пример)
  const reward = (Math.random() * 0.3 + 0.1).toFixed(2)
  const bal = Number(await env.BALANCE_KV.get(user) || 0)
  const newBal = bal + Number(reward)

  await env.BALANCE_KV.put(user, String(newBal))

  const inv = JSON.parse(await env.INVENTORY_KV.get(user) || "[]")
  inv.push({ name: "Daily Gift", price: 0.2 })
  await env.INVENTORY_KV.put(user, JSON.stringify(inv))

  return json({
    ok: true,
    reward,
    balance: newBal,
    item: "Daily Gift"
  })
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

/* ================= ADMIN ================= */
async function setBalance(request, env) {
  const secret = request.headers.get("ADMIN_SECRET")
  if (secret !== env.ADMIN_SECRET) {
    return json({ error: "wrong_secret" })
  }

  const { user, ton } = await request.json()
  await env.BALANCE_KV.put(user, String(ton))

  return json({ ok: true, user, balance: ton })
    }
