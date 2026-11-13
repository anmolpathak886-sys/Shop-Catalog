require("dotenv").config();

const Category = require("./models/Category");
const Product = require("./models/Product");
const { connectDatabase, mongoose } = require("./db");

const categories = [
  { name: "Clothing", slug: "clothing" },
  { name: "Accessories", slug: "accessories" },
];

const products = [
  {
    name: "Classic T-Shirt",
    slug: "classic-t-shirt",
    description: "A soft cotton T-shirt for everyday wear.",
    price_in_cents: 2800,
    image_url: "https://placehold.co/800x600?text=Classic+T-Shirt",
    category_slug: "clothing",
  },
  {
  name: "Canvas Backpack",
  slug: "canvas-backpack",
  description: "A durable backpack for everyday use.",
  price_in_cents: 4500,
  image_url: "https://placehold.co/800x600?text=Canvas+Backpack",
  category_slug: "accessories",
},
  {
    name: "Everyday Tote",
    slug: "everyday-tote",
    description: "A sturdy canvas tote for daily use.",
    price_in_cents: 2400,
    image_url: "https://placehold.co/800x600?text=Everyday+Tote",
    category_slug: "accessories",
  },
  {
    name: "Linen Shirt",
    slug: "linen-shirt",
    description: "A lightweight linen shirt.",
    price_in_cents: 5200,
    image_url: "https://placehold.co/800x600?text=Linen+Shirt",
    category_slug: "clothing",
  },
];

async function seed() {
  try {
    await connectDatabase();

    const savedCategories = new Map();
    for (const category of categories) {
      const saved = await Category.findOneAndUpdate(
        { slug: category.slug },
        { $set: category },
        { new: true, upsert: true, runValidators: true }
      );
      savedCategories.set(saved.slug, saved._id);
    }

    for (const product of products) {
      const { category_slug, ...data } = product;
      await Product.findOneAndUpdate(
        { slug: data.slug },
        { $set: { ...data, category: savedCategories.get(category_slug) } },
        { new: true, upsert: true, runValidators: true }
      );
    }

    console.log(`Seeded ${categories.length} categories and ${products.length} products.`);
  } catch (error) {
    console.error("Could not seed MongoDB:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seed();
