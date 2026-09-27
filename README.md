# Tram Tracker web frontend

Three.js campus map showing live positions for `tram_1` and `tram_2`. Vite builds the site for `/tram/`; the production image serves it through Nginx.

## Local development

Requires Node.js 18 and npm 9. The backend and Redis must be running to display live locations.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/`. By default, local development connects to the backend at `http://localhost:8080`. `VITE_BACKEND_URL` can override that address.

For the complete local stack, run `docker compose --profile mock up -d --build` from the sibling `tram-tracker` workspace root and open `http://localhost:8081/tram/`.

## Production image

```sh
docker build -t tram-tracker-frontend:local .
```

The image serves `/tram/` on container port 80. Its Nginx configuration proxies `/tram/socket.io/` to the `backend` service on port 8080, so the production stack needs both containers on the same Docker network. The site uses a same-origin Socket.IO connection.

Pushing to `main` builds and publishes `ghcr.io/au-journey/au-journey-web-frontend` with a moving `:main` tag and a commit-specific `:sha-<commit>` tag. The workflow only publishes the image; deployment remains manual. GHCR package visibility is configured separately after the first publication.
