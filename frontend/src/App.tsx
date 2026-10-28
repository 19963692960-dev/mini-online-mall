import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Product = { id: number; name: string; description: string; price: number; stock: number; category: string; images?: unknown };
type CartItem = { cart_item_id: number; product_id: number; name: string; description: string; price: number; stock: number; quantity: number; category: string };
type Address = { id: number; name: string; phone: string; province: string; city: string; district: string; detail: string; is_default: boolean };
type Order = { id: number; order_no: string; total_price: number; status: string; created_at: string; address_snapshot: Address; items: { product_name: string; quantity: number; price: number }[] };
type Tab = "商城" | "购物车" | "我的订单" | "收货地址";
const money = (n: number) => `¥${Number(n).toFixed(2)}`;
const art: Record<string, string> = { "数码配件": "⌘", "居家生活": "✺", "生活方式": "◒", "其他": "✦" };

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败");
  return result as T;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("商城");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState<number[]>([]);
  const [checkoutAddress, setCheckoutAddress] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [addressForm, setAddressForm] = useState({ name: "", phone: "", province: "", city: "", district: "", detail: "", is_default: false });
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshProducts = useCallback(async () => {
    const result = await api<{ data: Product[] }>(`/api/products?category=${encodeURIComponent(category)}&keyword=${encodeURIComponent(keyword)}`);
    setProducts(result.data);
  }, [category, keyword]);
  const refreshCart = useCallback(async () => {
    const result = await api<{ data: CartItem[] }>("/api/cart");
    setCart(result.data);
    setSelected(old => old.filter(id => result.data.some(item => item.cart_item_id === id)));
  }, []);
  const refreshAddresses = useCallback(async () => {
    const result = await api<{ data: Address[] }>("/api/addresses");
    setAddresses(result.data);
    setCheckoutAddress(old => result.data.some(a => String(a.id) === old) ? old : String(result.data.find(a => a.is_default)?.id || result.data[0]?.id || ""));
  }, []);
  const refreshOrders = useCallback(async () => {
    const result = await api<{ data: Order[] }>("/api/orders");
    setOrders(result.data);
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([refreshProducts(), refreshCart(), refreshAddresses(), refreshOrders()]);
  }, [refreshProducts, refreshCart, refreshAddresses, refreshOrders]);

  useEffect(() => {
    reload().catch(e => setError(`${e.message}。请检查 MySQL 是否已启动、数据库是否初始化，以及后端 API 是否运行。`));
  }, [reload]);

  const message = (text: string) => { setNotice(text); setError(""); window.setTimeout(() => setNotice(""), 3500); };
  const fail = (e: unknown) => { setError(e instanceof Error ? e.message : "操作失败"); setNotice(""); };

  async function addToCart(product: Product) {
    try {
      const result = await api<{ message: string }>("/api/cart", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity: 1 }) });
      await refreshCart(); message(result.message);
    } catch (e) { fail(e); }
  }
  async function changeQuantity(item: CartItem, quantity: number) {
    try {
      await api(`/api/cart/${item.cart_item_id}`, { method: "PUT", body: JSON.stringify({ quantity }) });
      await refreshCart();
    } catch (e) { fail(e); }
  }
  async function removeCart(item: CartItem) {
    try {
      await api(`/api/cart/${item.cart_item_id}`, { method: "DELETE" });
      await refreshCart(); message("商品已从购物车移除");
    } catch (e) { fail(e); }
  }
  async function saveAddress(event: FormEvent) {
    event.preventDefault();
    try {
      if (editingAddressId) {
        await api(`/api/addresses/${editingAddressId}`, { method: "PUT", body: JSON.stringify(addressForm) });
        message("地址已更新");
      } else {
        await api("/api/addresses", { method: "POST", body: JSON.stringify(addressForm) });
        message("收货地址已保存");
      }
      setAddressForm({ name: "", phone: "", province: "", city: "", district: "", detail: "", is_default: false });
      setEditingAddressId(null);
      await refreshAddresses();
    } catch (e) { fail(e); }
  }
  function editAddress(address: Address) {
    setEditingAddressId(address.id);
    setAddressForm({ name: address.name, phone: address.phone, province: address.province, city: address.city, district: address.district, detail: address.detail, is_default: Boolean(address.is_default) });
    setTab("收货地址");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function deleteAddress(address: Address) {
    if (!window.confirm("确定删除这条收货地址吗？")) return;
    try { await api(`/api/addresses/${address.id}`, { method: "DELETE" }); await refreshAddresses(); message("地址已删除"); }
    catch (e) { fail(e); }
  }
  async function createOrder() {
    if (!checkoutAddress) { setTab("收货地址"); fail(new Error("请先添加收货地址")); return; }
    if (!selected.length) { fail(new Error("请先勾选需要结算的购物车商品")); return; }
    setBusy(true);
    try {
      const result = await api<{ message: string; order_no: string }>("/api/orders", {
        method: "POST", body: JSON.stringify({ address_id: Number(checkoutAddress), cart_item_ids: selected })
      });
      setSelected([]); await Promise.all([refreshCart(), refreshProducts(), refreshOrders()]);
      setTab("我的订单"); message(`${result.message} 订单号：${result.order_no}`);
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function cancelOrder(order: Order) {
    if (!window.confirm("确认取消此待支付订单？取消后会恢复库存。")) return;
    try {
      const result = await api<{ message: string }>(`/api/orders/${order.id}/cancel`, { method: "PUT" });
      await Promise.all([refreshOrders(), refreshProducts()]); message(result.message);
    } catch (e) { fail(e); }
  }

  const total = useMemo(() => cart.filter(item => selected.includes(item.cart_item_id)).reduce((sum, item) => sum + item.price * item.quantity, 0), [cart, selected]);
  const categories = useMemo(() => ["全部", ...Array.from(new Set(products.map(p => p.category)))], [products]);

  return <div className="app-shell">
    <div className="announcement">拾光集 · 把日常好物，认真挑给你 <span>MINI ONLINE MALL / FULL-STACK DEMO</span></div>
    <header className="header">
      <a className="logo" href="#" onClick={e => { e.preventDefault(); setTab("商城"); }}>拾光<span>集.</span></a>
      <nav>{(["商城", "购物车", "我的订单", "收货地址"] as Tab[]).map((item, i) =>
        <button key={item} className={`nav-button ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>
          {item}{item === "购物车" && cart.length > 0 ? <b className="count">{cart.length}</b> : null}
        </button>)}</nav>
      <div className="demo-user"><span className="user-dot" /> 演示用户</div>
    </header>

    <main>
      {(notice || error) && <div className={`toast ${error ? "error" : "success"}`} role="status">{error || notice}<button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
      {tab === "商城" && <>
        <section className="hero">
          <div className="hero-text"><p className="eyebrow">CURATED DAILY GOODS</p><h1>好物有光，<br/><em>生活有序。</em></h1><p>从桌面到日常，精选简单实用的小物。发现喜欢的商品，加入购物车，开启一次完整的在线购物体验。</p><button className="button dark" onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}>探索精选 <span>↘</span></button></div>
          <div className="hero-visual"><div className="sun"></div><div className="hero-shape shape-a">✳</div><div className="hero-shape shape-b">◒</div><div className="hero-note"><small>THIS WEEK</small><strong>Daily<br/>Essentials</strong><span>精选日常好物</span></div><div className="hero-index">01 — 06</div></div>
        </section>
        <section className="catalog" id="catalog">
          <div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2>逛逛精选</h2></div><p>从一件小物开始，<br/>给日常增添一点灵感。</p></div>
          <div className="catalog-tools"><div className="categories">{categories.map(c => <button key={c} className={c === category ? "selected" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索商品名称或描述…" aria-label="搜索商品"/></div>
          <div className="product-grid">{products.map((p, i) => <article className="product-card" key={p.id}>
            <div className={`product-art art-${i % 6}`}><span className="art-icon">{art[p.category] || "✦"}</span><span className="art-number">0{(i % 6) + 1}</span><span className="stock">{p.stock > 0 ? `库存 ${p.stock}` : "暂时售罄"}</span></div>
            <div className="product-info"><p className="product-category">{p.category}</p><h3>{p.name}</h3><p className="description">{p.description}</p><div className="product-bottom"><strong>{money(p.price)}</strong><button disabled={p.stock < 1} onClick={() => addToCart(p)} aria-label={`将${p.name}加入购物车`}>＋ 加入购物车</button></div></div>
          </article>)}</div>
          {products.length === 0 && <div className="empty">没有找到符合条件的商品，试试其他关键词。</div>}
        </section>
      </>}

      {tab === "购物车" && <section className="page-section"><div className="section-heading"><div><p className="eyebrow">YOUR SELECTION</p><h2>购物车</h2></div><p>选择需要结算的商品<br/>数量和库存以服务端为准。</p></div>
        {cart.length === 0 ? <div className="empty-panel"><span>＋</span><h3>购物车还是空的</h3><p>去商城挑选几件喜欢的商品吧。</p><button className="button dark" onClick={() => setTab("商城")}>去逛商城</button></div> :
        <><div className="cart-list">{cart.map(item => <div className="cart-row" key={item.cart_item_id}>
          <input className="check" type="checkbox" checked={selected.includes(item.cart_item_id)} onChange={e => setSelected(old => e.target.checked ? [...old, item.cart_item_id] : old.filter(id => id !== item.cart_item_id))} aria-label={`选择${item.name}`}/>
          <div className="mini-art">{art[item.category] || "✦"}</div><div className="cart-description"><strong>{item.name}</strong><small>{item.category} · 库存 {item.stock}</small></div>
          <strong className="line-price">{money(item.price)}</strong><div className="quantity"><button onClick={() => changeQuantity(item, Math.max(1, item.quantity - 1))} disabled={item.quantity <= 1}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item, item.quantity + 1)} disabled={item.quantity >= item.stock}>＋</button></div>
          <button className="text-button" onClick={() => removeCart(item)}>删除</button>
        </div>)}</div>
        <div className="checkout-box"><div className="address-choice"><label htmlFor="checkout-address">配送地址</label><select id="checkout-address" value={checkoutAddress} onChange={e => setCheckoutAddress(e.target.value)}><option value="">请选择收货地址</option>{addresses.map(a => <option key={a.id} value={a.id}>{a.name} · {a.phone} · {a.province}{a.city}{a.district}{a.detail}</option>)}</select><button className="text-button" onClick={() => setTab("收货地址")}>管理地址 ↗</button></div><div className="checkout-total"><div><span>已选商品金额</span><strong>{money(total)}</strong></div><button className="button dark" onClick={createOrder} disabled={busy}>{busy ? "正在创建…" : "提交订单（待支付） →"}</button><small>教学示例不接入真实支付。</small></div></div></>}
      </section>}

      {tab === "收货地址" && <section className="page-section"><div className="section-heading"><div><p className="eyebrow">DELIVERY DETAILS</p><h2>收货地址</h2></div><p>订单创建时将保存地址快照，<br/>方便保留下单时的信息。</p></div><div className="address-layout">
        <div className="address-list">{addresses.length === 0 && <div className="empty">还没有地址，请先添加一条收货地址。</div>}{addresses.map(a => <article className="address-card" key={a.id}><div className="address-card-head"><strong>{a.name}</strong><span>{a.phone}</span>{a.is_default ? <b className="default-badge">默认地址</b> : null}</div><p>{a.province} {a.city} {a.district} {a.detail}</p><div className="address-actions"><button className="text-button" onClick={() => editAddress(a)}>编辑</button><button className="text-button danger-text" onClick={() => deleteAddress(a)}>删除</button></div></article>)}</div>
        <form className="address-form" onSubmit={saveAddress}><p className="eyebrow">{editingAddressId ? "EDIT ADDRESS" : "NEW ADDRESS"}</p><h3>{editingAddressId ? "编辑地址" : "添加新地址"}</h3>
          {([{ key:"name", label:"收货人", placeholder:"请输入收货人姓名" },{ key:"phone", label:"联系电话", placeholder:"请输入联系电话" },{ key:"province", label:"省份", placeholder:"例如：广东省" },{ key:"city", label:"城市", placeholder:"例如：深圳市" },{ key:"district", label:"区/县", placeholder:"例如：南山区" },{ key:"detail", label:"详细地址", placeholder:"街道、楼栋、门牌号" }] as const).map(field => <label className="field" key={field.key}>{field.label}<input required value={addressForm[field.key]} placeholder={field.placeholder} onChange={e => setAddressForm(old => ({ ...old, [field.key]: e.target.value }))}/></label>)}
          <label className="default-check"><input type="checkbox" checked={addressForm.is_default} onChange={e => setAddressForm(old => ({ ...old, is_default: e.target.checked }))}/>设为默认地址</label>
          <div className="form-actions"><button className="button dark" type="submit">{editingAddressId ? "保存修改" : "保存地址"}</button>{editingAddressId && <button className="button light" type="button" onClick={() => { setEditingAddressId(null); setAddressForm({ name:"", phone:"", province:"", city:"", district:"", detail:"", is_default:false }); }}>取消</button>}</div>
        </form>
      </div></section>}

      {tab === "我的订单" && <section className="page-section"><div className="section-heading"><div><p className="eyebrow">ORDER HISTORY</p><h2>我的订单</h2></div><p>订单创建后状态为待支付。<br/>本示例不实现支付功能。</p></div>
        {orders.length === 0 ? <div className="empty-panel"><span>↗</span><h3>还没有订单</h3><p>把喜欢的商品加入购物车，完成一次下单体验。</p><button className="button dark" onClick={() => setTab("商城")}>去逛商城</button></div> :
        <div className="orders">{orders.map(order => <article className="order-card" key={order.id}><div className="order-head"><div><small>订单编号</small><strong>{order.order_no}</strong><small>{new Date(order.created_at).toLocaleString()}</small></div><span className={`status status-${order.status === "待支付" ? "pending" : order.status === "已取消" ? "cancelled" : "done"}`}>{order.status}</span></div>
          <div className="order-items">{order.items.map((item, i) => <div key={`${order.id}-${i}`}><span>{item.product_name} × {item.quantity}</span><strong>{money(item.price * item.quantity)}</strong></div>)}</div>
          <div className="order-address"><span>收货信息</span><p>{order.address_snapshot?.name} · {order.address_snapshot?.phone} · {order.address_snapshot?.province} {order.address_snapshot?.city} {order.address_snapshot?.district} {order.address_snapshot?.detail}</p></div>
          <div className="order-foot"><span>订单金额</span><strong>{money(order.total_price)}</strong>{order.status === "待支付" && <button className="text-button danger-text" onClick={() => cancelOrder(order)}>取消订单</button>}</div>
        </article>)}</div>}
      </section>}
    </main>
    <footer><a className="logo" href="#" onClick={e => { e.preventDefault(); setTab("商城"); }}>拾光<span>集.</span></a><span>Mini 电商全栈示例 · React / Express / MySQL</span><span>DEMO ONLY · NO PAYMENT</span></footer>
  </div>;
}
