import { useEffect, useState } from "react";
import "./App.css";

const API = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

function formatPrice(rupees) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

async function getJson(url, signal) {
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
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
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getJson(`${API}/categories`, controller.signal)
      .then(setCategories)
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setError("We couldn't load categories. Check the database connection.");
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
    getJson(`${API}/products?${params.toString()}`, controller.signal)
      .then((items) => {
        setProducts(items);
        setError("");
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setProducts([]);
          setError("We couldn't load products from the database.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingProducts(false);
      });

    return () => controller.abort();
  }, [query, category, sort, retryCount]);

  async function openProduct(slug) {
    setError("");
    try {
      setSelectedProduct(await getJson(`${API}/products/${encodeURIComponent(slug)}`));
    } catch {
      setError("We couldn't load product details. Please try again.");
    }
  }

  function returnToCatalog() {
    setSelectedProduct(null);
    setError("");
  }

  if (selectedProduct) {
    return (
      <main className="page-shell">
        <nav className="topbar" aria-label="Main navigation">
          <button className="brand" onClick={returnToCatalog} aria-label="Shop Catalog home">
            <span className="brand-mark">S</span> shop catalog
          </button>
          <button className="text-button" onClick={returnToCatalog}>← All products</button>
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
            <button className="primary-button" onClick={returnToCatalog}>Continue browsing</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#top">
          <span className="brand-mark">S</span> shop catalog
        </a>
        <span className="topbar-note">Thoughtful finds for everyday living</span>
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
              {categories.map((item) => (
                <option key={item.id} value={item.slug}>{item.name}</option>
              ))}
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

        {error && <p className="error-banner" role="alert">{error}</p>}
        {loadingProducts ? (
          <div className="empty-state" role="status">Finding the good stuff…</div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <span className="empty-mark">✳</span>
            <h3>{error ? "Couldn't reach the database" : "No products listed yet"}</h3>
            <p>{error ? "Make sure the API and MongoDB are running, then try again." : "No products match your current search. Try another term or clear the filters."}</p>
            {error ? (
              <button className="text-button" onClick={() => setRetryCount((count) => count + 1)}>
                Try again
              </button>
            ) : (
              <button className="text-button" onClick={() => { setQuery(""); setCategory(""); }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <section className="product-grid" aria-label="Products">
            {products.map((product, index) => (
              <button className="product-card" key={product.id} onClick={() => openProduct(product.slug)}>
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
            ))}
          </section>
        )}
      </section>

      <footer className="footer"><span>SHOP CATALOG</span><span>Good things for every day.</span></footer>
    </main>
  );
}
