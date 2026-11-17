import { useEffect, useRef, useState } from "react";
import "./App.css";

const API = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const TOKEN_STORAGE_KEY = "shop-catalog-session";
const EMPTY_PRODUCT = {
  name: "",
  slug: "",
  description: "",
  price_in_cents: "",
  image_url: "",
  category_slug: "",
};

function formatPrice(rupees) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

async function apiRequest(path, { method = "GET", body, token, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Request failed");
  return data;
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [authMode, setAuthMode] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [accountType, setAccountType] = useState("user");
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const adminPanelRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/categories", { signal: controller.signal })
      .then(setCategories)
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setCatalogError("We couldn't load categories. Check the database connection.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    params.set("sort", sort);

    setLoadingProducts(true);
    apiRequest(`/products?${params.toString()}`, { signal: controller.signal })
      .then((items) => {
        setProducts(items);
        setCatalogError("");
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setProducts([]);
          setCatalogError("We couldn't load products from the database.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingProducts(false);
      });

    return () => controller.abort();
  }, [query, category, sort, retryCount]);

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      setSessionReady(true);
      return undefined;
    }

    let active = true;
    setSessionReady(false);
    apiRequest("/auth/me", { token })
      .then(({ user }) => {
        if (active) setCurrentUser(user);
      })
      .catch(() => {
        if (active) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken("");
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (active) setSessionReady(true);
      });

    return () => {
      active = false;
    };
  }, [token]);
     const canSell = currentUser && ["admin", "seller"].includes(currentUser.role);
  const canManage = (product) =>
    currentUser?.role === "admin" || (currentUser && product.created_by === currentUser.id);
  async function openProduct(slug) {
    setCatalogError("");
    try {
      setSelectedProduct(await apiRequest(`/products/${encodeURIComponent(slug)}`));
    } catch {
      setCatalogError("We couldn't load product details. Please try again.");
    }
  }

  function returnToCatalog() {
    setSelectedProduct(null);
    setCatalogError("");
  }

  function openAuth(mode) {
    setAuthMode(mode);
    setAuthError("");
    setAuthPassword("");
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await apiRequest(`/auth/${authMode}`, {
        method: "POST",
        body: {
        email: authEmail,
        password: authPassword,
       ...(authMode === "register" ? { account_type: accountType } : {}),
       },
      });
      localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
      setCurrentUser(result.user);
      setToken(result.token);
      setAuthMode("");
      setAuthPassword("");
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await apiRequest("/auth/logout", { method: "POST", token });
    } catch {
      // Clear the local session even if the API is temporarily unavailable.
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
    setCurrentUser(null);
    setAdminPanelOpen(false);
    setEditingProduct(null);
    setProductForm(EMPTY_PRODUCT);
  }

  function openAdminPanel(product = null) {
    setEditingProduct(product);
    setProductForm(
      product
        ? {
            name: product.name,
            slug: product.slug,
            description: product.description,
            price_in_cents: String(product.price_in_cents),
            image_url: product.image_url,
            category_slug: product.category_slug,
          }
        : { ...EMPTY_PRODUCT, category_slug: categories[0]?.slug || "" }
    );
    setAdminMessage("");
    setAdminError("");
    setAdminPanelOpen(true);
    window.setTimeout(() => adminPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function closeAdminPanel() {
    setAdminPanelOpen(false);
    setEditingProduct(null);
    setProductForm(EMPTY_PRODUCT);
    setAdminError("");
  }

  async function handleProductSubmit(event) {
    event.preventDefault();
    setAdminBusy(true);
    setAdminError("");
    setAdminMessage("");
    const isEditing = Boolean(editingProduct);
    const path = isEditing ? `/products/${encodeURIComponent(editingProduct.slug)}` : "/products";

    try {
      await apiRequest(path, {
        method: isEditing ? "PUT" : "POST",
        token,
        body: { ...productForm, price_in_cents: Number(productForm.price_in_cents) },
      });
      setAdminMessage(isEditing ? "Product updated." : "Product added to the catalog.");
      setEditingProduct(null);
      setProductForm({ ...EMPTY_PRODUCT, category_slug: categories[0]?.slug || "" });
      setRetryCount((count) => count + 1);
    } catch (requestError) {
      setAdminError(requestError.message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleProductDelete(product) {
    if (!window.confirm(`Delete “${product.name}” from the catalog?`)) return;
    setAdminError("");
    try {
      await apiRequest(`/products/${encodeURIComponent(product.slug)}`, { method: "DELETE", token });
      setProducts((items) => items.filter((item) => item.id !== product.id));
      if (selectedProduct?.id === product.id) setSelectedProduct(null);
      setAdminMessage("Product deleted.");
      setRetryCount((count) => count + 1);
    } catch (requestError) {
      setAdminError(requestError.message);
    }
  }

  function renderAccountActions() {
    if (!sessionReady) return <span className="account-loading">Checking account…</span>;
    if (!currentUser) {
      return (
        <div className="account-actions">
          <button className="text-button" onClick={() => openAuth("login")}>Log in</button>
          <button className="small-primary-button" onClick={() => openAuth("register")}>Create account</button>
        </div>
      );
    }

    return (
      <div className="account-actions">
        <span className={`role-badge role-${currentUser.role}`}>{currentUser.role}</span>
        {canSell && (
        <button className="text-button" onClick={() => openAdminPanel()}>Manage products</button>
       )}
        <button className="text-button" onClick={handleLogout}>Log out</button>
      </div>
    );
  }

  const adminPanel = canSell && adminPanelOpen && (
    <section className="admin-panel" ref={adminPanelRef} aria-labelledby="admin-heading">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2 id="admin-heading">{editingProduct ? "Edit product" : "Add a product"}</h2>
        </div>
        <button className="text-button" type="button" onClick={closeAdminPanel}>Close</button>
      </div>
      <form className="admin-product-form" onSubmit={handleProductSubmit}>
        <label>
          <span>Product name</span>
          <input required maxLength="200" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
        </label>
        <label>
          <span>URL slug</span>
          <input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={productForm.slug} onChange={(event) => setProductForm({ ...productForm, slug: event.target.value })} />
        </label>
        <label className="admin-wide-field">
          <span>Description</span>
          <textarea required maxLength="2000" rows="3" value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} />
        </label>
        <label>
          <span>Price (₹)</span>
          <input required type="number" min="0" step="1" value={productForm.price_in_cents} onChange={(event) => setProductForm({ ...productForm, price_in_cents: event.target.value })} />
        </label>
        <label>
          <span>Category</span>
          <select required value={productForm.category_slug} onChange={(event) => setProductForm({ ...productForm, category_slug: event.target.value })}>
            <option value="" disabled>Select a category</option>
            {categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label className="admin-wide-field">
          <span>Image URL (HTTPS)</span>
          <input required type="url" pattern="https://.*" value={productForm.image_url} onChange={(event) => setProductForm({ ...productForm, image_url: event.target.value })} />
        </label>
        {adminError && <p className="form-error admin-wide-field" role="alert">{adminError}</p>}
        {adminMessage && <p className="form-success admin-wide-field" role="status">{adminMessage}</p>}
        <div className="admin-form-actions admin-wide-field">
          <button className="primary-button" disabled={adminBusy} type="submit">
            {adminBusy ? "Saving…" : editingProduct ? "Save changes" : "Add product"}
          </button>
          {editingProduct && <button className="text-button" type="button" onClick={closeAdminPanel}>Cancel edit</button>}
        </div>
      </form>
    </section>
  );

  if (selectedProduct) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Main navigation">
          <button className="brand" onClick={returnToCatalog} aria-label="Shop Catalog home">
            <span className="brand-mark">S</span> shop catalog
          </button>
          <div className="topbar-right">
            <button className="text-button" onClick={returnToCatalog}>← All products</button>
            {renderAccountActions()}
          </div>
        </nav>
        <section className="detail-panel">
          <div className="detail-image-wrap">
            <img src={selectedProduct.image_url} alt={selectedProduct.name} />
          </div>
          <div className="detail-copy">
            <p className="category-label">{selectedProduct.category_name}</p>
            <h1>{selectedProduct.name}</h1>
            <p className="detail-price">{formatPrice(selectedProduct.price_in_cents)}</p>
            <p className="detail-description">{selectedProduct.description}</p>
            <div className="detail-actions">
              <button className="primary-button" onClick={returnToCatalog}>Continue browsing</button>
             {canManage(selectedProduct) && <button className="text-button" onClick={() => openAdminPanel(selectedProduct)}>Edit product</button>}
            </div>
          </div>
        </section>
        {adminPanel}
        {authMode && renderAuthDialog()}
      </main>
    );
  }

  function renderAuthDialog() {
    const registering = authMode === "register";
    return (
      <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthMode(""); }}>
        <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-heading">
          <button className="dialog-close" type="button" onClick={() => setAuthMode("")} aria-label="Close">×</button>
          <p className="eyebrow">SHOP CATALOG</p>
          <h2 id="auth-heading">{registering ? "Create your account" : "Welcome back"}</h2>
          <p className="auth-intro">{registering ? "Create a customer account to access the catalog." : "Sign in to your account."}</p>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              <span>Email</span>
              <input type="email" autoComplete="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
            </label>
            <label>
              <span>Password</span>
              <input type="password" autoComplete={registering ? "new-password" : "current-password"} minLength="8" required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} />
            </label>
                        {registering && (
              <label>
                <span>Account type</span>
                <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
                  <option value="user">Customer (browse only)</option>
                  <option value="seller">Seller (list my own products)</option>
                </select>
              </label>
            )}
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <button className="primary-button" type="submit" disabled={authBusy}>
              {authBusy ? "Please wait…" : registering ? "Create account" : "Log in"}
            </button>
          </form>
          <p className="auth-switch">
            {registering ? "Already have an account?" : "New to Shop Catalog?"}{" "}
            <button className="inline-link" type="button" onClick={() => openAuth(registering ? "login" : "register")}>
              {registering ? "Log in" : "Create account"}
            </button>
          </p>
        </section>
      </div>
    );
  }

  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#top">
          <span className="brand-mark">S</span> shop catalog
        </a>
        <span className="topbar-note">Thoughtful finds for everyday living</span>
        {renderAccountActions()}
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">THE EVERYDAY EDIT</p>
          <h1>Good things,<br /><em>well chosen.</em></h1>
          <p className="hero-description">A considered collection of useful, well-made favorites. Find something you'll love to live with.</p>
          <a className="hero-link" href="#catalog">Explore the collection <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-art" aria-label="Colorful abstract product display" role="img">
          <div className="art-sun" />
          <div className="art-arch" />
          <div className="art-vase"><span /></div>
          <div className="art-book art-book-one" />
          <div className="art-book art-book-two" />
          <div className="art-caption">MADE FOR<br />THE MOMENT</div>
        </div>
      </header>

      {adminPanel}

      <section className="catalog" id="catalog">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A LITTLE BIT OF EVERYTHING</p>
            <h2>Shop the collection</h2>
          </div>
          <span className="result-count">{loadingProducts ? "Loading…" : `${products.length} ${products.length === 1 ? "item" : "items"}`}</span>
        </div>

        <section className="filters" aria-label="Product filters">
          <label className="search-field">
            <span>Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “linen” or “tote”"
            />
          </label>
          <label>
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Recently added</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
            </select>
          </label>
        </section>

        {catalogError && <p className="error-banner" role="alert">{catalogError}</p>}
        {loadingProducts ? (
          <div className="empty-state" role="status">Finding the good stuff…</div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <span className="empty-mark">✳</span>
            <h3>{catalogError ? "Couldn't reach the database" : "No products listed yet"}</h3>
            <p>{catalogError ? "Make sure the API and MongoDB are running, then try again." : "No products match your current search. Try another term or clear the filters."}</p>
            {catalogError ? (
              <button className="text-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button>
            ) : (
              <button className="text-button" onClick={() => { setQuery(""); setCategory(""); }}>Clear filters</button>
            )}
          </div>
        ) : (
          <section className="product-grid" aria-label="Products">
            {products.map((product, index) => (
              <div className="product-entry" key={product.id}>
                <button className="product-card" onClick={() => openProduct(product.slug)}>
                  <span className={`product-image image-tone-${index % 3}`}>
                    <img src={product.image_url} alt={product.name} loading="lazy" />
                    <span className="image-arrow" aria-hidden="true">↗</span>
                  </span>
                  <span className="product-meta">
                    <span className="category-label">{product.category_name}</span>
                    <span className="product-price">{formatPrice(product.price_in_cents)}</span>
                  </span>
                  <strong>{product.name}</strong>
                  <span className="product-description">{product.description}</span>
                </button>
                {canManage(product) && (
                    <div className="product-admin-actions">
                    <button className="text-button" onClick={() => openAdminPanel(product)}>Edit</button>
                    <button className="text-button danger-link" onClick={() => handleProductDelete(product)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </section>

      <footer className="footer"><span>SHOP CATALOG</span><span>Good things for every day.</span></footer>
      {authMode && renderAuthDialog()}
    </main>
  );
}
