require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const DEMO_USER_ID = 1; // 教学版固定演示用户；正式项目应实现登录认证和权限校验。

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "mall_user",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "mini_mall",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const badRequest = (res, message, status = 400) => res.status(status).json({ error: message });

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true, service: "mini-online-mall-api", database: "connected" });
}));

app.get("/api/products", asyncRoute(async (req, res) => {
  const { category, keyword } = req.query;
  let sql = "SELECT id, name, description, price, stock, images, category FROM products WHERE 1=1";
  const params = [];
  if (category && category !== "全部") { sql += " AND category = ?"; params.push(String(category)); }
  if (keyword) { sql += " AND (name LIKE ? OR description LIKE ?)"; params.push(`%${keyword}%`, `%${keyword}%`); }
  sql += " ORDER BY id DESC";
  const [rows] = await pool.query(sql, params);
  res.json({ data: rows });
}));

app.get("/api/products/:id", asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, description, price, stock, images, category FROM products WHERE id = ?",
    [req.params.id]
  );
  if (!rows.length) return badRequest(res, "商品不存在。", 404);
  res.json({ data: rows[0] });
}));

app.get("/api/cart", asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT ci.id AS cart_item_id, ci.quantity, p.id AS product_id, p.name, p.description,
            p.price, p.stock, p.category, p.images
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = ? ORDER BY ci.id DESC`,
    [DEMO_USER_ID]
  );
  const total = rows.reduce((sum, row) => sum + row.price * row.quantity, 0);
  res.json({ data: rows, total: Number(total.toFixed(2)) });
}));

app.post("/api/cart", asyncRoute(async (req, res) => {
  const productId = Number(req.body.product_id);
  const quantity = Number(req.body.quantity ?? 1);
  if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1)
    return badRequest(res, "商品或数量不合法。");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[product]] = await conn.query("SELECT id, stock FROM products WHERE id = ? FOR UPDATE", [productId]);
    if (!product) { await conn.rollback(); return badRequest(res, "商品不存在。", 404); }
    const [[existing]] = await conn.query("SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? FOR UPDATE", [DEMO_USER_ID, productId]);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    if (nextQuantity > product.stock) { await conn.rollback(); return badRequest(res, "加入失败，商品库存不足。"); }
    if (existing) {
      await conn.query("UPDATE cart_items SET quantity = ? WHERE id = ?", [nextQuantity, existing.id]);
    } else {
      await conn.query("INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)", [DEMO_USER_ID, productId, quantity]);
    }
    await conn.commit();
    res.status(201).json({ ok: true, message: "已加入购物车。" });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.put("/api/cart/:id", asyncRoute(async (req, res) => {
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return badRequest(res, "数量必须是大于 0 的整数。");
  const [rows] = await pool.query(
    `SELECT ci.id, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.id = ? AND ci.user_id = ?`,
    [req.params.id, DEMO_USER_ID]
  );
  if (!rows.length) return badRequest(res, "购物车商品不存在。", 404);
  if (quantity > rows[0].stock) return badRequest(res, "数量超过当前库存。");
  await pool.query("UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?", [quantity, req.params.id, DEMO_USER_ID]);
  res.json({ ok: true, message: "购物车数量已更新。" });
}));

app.delete("/api/cart/:id", asyncRoute(async (req, res) => {
  const [result] = await pool.query("DELETE FROM cart_items WHERE id = ? AND user_id = ?", [req.params.id, DEMO_USER_ID]);
  if (!result.affectedRows) return badRequest(res, "购物车商品不存在。", 404);
  res.json({ ok: true, message: "已从购物车移除。" });
}));

app.get("/api/addresses", asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, phone, province, city, district, detail, is_default
     FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC`,
    [DEMO_USER_ID]
  );
  res.json({ data: rows });
}));

app.post("/api/addresses", asyncRoute(async (req, res) => {
  const fields = ["name", "phone", "province", "city", "district", "detail"];
  const values = fields.map((field) => typeof req.body[field] === "string" ? req.body[field].trim() : "");
  if (values.some((v) => !v)) return badRequest(res, "请完整填写收货人、电话和地址。");
  if (values.some((v) => v.length > 255)) return badRequest(res, "地址字段过长。");
  const isDefault = Boolean(req.body.is_default);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (isDefault) await conn.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [DEMO_USER_ID]);
    const [result] = await conn.query(
      `INSERT INTO addresses (user_id, name, phone, province, city, district, detail, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [DEMO_USER_ID, ...values, isDefault]
    );
    await conn.commit();
    res.status(201).json({ ok: true, id: result.insertId, message: "收货地址已保存。" });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.put("/api/addresses/:id", asyncRoute(async (req, res) => {
  const fields = ["name", "phone", "province", "city", "district", "detail"];
  const values = fields.map((field) => typeof req.body[field] === "string" ? req.body[field].trim() : "");
  if (values.some((v) => !v)) return badRequest(res, "请完整填写收货人、电话和地址。");
  const [existing] = await pool.query("SELECT id FROM addresses WHERE id = ? AND user_id = ?", [req.params.id, DEMO_USER_ID]);
  if (!existing.length) return badRequest(res, "地址不存在。", 404);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (req.body.is_default) await conn.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [DEMO_USER_ID]);
    await conn.query(
      `UPDATE addresses SET name=?, phone=?, province=?, city=?, district=?, detail=?, is_default=?
       WHERE id=? AND user_id=?`,
      [...values, Boolean(req.body.is_default), req.params.id, DEMO_USER_ID]
    );
    await conn.commit();
    res.json({ ok: true, message: "收货地址已更新。" });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.delete("/api/addresses/:id", asyncRoute(async (req, res) => {
  const [result] = await pool.query("DELETE FROM addresses WHERE id = ? AND user_id = ?", [req.params.id, DEMO_USER_ID]);
  if (!result.affectedRows) return badRequest(res, "地址不存在。", 404);
  res.json({ ok: true, message: "地址已删除。" });
}));

app.get("/api/orders", asyncRoute(async (_req, res) => {
  const [orders] = await pool.query(
    `SELECT id, order_no, address_snapshot, total_price, status, created_at
     FROM orders WHERE user_id = ? ORDER BY id DESC`,
    [DEMO_USER_ID]
  );
  for (const order of orders) {
    if (typeof order.address_snapshot === "string") order.address_snapshot = JSON.parse(order.address_snapshot);
    const [items] = await pool.query(
      "SELECT product_name, quantity, price FROM order_items WHERE order_id = ? ORDER BY id",
      [order.id]
    );
    order.items = items;
  }
  res.json({ data: orders });
}));

app.post("/api/orders", asyncRoute(async (req, res) => {
  const addressId = Number(req.body.address_id);
  const cartItemIds = Array.isArray(req.body.cart_item_ids)
    ? [...new Set(req.body.cart_item_ids.map(Number).filter(Number.isInteger))] : [];
  if (!Number.isInteger(addressId) || addressId < 1) return badRequest(res, "请选择收货地址。");
  if (!cartItemIds.length) return badRequest(res, "请先选择要结算的购物车商品。");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [addressRows] = await conn.query(
      "SELECT id, name, phone, province, city, district, detail FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE",
      [addressId, DEMO_USER_ID]
    );
    if (!addressRows.length) { await conn.rollback(); return badRequest(res, "收货地址不存在。", 404); }
    const placeholders = cartItemIds.map(() => "?").join(",");
    const [items] = await conn.query(
      `SELECT ci.id AS cart_item_id, ci.quantity, p.id AS product_id, p.name, p.price, p.stock
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ? AND ci.id IN (${placeholders}) FOR UPDATE`,
      [DEMO_USER_ID, ...cartItemIds]
    );
    if (items.length !== cartItemIds.length) { await conn.rollback(); return badRequest(res, "部分购物车商品不存在，请刷新后重试。"); }
    for (const item of items) {
      if (item.quantity > item.stock) { await conn.rollback(); return badRequest(res, `商品“${item.name}”库存不足。`); }
    }

    const total = Number(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0).toFixed(2));
    const orderNo = `MM${Date.now()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const addressSnapshot = addressRows[0];
    const [orderResult] = await conn.query(
      "INSERT INTO orders (order_no, user_id, address_id, address_snapshot, total_price, status) VALUES (?, ?, ?, ?, ?, '待支付')",
      [orderNo, DEMO_USER_ID, addressId, JSON.stringify(addressSnapshot), total]
    );
    for (const item of items) {
      await conn.query(
        "INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)",
        [orderResult.insertId, item.product_id, item.name, item.quantity, item.price]
      );
      await conn.query("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?", [item.quantity, item.product_id, item.quantity]);
    }
    await conn.query(`DELETE FROM cart_items WHERE user_id = ? AND id IN (${placeholders})`, [DEMO_USER_ID, ...cartItemIds]);
    await conn.commit();
    res.status(201).json({ ok: true, order_id: orderResult.insertId, order_no: orderNo, message: "订单创建成功（待支付）。本示例不接入支付。" });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.put("/api/orders/:id/cancel", asyncRoute(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query(
      "SELECT id, status FROM orders WHERE id = ? AND user_id = ? FOR UPDATE",
      [req.params.id, DEMO_USER_ID]
    );
    if (!orders.length) { await conn.rollback(); return badRequest(res, "订单不存在。", 404); }
    if (orders[0].status !== "待支付") { await conn.rollback(); return badRequest(res, "只有待支付订单可以取消。"); }
    const [items] = await conn.query("SELECT product_id, quantity FROM order_items WHERE order_id = ?", [req.params.id]);
    for (const item of items) {
      if (item.product_id) await conn.query("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.product_id]);
    }
    await conn.query("UPDATE orders SET status = '已取消' WHERE id = ?", [req.params.id]);
    await conn.commit();
    res.json({ ok: true, message: "订单已取消，库存已恢复。" });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "服务器处理失败，请查看后端终端日志。" });
});

app.listen(PORT, () => {
  console.log(`Mini 商城 API 已启动：http://localhost:${PORT}`);
});
