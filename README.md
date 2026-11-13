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
- `GET /api/health`

The seed command is safe to rerun: it updates the sample categories and products by slug without duplicating them.

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
