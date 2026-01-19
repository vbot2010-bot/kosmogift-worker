export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/balance") return getBalance(url, env)
    if (path === "/daily") return daily(url, env)
    if (path === "/inventory") return inventory(url, env)
    if (path === "/add-nft") return addNft(request, env)
    if (path === "/sell-nft") return sellNft(request, env)
    if (path === "/add-ton") return addTon(request, env)

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

/* ================= PRIZES ================= */
const prizes = [
  { name: "NFT #1", type: "nft", price: 3.27, chance: 10 },
  { name: "NFT #2", type: "nft", price: 3.27, chance: 5 },
  { name: "10 TON", type: "ton", amount: 10, chance: 20 },
  { name: "5 TON", type: "ton", amount: 5, chance: 25 },
  { name: "1 TON", type: "ton", amount: 1, chance: 40 },
]

function getRandomPrize() {
  const total = prizes.reduce((a, b) => a + b.chance, 0)
  let r = Math.random() * total
  for (const p of prizes) {
    r -= p.chance
    if (r <= 0) return p
  }
  return prizes[0]
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

  const prize = getRandomPrize()

  // Если TON — НЕ начисляем сразу
  // Возвращаем приз клиенту
  return json({
    ok: true,
    prize
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

async function addTon(request, env) {
  const { user, amount } = await request.json()
  const bal = Number(await env.BALANCE_KV.get(user) || 0)
  const newBal = bal + Number(amount || 0)
  await env.BALANCE_KV.put(user, String(newBal))
  return json({ balance: newBal })
                              }
