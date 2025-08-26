# Deployment Guide for AU Journey Web Frontend

This guide explains how to deploy the AU Journey Web Frontend application using Docker to serve at `https://life.au.edu/journey`.

## Prerequisites

- Docker installed on the server
- Nginx server configured with SSL
- Git (for cloning the repository)

## Step-by-Step Deployment

### 1. Install Docker (if not already installed)

For Ubuntu/Debian systems:
```bash
sudo apt update
sudo apt install docker.io
sudo systemctl start docker
sudo systemctl enable docker
```

### 2. Clone the Repository

```bash
git clone https://github.com/AU-Journey/au-journey-web-frontend.git
cd au-journey-web-frontend
```

### 3. Build the Docker Image

```bash
docker build \
  --build-arg VITE_BACKEND_URL=https://au-journey-web-backend-gk6n3.ondigitalocean.app \
  --build-arg DEPLOY_TARGET=docker \
  -t au-journey-frontend .
```

### 4. Run the Container

```bash
docker run -d \
  --name au-journey-frontend \
  --restart unless-stopped \
  -p 8080:80 \
  au-journey-frontend
```

### 5. Configure Nginx

Add the following configuration to your Nginx server block (typically in `/etc/nginx/sites-available/default` or similar):

```nginx
location /journey {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

### 6. Test and Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Maintenance Commands

### Stop the Application
```bash
docker stop au-journey-frontend
```

### Start the Application
```bash
docker start au-journey-frontend
```

### View Logs
```bash
docker logs au-journey-frontend
```

### Rebuild and Redeploy (for updates)
```bash
# Stop and remove the existing container
docker stop au-journey-frontend
docker rm au-journey-frontend

# Rebuild the image
docker build \
  --build-arg VITE_BACKEND_URL=https://au-journey-web-backend-gk6n3.ondigitalocean.app \
  --build-arg DEPLOY_TARGET=docker \
  -t au-journey-frontend .

# Run the new container
docker run -d \
  --name au-journey-frontend \
  --restart unless-stopped \
  -p 8080:80 \
  au-journey-frontend
```

## Verification

After deployment, the application should be accessible at:
- URL: `https://life.au.edu/journey`

## Troubleshooting

1. If the application is not accessible:
   - Check if the Docker container is running: `docker ps`
   - Check Docker logs: `docker logs au-journey-frontend`
   - Verify Nginx configuration: `sudo nginx -t`
   - Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`

2. If WebSocket connections fail:
   - Ensure the Nginx proxy settings for WebSocket upgrades are correct
   - Verify the backend URL is accessible
   - Check browser console for connection errors

## Support

For any issues or questions, please contact:
- Repository: https://github.com/AU-Journey/au-journey-web-frontend
