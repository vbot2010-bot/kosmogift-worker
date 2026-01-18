          export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // GET /balance
    if (request.method === "GET" && path === "/balance") {
      const userId = url.searchParams.get("user_id");
      const balance = await env.BALANCE_KV.get("balance_" + userId);
      return new Response(JSON.stringify({ balance: parseFloat(balance || "0") }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST /create-payment
    if (request.method === "POST" && path === "/create-payment") {
      const body = await request.json();
      const userId = body.user_id;
      const amount = parseFloat(body.amount);

      if (!amount || amount < 0.1) {
        return new Response(JSON.stringify({ error: "Минимум 0.1 TON" }), { status: 400 });
      }

      const paymentId = "payment_" + Date.now();

      const paymentData = {
        user_id: userId,
        amount,
        status: "pending",
        createdAt: Date.now()
      };

      await env.PAYMENTS_KV.put(paymentId, JSON.stringify(paymentData));

      return new Response(JSON.stringify({ paymentId }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST /check-payment
    if (request.method === "POST" && path === "/check-payment") {
      const body = await request.json();
      const paymentId = body.payment_id;
      const txId = body.tx_id;

      const paymentDataRaw = await env.PAYMENTS_KV.get(paymentId);
      if (!paymentDataRaw) {
        return new Response(JSON.stringify({ error: "Платёж не найден" }), { status: 404 });
      }

      const paymentData = JSON.parse(paymentDataRaw);

      // Проверяем через TONCENTER
      const toncenterKey = env.TONCENTER_KEY;

      const txRes = await fetch(
        `https://toncenter.com/api/v2/getTransactions?address=UQAFXBXzBzau6ZCWzruiVrlTg3HAc8MF6gKIntqTLDifuWOi&hash=${txId}`,
        {
          headers: { "X-API-Key": toncenterKey }
        }
      );

      const txJson = await txRes.json();

      if (!txJson.ok || !txJson.result || txJson.result.length === 0) {
        return new Response(JSON.stringify({ error: "Транзакция не найдена или ещё не подтверждена" }), { status: 400 });
      }

      const tx = txJson.result[0];
      const amountTon = parseFloat(tx.in_msg.value / 1e9);

      if (amountTon < paymentData.amount) {
        return new Response(JSON.stringify({ error: "Сумма транзакции меньше заявленной" }), { status: 400 });
      }

      const currentBalance = parseFloat(await env.BALANCE_KV.get("balance_" + paymentData.user_id) || "0");
      const newBalance = currentBalance + paymentData.amount;

      await env.BALANCE_KV.put("balance_" + paymentData.user_id, newBalance.toString());
      await env.PAYMENTS_KV.put(paymentId, JSON.stringify({ ...paymentData, status: "paid", txId }));

      return new Response(JSON.stringify({ balance: newBalance }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
