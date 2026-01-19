addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method === "GET" && path === "/balance") return getBalance(url);
  if (request.method === "GET" && path === "/inventory") return getInventory(url);
  if (request.method === "GET" && path === "/daily") return getDaily(url);

  if (request.method === "POST" && path === "/open-daily") return openDaily(request);

  if (request.method === "POST" && path === "/add-ton") return addTon(request);
  if (request.method === "POST" && path === "/add-nft") return addNft(request);
  if (request.method === "POST" && path === "/sell-nft") return sellNft(request);

  if (request.method === "POST" && path === "/create-payment") return createPayment(request);
  if (request.method === "POST" && path === "/check-payment") return checkPayment(request);

  return new Response("Not found", { status: 404, headers: CORS_HEADERS });
}

// ----------------- BALANCE -----------------
async function getBalance(url) {
  const user_id = url.searchParams.get("user_id");
  const bal = await BALANCE_KV.get("balance_" + user_id) || "0";
  return json({ balance: parseFloat(bal) });
}

// ----------------- INVENTORY -----------------
async function getInventory(url) {
  const user_id = url.searchParams.get("user_id");
  const inv = await INVENTORY_KV.get("inv_" + user_id);
  return json({ inventory: inv ? JSON.parse(inv) : [] });
}

// ----------------- DAILY -----------------
async function getDaily(url) {
  const user_id = url.searchParams.get("user_id");
  const last = await DAILY_KV.get("daily_" + user_id);
  return json({ last: last || null });
}

async function openDaily(request) {
  const body = await request.json();
  const user_id = body.user_id;

  const last = await DAILY_KV.get("daily_" + user_id);
  const now = Date.now();

  if (last && now - parseInt(last) < 24 * 60 * 60 * 1000) {
    return json({ error: "Вы уже открывали кейс сегодня" }, 400);
  }

  await DAILY_KV.put("daily_" + user_id, String(now));

  const rnd = Math.random() * 100;
  let prize;

  if (rnd < 90) prize = { type: "ton", value: 0.01 };
  else if (rnd < 95) prize = { type: "ton", value: 0.02 };
  else if (rnd < 97.5) prize = { type: "ton", value: 0.03 };
  else if (rnd < 98.5) prize = { type: "ton", value: 0.04 };
  else if (rnd < 99.25) prize = { type: "ton", value: 0.05 };
  else if (rnd < 99.75) prize = { type: "ton", value: 0.06 };
  else if (rnd < 99.99) prize = { type: "nft", name: "NFT lol pop", price: 3.26 };
  else prize = { type: "nft", name: "NFT rare", price: 10 };

  return json({ prize });
}

// ----------------- ADD TON -----------------
async function addTon(request) {
  const body = await request.json();
  const user_id = body.user_id;
  const amount = parseFloat(body.amount);

  const bal = parseFloat(await BALANCE_KV.get("balance_" + user_id) || 0);
  const newBal = bal + amount;

  await BALANCE_KV.put("balance_" + user_id, String(newBal));
  return json({ balance: newBal });
}

// ----------------- ADD NFT -----------------
async function addNft(request) {
  const body = await request.json();
  const user_id = body.user_id;
  const nft = body.nft;

  const inv = await INVENTORY_KV.get("inv_" + user_id);
  const arr = inv ? JSON.parse(inv) : [];
  arr.push(nft);

  await INVENTORY_KV.put("inv_" + user_id, JSON.stringify(arr));
  return json({ inventory: arr });
}

// ----------------- SELL NFT -----------------
async function sellNft(request) {
  const body = await request.json();
  const user_id = body.user_id;
  const nft_name = body.nft_name;
  const price = parseFloat(body.price);

  const inv = await INVENTORY_KV.get("inv_" + user_id);
  const arr = inv ? JSON.parse(inv) : [];

  const idx = arr.findIndex(x => x.name === nft_name);
  if (idx === -1) return json({ error: "NFT не найден" }, 404);

  arr.splice(idx, 1);
  await INVENTORY_KV.put("inv_" + user_id, JSON.stringify(arr));

  const bal = parseFloat(await BALANCE_KV.get("balance_" + user_id) || 0);
  const newBal = bal + price;
  await BALANCE_KV.put("balance_" + user_id, String(newBal));

  return json({ inventory: arr, balance: newBal });
}

// ----------------- TON PAYMENT -----------------
async function createPayment(request) {
  const body = await request.json();
  const user_id = body.user_id;
  const amount = parseFloat(body.amount);

  if (!amount || amount < 0.1) {
    return json({ error: "Минимум 0.1 TON" }, 400);
  }

  const id = "pay_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);

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
  const txId = body.tx_id;

  const pay = await PAYMENTS_KV.get(id);
  if (!pay) return json({ error: "Платёж не найден" }, 404);

  const data = JSON.parse(pay);

  if (data.status === "done") {
    const bal = parseFloat(await BALANCE_KV.get("balance_" + data.user_id) || 0);
    return json({ ok: true, balance: bal });
  }

  // Проверка транзакции через Toncenter
  const res = await fetch(
    `https://toncenter.com/api/v2/getTransactions?address=UQAFXBXzBzau6ZCWzruiVrlTg3HAc8MF6gKIntqTLDifuWOi&hash=${txId}`,
    { headers: { "X-API-Key": TONCENTER_KEY } }
  );

  const r = await res.json();
  if (!r.ok) return json({ error: "toncenter error" }, 400);

  if (r.result && r.result.length > 0) {
    const bal = parseFloat(await BALANCE_KV.get("balance_" + data.user_id) || 0);
    const newBal = bal + parseFloat(data.amount);

    await BALANCE_KV.put("balance_" + data.user_id, String(newBal));

    data.status = "done";
    await PAYMENTS_KV.put(id, JSON.stringify(data));

    return json({ ok: true, balance: newBal });
  }

  return json({ ok: false });
    }
