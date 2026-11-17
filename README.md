# Shop Catalog

React + Vite storefront with an Express API and MongoDB database.

## Run locally

1. Install Node.js 20.19+.
2. Copy `Server/.env.example` to `Server/.env`. For MongoDB Atlas, replace `MONGODB_URI` with your Atlas connection string. For local MongoDB, leave the example URI as is and start MongoDB (or run `docker compose up -d mongodb` if Docker is installed).
3. From the project root, run:

   ```sh
   npm install
   npm run seed
   npm run dev
   ```

4. Open the Vite URL shown in the terminal (usually http://localhost:5173).

The API runs on http://localhost:5001. Its health endpoint is `/api/health`.

## API

- `GET /api/categories`
- `GET /api/products?q=shirt&category=clothing&sort=price-low`
- `GET /api/products/:slug`
- `POST /api/auth/register` (creates a standard user account; role is always `user`)
- `POST /api/auth/login`
- `GET /api/auth/me` (login required)
- `POST /api/auth/logout` (login required)
- `POST /api/products` (admin login required; adds a product)
- `PUT /api/products/:slug` (admin login required; edits a product)
- `DELETE /api/products/:slug` (admin login required; removes a product)
- `GET /api/health`

The seed command is safe to rerun: it updates the sample categories and products by slug without duplicating them.

### User and admin accounts

Anyone can register a standard user account in the storefront. Public registration always creates the `user` role; it cannot create an admin account. The owner creates or promotes the admin account from the project terminal using `ADMIN_EMAIL` and `ADMIN_PASSWORD`:

For local development, temporarily add `ADMIN_EMAIL` and `ADMIN_PASSWORD` to `Server/.env`, then run `npm run create-admin` from the repository root. Remove `ADMIN_PASSWORD` from the file after the command completes.

This command connects to the database configured by `MONGODB_URI`. Use a password with at least 12 characters. For a production database, run it only after selecting the intended production connection string; remove the temporary password from the hosting environment afterward. Never commit real credentials.

After an admin logs in, the storefront shows product management controls to add, edit, and remove products. Standard users can register, log in, and browse the catalog, but cannot manage products. Sessions expire after seven days; logging out revokes the session.

### Product management API

Admin product requests from the storefront use the session created by login. For direct API use, send the access token returned by `POST /api/auth/login` in the `Authorization: Bearer <token>` header. Product JSON uses this shape:

```json
{
  "name": "Cotton Hoodie",
  "slug": "cotton-hoodie",
  "description": "A comfortable cotton hoodie.",
  "price_in_cents": 2800,
  "image_url": "https://example.com/cotton-hoodie.jpg",
  "category_slug": "clothing"
}
```

The API validates the fields and category, then inserts or updates the product in MongoDB. The existing `GET` routes return current database records. Prices are displayed as whole rupees, so `2800` appears as `₹2,800`.

## Deploy

The frontend, API, and MongoDB need hosting. GitHub stores the source code; GitHub Pages can host static frontend files, but it cannot run this Express API or MongoDB.

### API service

Deploy the repository root as a Node.js service. Use `npm start` as the start command and set these environment variables in the hosting dashboard:

- `MONGODB_URI`: the connection string for your production MongoDB database.
- `CLIENT_ORIGIN`: the exact frontend origin, such as `https://shop.example.com`. Multiple origins can be comma-separated.
- `PORT`: usually supplied by the hosting provider; the server reads it automatically.

Run `npm run seed` once against the production database to add the sample categories and products. Replace the sample product image URLs in `Server/seed.js` with images you have permission to use.

Check the API at `https://YOUR-API-DOMAIN/api/health`. It should report that the database is connected.

### Frontend

Build the client with `npm run build` from the repository root. The generated site is in `Client/dist`. Set `VITE_API_URL` in the frontend hosting dashboard to the API base URL, including `/api`, for example `https://YOUR-API-DOMAIN/api`. This variable is included when the frontend is built, so set it before each production build.

The Vite `/api` proxy is only for local development. In production, `VITE_API_URL` points the browser to the deployed API, and the API's `CLIENT_ORIGIN` must match the frontend's public origin.

### Before launch

- Product prices are displayed as whole rupees: a stored value of `2800` appears as `₹2,800`.
- Replace placeholder product images and verify the product descriptions and prices.
- Test the deployed catalog from the public frontend URL, including search, category filtering, sorting, and product details.
- Keep database credentials in hosting environment settings. Do not commit `Server/.env`.
