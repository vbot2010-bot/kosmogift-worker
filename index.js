export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/balance") return getBalance(url, env)
    if (path === "/daily") return daily(url, env)
    if (path === "/daily-status") return dailyStatus(url, env)
    if (path === "/add-balance") return addBalance(request, env)
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

  if (!last) return json({ remaining: 0 })

  const diff = Date.now() - Number(last)
  const remaining = diff >= 86400000 ? 0 : 86400000 - diff

  return json({ remaining })
}

async function daily(url, env) {
  const user = url.searchParams.get("user")
  if (!user) return json({ error: "no_user" })

  const last = await env.DAILY_KV.get(user)
  if (last && Date.now() - Number(last) < 86400000) {
    return json({ error: "already" })
  }

  await env.DAILY_KV.put(user, String(Date.now()))
  return json({ ok: true })
}

async function addBalance(request, env) {
  const { user, amount } = await request.json()

  const bal = Number(await env.BALANCE_KV.get(user) || 0)
  const newBal = bal + Number(amount)

  await env.BALANCE_KV.put(user, String(newBal))
  return json({ balance: newBal })
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
  const newBal = bal + Number(nft.price)

  await env.BALANCE_KV.put(user, String(newBal))
  return json({ balance: newBal })
    }
