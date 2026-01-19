addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

const BALANCE_KV = BALANCE_KV;
const PAYMENTS_KV = PAYMENTS_KV;
const INVENTORY_KV = INVENTORY_KV;
const DAILY_KV = DAILY_KV;

const TONCENTER_KEY = TONCENTER_KEY;

// Твой адрес, куда будут приходить TON
const RECEIVER_ADDRESS = "UQAFXBXzBzau6ZCWzruiVrlTg3HAc8MF6gKIntqTLDifuWOi";

async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === "/balance") return getBalance(url);
  if (url.pathname === "/inventory") return getInventory(url);
  if (url.pathname === "/daily") return getDaily(url);
  if (url.pathname === "/add-ton") return addTon(request);
  if (url.pathname === "/add-nft") return addNft(request);
  if (url.pathname === "/sell-nft") return sellNft(request);

  if (url.pathname === "/create-payment") return createPayment(request);
  if (url.pathname === "/check-payment") return checkPayment(request);

  return new Response("Not found", { status: 404 });
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
}

async function getBalance(url) {
  const user_id = url.searchParams.get("user_id");
  const bal = await BALANCE_KV.get(user_id) || "0";
  return json({ balance: bal });
}

async function getInventory(url) {
  const user_id = url.searchParams.get("user_id");
  const inv = await INVENTORY_KV.get(user_id);
  return json({ inventory: inv ? JSON.parse(inv) : [] });
}

async function getDaily(url) {
  const user_id = url.searchParams.get("user_id");
  const last = await DAILY_KV.get(user_id);

  const now = Date.now();
  if (last && now - parseInt(last) < 86400000) {
    return json({ error: "already" });
  }

  await DAILY_KV.put(user_id, String(now));
  return json({ ok: true });
}

async function addTon(request) {
  const body = await request.json();
  const user_id = body.user_id;
  const amount = parseFloat(body.amount);

  const bal = parseFloat(await BALANCE_KV.get(user_id) || 0);
  const newBal = bal + amount;

  await BALANCE_KV.put(user_id, String(newBal));
  return json({ balance: newBal });
}

async function addNft(request) {
  const body = await request.json();
  const user_id = body.user_id;
  const nft = body.nft;

  const inv = await INVENTORY_KV.get(user_id);
  const arr = inv ? JSON.parse(inv) : [];
  arr.push(nft);

  await INVENTORY_KV.put(user_id, JSON.stringify(arr));
  return json({ inventory: arr });
}

async function sellNft(request) {
  const body = await request.json();
  const user_id = body.user_id;
  const nft_name = body.nft_name;
  const price = parseFloat(body.price);

  const inv = await INVENTORY_KV.get(user_id);
  const arr = inv ? JSON.parse(inv) : [];

  const idx = arr.findIndex(x => x.name === nft_name);
  if (idx === -1) return json({ error: "not found" });

  arr.splice(idx, 1);

  await INVENTORY_KV.put(user_id, JSON.stringify(arr));

  const bal = parseFloat(await BALANCE_KV.get(user_id) || 0);
  const newBal = bal + price;
  await BALANCE_KV.put(user_id, String(newBal));

  return json({ inventory: arr, balance: newBal });
}

// ---------- TON PAYMENT ----------

async function createPayment(request) {
  const body = await request.json();
  const user_id = body.user_id;
  const amount = parseFloat(body.amount);

  const id = "pay_" + Date.now();

  await PAYMENTS_KV.put(id, JSON.stringify({
    user_id,
    amount,
    status: "pending"
  }));

  return json({ payment_id: id });
}

async function checkPayment(request) {
  const body = await request.json();
  const id = body.payment_id;
  const amount = parseFloat(body.amount);

  const pay = await PAYMENTS_KV.get(id);
  if (!pay) return json({ error: "not found" });

  const data = JSON.parse(pay);

  if (data.status === "done") {
    return json({ ok: true });
  }

  // Проверяем транзакции на твоем адресе
  const res = await fetch(`https://toncenter.com/api/v2/getTransactions?address=${RECEIVER_ADDRESS}`, {
    headers: { "X-API-Key": TONCENTER_KEY }
  });

  const r = await res.json();
  if (!r.ok) return json({ error: "toncenter error" });

  // Проверяем, что есть транзакция с текстом payment_id
  const tx = (r.result.transactions || []).find(t => t.in_msg && t.in_msg.message && t.in_msg.message.includes(id));

  if (tx) {
    const bal = parseFloat(await BALANCE_KV.get(data.user_id) || 0);
    const newBal = bal + amount;

    await BALANCE_KV.put(data.user_id, String(newBal));

    data.status = "done";
    await PAYMENTS_KV.put(id, JSON.stringify(data));

    return json({ ok: true });
  }

  return json({ ok: false });
}
