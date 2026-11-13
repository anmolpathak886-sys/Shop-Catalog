require("dotenv").config();

const cors = require("cors");
const express = require("express");
const Category = require("./models/Category");
const Product = require("./models/Product");
const { connectDatabase, mongoose } = require("./db");

const app = express();

const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      // Requests from tools and server-to-server clients may not include an Origin header.
      callback(null, !origin || allowedOrigins.has(origin));
    },
  })
);
app.use(express.json({ limit: "1mb" }));

function serializeCategory(category) {
  return { id: category._id.toString(), name: category.name, slug: category.slug };
}

function serializeProduct(product) {
  const category = product.category;
  return {
    id: product._id.toString(),
    name: product.name,
    slug: product.slug,
    description: product.description,
    price_in_cents: product.price_in_cents,
    image_url: product.image_url,
    created_at: product.created_at,
    category_name: category?.name || "Uncategorized",
    category_slug: category?.slug || "",
  };
}

app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    message: connected ? "Shop Catalog API is running" : "MongoDB is not connected",
    database: connected ? "connected" : "disconnected",
  });
});

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.json(categories.map(serializeCategory));
  } catch (error) {
    console.error("Could not load categories:", error.message);
    res.status(500).json({ error: "Could not load categories" });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const categorySlug = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "newest";
    const sortOptions = {
      newest: { created_at: -1, _id: -1 },
      "price-low": { price_in_cents: 1, _id: 1 },
      "price-high": { price_in_cents: -1, _id: 1 },
    };
    const filter = {};

    if (query) {
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = { $regex: escapedQuery, $options: "i" };
    }

    if (categorySlug) {
      const category = await Category.findOne({ slug: categorySlug }).select("_id").lean();
      if (!category) return res.json([]);
      filter.category = category._id;
    }

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort(sortOptions[sort] || sortOptions.newest)
      .lean();

    res.json(products.map(serializeProduct));
  } catch (error) {
    console.error("Could not load products:", error.message);
    res.status(500).json({ error: "Could not load products" });
  }
});

app.get("/api/products/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate("category", "name slug")
      .lean();

    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(serializeProduct(product));
  } catch (error) {
    console.error("Could not load product:", error.message);
    res.status(500).json({ error: "Could not load product" });
  }
});

app.use((req, res) => res.status(404).json({ error: "Route not found" }));

async function start() {
  try {
    await connectDatabase();
    const port = Number.parseInt(process.env.PORT || "5001", 10);
    app.listen(port, () => console.log(`API running at http://localhost:${port}`));
  } catch (error) {
    console.error("Could not connect to MongoDB:", error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) start();

module.exports = app;
