    export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ====== BALANCE ======
    if (request.method === "GET" && path === "/balance") {
      const userId = url.searchParams.get("user_id");
      const balance = await env.BALANCE_KV.get("balance_" + userId);
      return new Response(JSON.stringify({ balance: parseFloat(balance || "0") }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ====== CREATE PAYMENT ======
    if (request.method === "POST" && path === "/create-payment") {
      const body = await request.json();
      const userId = body.user_id;
      const amount = parseFloat(body.amount);

      if (!amount || amount < 0.1) {
        return new Response(JSON.stringify({ error: "Минимум 0.1 TON" }), { status: 400 });
      }

      const paymentId = "payment_" + Date.now();

      await env.PAYMENTS_KV.put(paymentId, JSON.stringify({
        user_id: userId,
        amount,
        status: "pending",
        createdAt: Date.now()
      }));

      return new Response(JSON.stringify({ paymentId }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ====== CHECK PAYMENT ======
    if (request.method === "POST" && path === "/check-payment") {
      const body = await request.json();
      const paymentId = body.payment_id;
      const txId = body.tx_id;

      const payment = JSON.parse(await env.PAYMENTS_KV.get(paymentId) || "{}");

      if (!payment || payment.status !== "pending") {
        return new Response(JSON.stringify({ error: "Платёж не найден или уже подтверждён" }), { status: 400 });
      }

      // Проверка транзакции через TON API
      const tonRes = await fetch(
        `https://tonapi.io/v2/transactions/${txId}`,
        {
          headers: { "X-API-KEY": env.TONAPI_KEY }
        }
      );
      const tonData = await tonRes.json();

      // Если транзакция не найдена
      if (!tonData || !tonData.transaction) {
        return new Response(JSON.stringify({ error: "Транзакция не найдена" }), { status: 404 });
      }

      // Проверяем что перевод был на твой кошелёк и сумма совпадает
      const tx = tonData.transaction;
      const to = tx.to;
      const amount = parseFloat(tx.amount / 1e9);

      if (to !== "UQAFXBXzBzau6ZCWzruiVrlTg3HAc8MF6gKIntqTLDifuWOi") {
        return new Response(JSON.stringify({ error: "Платёж не на тот кошелёк" }), { status: 400 });
      }

      if (amount < payment.amount) {
        return new Response(JSON.stringify({ error: "Сумма меньше заявленной" }), { status: 400 });
      }

      // Увеличиваем баланс
      const userBalanceKey = "balance_" + payment.user_id;
      const current = parseFloat(await env.BALANCE_KV.get(userBalanceKey) || "0");
      const newBalance = current + payment.amount;

      await env.BALANCE_KV.put(userBalanceKey, newBalance.toString());

      // Меняем статус платежа
      payment.status = "paid";
      await env.PAYMENTS_KV.put(paymentId, JSON.stringify(payment));

      return new Response(JSON.stringify({ ok: true, balance: newBalance }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
