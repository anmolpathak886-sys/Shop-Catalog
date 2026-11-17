import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";
const empty = { name: "", slug: "", description: "", price: "", image_url: "", category_slug: "" };

export default function AdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token") || "");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [form, setForm] = useState(empty);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [message, setMessage] = useState("");

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function loadData() {
    const [p, c] = await Promise.all([fetch(`${API}/products`), fetch(`${API}/categories`)]);
    setProducts(await p.json());
    setCategories(await c.json());
  }

  useEffect(() => { loadData(); }, []);

  async function handleLogin(e) {
    e.preventDefault();
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(login),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error);
    if (data.user.role !== "admin") return setMessage("This account is not an admin");
    localStorage.setItem("admin_token", data.token);
    setToken(data.token);
    setMessage("");
  }

  async function handleLogout() {
    await fetch(`${API}/auth/logout`, { method: "POST", headers: authHeaders });
    localStorage.removeItem("admin_token");
    setToken("");
  }

  async function handleAdd(e) {
    e.preventDefault();
    const body = {
      name: form.name,
      slug: form.slug,
      description: form.description,
      price_in_cents: Math.round(Number(form.price)),
      image_url: form.image_url,
      category_slug: form.category_slug,
    };
    const res = await fetch(`${API}/products`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("admin_token");
      setToken("");
      return setMessage("Please log in as admin again");
    }
    const data = await res.json();
    if (!res.ok) return setMessage(data.error);
    setMessage(`Added "${data.name}"`);
    setForm(empty);
    loadData();
  }

  async function handleDelete(slug) {
    if (!confirm("Delete this product?")) return;
    const res = await fetch(`${API}/products/${slug}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) loadData();
    else setMessage((await res.json()).error);
  }

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  if (!token) {
    return (
      <form onSubmit={handleLogin} style={{ maxWidth: 360, margin: "2rem auto", display: "grid", gap: 8 }}>
        <h2>Admin login</h2>
        <input type="email" placeholder="Email" value={login.email}
          onChange={(e) => setLogin({ ...login, email: e.target.value })} required />
        <input type="password" placeholder="Password" value={login.password}
          onChange={(e) => setLogin({ ...login, password: e.target.value })} required />
        <button type="submit">Log in</button>
        {message && <p>{message}</p>}
      </form>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "2rem auto" }}>
      <button onClick={handleLogout}>Log out</button>
      <h2>Add product</h2>
      <form onSubmit={handleAdd} style={{ display: "grid", gap: 8 }}>
        <input placeholder="Name" value={form.name} onChange={set("name")} required />
        <input placeholder="Slug (e.g. cotton-hoodie)" value={form.slug} onChange={set("slug")} required />
        <textarea placeholder="Description" value={form.description} onChange={set("description")} required />
        <input type="number" min="0" placeholder="Price (stored value, e.g. 2800)" value={form.price}
          onChange={set("price")} required />
        <input type="url" placeholder="Image URL (https://...)" value={form.image_url}
          onChange={set("image_url")} required />
        <select value={form.category_slug} onChange={set("category_slug")} required>
          <option value="">Choose category</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
        <button type="submit">Add product</button>
      </form>
      {message && <p>{message}</p>}

      <h2>Products</h2>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} — ₹{(p.price_in_cents).toLocaleString("en-IN")}{" "}
            <button onClick={() => handleDelete(p.slug)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}