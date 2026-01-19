addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

const WALLET_ADDRESS = "UQAFXBXzBzau6ZCWzruiVrlTg3HAc8MF6gKIntqTLDifuWOi";

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
  const amount = body.amount;

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

  const payRaw = await PAYMENTS_KV.get(id);
  if (!payRaw) return json({ error: "not found" });

  const data = JSON.parse(payRaw);

  if (data.status === "done") {
    const bal = await BALANCE_KV.get(data.user_id);
    return json({ ok: true, balance: parseFloat(bal || 0) });
  }

  // Проверка транзакции на твоём адресе через Toncenter
  const res = await fetch(
    `https://toncenter.com/api/v2/getTransactions?address=${WALLET_ADDRESS}&limit=10`,
    { headers: { "X-API-Key": TONCENTER_KEY } }
  );

  const r = await res.json();
  if (!r.ok) return json({ error: "toncenter error" });

  const txs = r.result.transactions || [];

  // Ищем транзакцию с amount и memo = payment_id
  const found = txs.find(tx => {
    return tx.in_msg && tx.in_msg.value === amount.toString() &&
           tx.in_msg.message && tx.in_msg.message.includes(id);
  });

  if (found) {
    const bal = parseFloat(await BALANCE_KV.get(data.user_id) || 0);
    const newBal = bal + amount;

    await BALANCE_KV.put(data.user_id, String(newBal));

    data.status = "done";
    await PAYMENTS_KV.put(id, JSON.stringify(data));

    return json({ ok: true, balance: newBal });
  }

  return json({ ok: false });
    }
