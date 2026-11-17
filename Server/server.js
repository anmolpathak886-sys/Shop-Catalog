require("dotenv").config();

const cors = require("cors");
const express = require("express");
const Category = require("./models/Category");
const Product = require("./models/Product");
const Session = require("./models/Session");
const User = require("./models/User");
const { createSession, hashPassword, requireAuth, requireSeller, verifyPassword } = require("./auth");
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

function serializeUser(user) {
  return { id: user._id.toString(), email: user.email, role: user.role };
}

// Admin can manage every product. A seller can manage only products they created.
function canManageProduct(user, product) {
  return (
    user.role === "admin" ||
    Boolean(product.created_by && product.created_by.toString() === user._id.toString())
  );
}

function normalizeProductInput(body) {
  const input = body && typeof body === "object" ? body : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const imageUrl = typeof input.image_url === "string" ? input.image_url.trim() : "";
  const categorySlug =
    typeof input.category_slug === "string" ? input.category_slug.trim().toLowerCase() : "";
  const price = input.price_in_cents;

  if (!name || name.length > 200) {
    return { error: "Name is required and must be 200 characters or fewer" };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug must use lowercase letters, numbers, and hyphens" };
  }
  if (!description || description.length > 2000) {
    return { error: "Description is required and must be 2000 characters or fewer" };
  }
  if (!Number.isSafeInteger(price) || price < 0) {
    return { error: "price_in_cents must be a non-negative whole number" };
  }
  if (!categorySlug) return { error: "category_slug is required" };

  let parsedImageUrl;
  try {
    parsedImageUrl = new URL(imageUrl);
  } catch {
    return { error: "image_url must be a valid HTTPS URL" };
  }
  if (parsedImageUrl.protocol !== "https:") {
    return { error: "image_url must use HTTPS" };
  }

  return {
    value: {
      name,
      slug,
      description,
      price_in_cents: price,
      image_url: imageUrl,
      category_slug: categorySlug,
    },
  };
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
    created_by: product.created_by ? product.created_by.toString() : null,
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

app.post("/api/auth/register", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 8 and 128 characters" });
  }

  try {
    const passwordFields = await hashPassword(password);
    // Public registration can only create "user" or "seller". Admin is never possible here.
    const role = req.body?.account_type === "seller" ? "seller" : "user";
    const user = await User.create({ email, ...passwordFields, role });
    const session = await createSession(user._id);
    return res.status(201).json({ ...session, user: serializeUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "An account with this email already exists" });
    console.error("Could not register user:", error.message);
    return res.status(500).json({ error: "Could not create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  try {
    const user = await User.findOne({ email }).select("+password_hash +password_salt");
    if (!user || !(await verifyPassword(password, user))) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }

    const session = await createSession(user._id);
    return res.json({ ...session, user: serializeUser(user) });
  } catch (error) {
    console.error("Could not log in:", error.message);
    return res.status(500).json({ error: "Could not log in" });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: serializeUser(req.authUser) });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  try {
    await Session.deleteOne({ _id: req.authSession._id });
    return res.status(204).end();
  } catch (error) {
    console.error("Could not log out:", error.message);
    return res.status(500).json({ error: "Could not log out" });
  }
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

// Add a product: admin or seller. The creator is saved as the owner.
app.post("/api/products", requireAuth, requireSeller, async (req, res) => {
  const normalized = normalizeProductInput(req.body);
  if (normalized.error) return res.status(400).json({ error: normalized.error });

  try {
    const category = await Category.findOne({ slug: normalized.value.category_slug }).select("_id").lean();
    if (!category) {
      return res.status(400).json({ error: "category_slug does not match an existing category" });
    }

    const { category_slug, ...productFields } = normalized.value;
    const createdProduct = await Product.create({
      ...productFields,
      category: category._id,
      created_by: req.authUser._id,
    });

    const product = await Product.findById(createdProduct._id)
      .populate("category", "name slug")
      .lean();

    return res.status(201).json(serializeProduct(product));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "A product with that slug already exists" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: "Product data did not pass validation" });
    }

    console.error("Could not create product:", error.message);
    return res.status(500).json({ error: "Could not create product" });
  }
});

// Edit a product: admin can edit any, a seller only their own.
app.put("/api/products/:slug", requireAuth, requireSeller, async (req, res) => {
  const normalized = normalizeProductInput(req.body);
  if (normalized.error) return res.status(400).json({ error: normalized.error });

  try {
    const existing = await Product.findOne({ slug: req.params.slug }).select("created_by").lean();
    if (!existing) return res.status(404).json({ error: "Product not found" });
    if (!canManageProduct(req.authUser, existing)) {
      return res.status(403).json({ error: "You can only edit your own products" });
    }

    const category = await Category.findOne({ slug: normalized.value.category_slug }).select("_id").lean();
    if (!category) {
      return res.status(400).json({ error: "category_slug does not match an existing category" });
    }

    const { category_slug, ...productFields } = normalized.value;
    const product = await Product.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: { ...productFields, category: category._id } },
      { new: true, runValidators: true }
    )
      .populate("category", "name slug")
      .lean();

    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json(serializeProduct(product));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "A product with that slug already exists" });
    if (error.name === "ValidationError") return res.status(400).json({ error: "Product data did not pass validation" });
    console.error("Could not update product:", error.message);
    return res.status(500).json({ error: "Could not update product" });
  }
});

// Delete a product: admin can delete any, a seller only their own.
app.delete("/api/products/:slug", requireAuth, requireSeller, async (req, res) => {
  try {
    const existing = await Product.findOne({ slug: req.params.slug }).select("created_by").lean();
    if (!existing) return res.status(404).json({ error: "Product not found" });
    if (!canManageProduct(req.authUser, existing)) {
      return res.status(403).json({ error: "You can only delete your own products" });
    }

    await Product.findOneAndDelete({ slug: req.params.slug });
    return res.status(204).end();
  } catch (error) {
    console.error("Could not delete product:", error.message);
    return res.status(500).json({ error: "Could not delete product" });
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
