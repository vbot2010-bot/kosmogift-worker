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
    if (path === "/add-balance") return addBalance(request, env)
    if (path === "/admin/set-balance") return adminSetBalance(request, env)

    // НОВЫЕ ЭНДПОИНТЫ
    if (path === "/deposit-request") return depositRequest(request, env)
    if (path === "/check-payment") return checkPayment(request, env)

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

/* ================== BALANCE ================== */
async function getBalance(url, env) {
  const user = url.searchParams.get("user")
  const bal = await env.BALANCE_KV.get(user) || "0"
  return json({ balance: Number(bal) })
}

async function addBalance(request, env) {
  const { user, amount } = await request.json()
  const bal = Number(await env.BALANCE_KV.get(user) || 0)
  const newBal = bal + Number(amount)
  await env.BALANCE_KV.put(user, String(newBal))
  return json({ ok: true, balance: newBal })
}

/* ================== DAILY STATUS ================== */
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

/* ================== DAILY ================== */
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

/* ================== INVENTORY ================== */
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
  return json({ ok: true, inventory: inv })
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

  return json({ ok: true, balance: newBal, inventory: inv })
}

/* ================== ADMIN SET BALANCE ================== */
async function adminSetBalance(request, env) {
  const secret = request.headers.get("ADMIN_SECRET")
  if (secret !== env.ADMIN_SECRET) {
    return new Response("Forbidden", { status: 403 })
  }

  const { user, ton } = await request.json()
  await env.BALANCE_KV.put(user, String(ton))
  return json({ ok: true, user, balance: ton })
}

/* ================== DEPOSIT REQUEST ================== */
async function depositRequest(request, env) {
  const { user, amount } = await request.json()
  await env.DEPOSIT_KV.put(user, JSON.stringify({ amount, created: Date.now() }))
  return json({ ok: true })
}

/* ================== CHECK PAYMENT ================== */
async function checkPayment(request, env) {
  const { user } = await request.json()

  const depRaw = await env.DEPOSIT_KV.get(user)
  if (!depRaw) return json({ error: "no_deposit" })

  const dep = JSON.parse(depRaw)
  const amount = Number(dep.amount)

  const address = env.TON_ADDRESS
  const apiKey = env.TONCENTER_API_KEY

  const url =
    `https://toncenter.com/api/v2/getTransactions?address=${address}&limit=20&api_key=${apiKey}`

  const res = await fetch(url)
  const data = await res.json()

  if (!data.ok) return json({ error: "api_error" })

  const txs = data.result
  let found = null

  for (const tx of txs) {
    if (tx.in_msg && tx.in_msg.value) {
      const value = Number(tx.in_msg.value) / 1e9
      if (value === amount) {
        found = tx.in_msg
        break
      }
    }
  }

  if (!found) return json({ ok: false, message: "not_found" })

  const txHash = found.hash
  const already = await env.CREDITED_KV.get(txHash)
  if (already) return json({ ok: false, message: "already_credited" })

  // начисляем баланс
  const bal = Number(await env.BALANCE_KV.get(user) || 0)
  const newBal = bal + amount
  await env.BALANCE_KV.put(user, String(newBal))

  // помечаем tx как использованную
  await env.CREDITED_KV.put(txHash, "1")

  return json({ ok: true, balance: newBal })
      }
