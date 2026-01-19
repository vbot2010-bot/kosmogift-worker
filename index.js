addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

const BALANCE_KV = BALANCE_KV
const PAYMENTS_KV = PAYMENTS_KV
const INVENTORY_KV = INVENTORY_KV
const DAILY_KV = DAILY_KV

const TONCENTER_KEY = TONCENTER_KEY

const YOUR_WALLET = "UQAFXBXzBzau6ZCWzruiVrlTg3HAc8MF6gKIntqTLDifuWOi"

async function handleRequest(request) {
  const url = new URL(request.url)

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    })
  }

  const path = url.pathname

  // routes
  if (path === "/balance") return cors(getBalance(url))
  if (path === "/inventory") return cors(getInventory(url))
  if (path === "/daily") return cors(getDaily(url))
  if (path === "/add-ton") return cors(addTon(request))
  if (path === "/add-nft") return cors(addNft(request))
  if (path === "/sell-nft") return cors(sellNft(request))
  if (path === "/create-payment") return cors(createPayment(request))
  if (path === "/check-payment") return cors(checkPayment(request))

  return cors(new Response("Not found", { status: 404 }))
}

function cors(responsePromise) {
  return Promise.resolve(responsePromise).then(res => {
    res.headers.set("Access-Control-Allow-Origin", "*")
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    res.headers.set("Access-Control-Allow-Headers", "Content-Type")
    return res
  })
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  })
}

async function getBalance(url) {
  const user_id = url.searchParams.get("user_id") || ""
  const bal = await BALANCE_KV.get(user_id) || "0"
  return json({ balance: bal })
}

async function getInventory(url) {
  const user_id = url.searchParams.get("user_id") || ""
  const inv = await INVENTORY_KV.get(user_id)
  return json({ inventory: inv ? JSON.parse(inv) : [] })
}

async function getDaily(url) {
  const user_id = url.searchParams.get("user_id")
  if (!user_id) return json({ error: "no user_id" })

  const last = await DAILY_KV.get(user_id)
  const now = Date.now()

  if (last && now - parseInt(last) < 86400000) {
    return json({ error: "already" })
  }

  await DAILY_KV.put(user_id, String(now))
  return json({ ok: true })
}

async function addTon(request) {
  const body = await request.json()
  const user_id = body.user_id
  const amount = parseFloat(body.amount)

  const bal = parseFloat(await BALANCE_KV.get(user_id) || 0)
  const newBal = bal + amount

  await BALANCE_KV.put(user_id, String(newBal))
  return json({ balance: newBal })
}

async function addNft(request) {
  const body = await request.json()
  const user_id = body.user_id
  const nft = body.nft

  const inv = await INVENTORY_KV.get(user_id)
  const arr = inv ? JSON.parse(inv) : []
  arr.push(nft)

  await INVENTORY_KV.put(user_id, JSON.stringify(arr))
  return json({ inventory: arr })
}

async function sellNft(request) {
  const body = await request.json()
  const user_id = body.user_id
  const nft_name = body.nft_name
  const price = parseFloat(body.price)

  const inv = await INVENTORY_KV.get(user_id)
  const arr = inv ? JSON.parse(inv) : []

  const idx = arr.findIndex(x => x.name === nft_name)
  if (idx === -1) return json({ error: "not found" })

  arr.splice(idx, 1)
  await INVENTORY_KV.put(user_id, JSON.stringify(arr))

  const bal = parseFloat(await BALANCE_KV.get(user_id) || 0)
  const newBal = bal + price
  await BALANCE_KV.put(user_id, String(newBal))

  return json({ inventory: arr, balance: newBal })
}

// ========== Payment ==========

async function createPayment(request) {
  const body = await request.json()
  const user_id = body.user_id
  const amount = body.amount

  const id = "pay_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7)

  await PAYMENTS_KV.put(id, JSON.stringify({
    user_id,
    amount,
    status: "pending"
  }))

  return json({ payment_id: id })
}

async function checkPayment(request) {
  const body = await request.json()
  const id = body.payment_id
  const amount = parseFloat(body.amount)

  const pay = await PAYMENTS_KV.get(id)
  if (!pay) return json({ error: "not found" })

  const data = JSON.parse(pay)

  if (data.status === "done") {
    return json({ ok: true, balance: await BALANCE_KV.get(data.user_id) })
  }

  const res = await fetch(
    `https://toncenter.com/api/v2/getTransactions?address=${YOUR_WALLET}&limit=50`,
    { headers: { "X-API-Key": TONCENTER_KEY } }
  )

  const r = await res.json()
  if (!r.ok) return json({ error: "toncenter error" })

  const txs = r.result.transactions || []

  for (const tx of txs) {
    if (!tx.in_msg) continue

    const text = tx.in_msg.text || ""
    const value = parseFloat(tx.in_msg.value) || 0
    const tonValue = value / 1e9

    if (text === id && tonValue >= amount) {
      const bal = parseFloat(await BALANCE_KV.get(data.user_id) || 0)
      const newBal = bal + amount

      await BALANCE_KV.put(data.user_id, String(newBal))

      data.status = "done"
      await PAYMENTS_KV.put(id, JSON.stringify(data))

      return json({ ok: true, balance: newBal })
    }
  }

  return json({ ok: false })
  }
