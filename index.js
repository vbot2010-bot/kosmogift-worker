addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

const TON_WALLET_ADDRESS = "UQAFXBXzBzau6ZCWzruiVrlTg3HAc8MF6gKIntqTLDifuWOi"; // <- вставь сюда адрес
const TONCENTER_KEY = TONCENTER_KEY;

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
  const user_wallet = body.user_wallet; // адрес кошелька пользователя
  const amount = parseFloat(body.amount);

  if (!user_wallet) return json({ error: "no wallet" });

  const id = "pay_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);

  await PAYMENTS_KV.put(id, JSON.stringify({
    user_id,
    user_wallet,
    amount,
    status: "pending"
  }));

  return json({ payment_id: id, pay_to: TON_WALLET_ADDRESS });
}

async function checkPayment(request) {
  const body = await request.json();
  const id = body.payment_id;

  const pay = await PAYMENTS_KV.get(id);
  if (!pay) return json({ error: "not found" });

  const data = JSON.parse(pay);

  // если статус уже "done"
  if (data.status === "done") {
    const bal = await BALANCE_KV.get(data.user_id) || "0";
    return json({ ok: true, status: "done", balance: bal });
  }

  // Проверка транзакции (через Toncenter)
  const res = await fetch(
    `https://toncenter.com/api/v2/getTransactions?address=${TON_WALLET_ADDRESS}&limit=50`,
    { headers: { "X-API-Key": TONCENTER_KEY } }
  );

  const r = await res.json();
  if (!r.ok) return json({ error: "toncenter error" });

  const txs = r.result?.transactions || [];

  // ищем перевод от пользователя на наш кошелёк
  const found = txs.find(t => {
    const inMsg = t.in_msg;
    if (!inMsg) return false;
    const from = inMsg.source;
    const value = parseFloat(inMsg.value) / 1e9;
    return from === data.user_wallet && value >= data.amount;
  });

  if (found) {
    const bal = parseFloat(await BALANCE_KV.get(data.user_id) || 0);
    const newBal = bal + parseFloat(data.amount);

    await BALANCE_KV.put(data.user_id, String(newBal));

    data.status = "done";
    await PAYMENTS_KV.put(id, JSON.stringify(data));

    return json({ ok: true, status: "done", balance: newBal });
  }

  return json({ ok: false });
    }
