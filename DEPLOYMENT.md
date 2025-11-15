# Deployment Guide

This guide covers multiple deployment options for the Inko collaborative whiteboard application.

## Prerequisites

- Node.js 18+ installed
- Git repository access
- Basic understanding of terminal/command line

## Deployment Options

### 1. **Render (Recommended - Free Tier)**

Render offers free hosting with WebSocket support, perfect for this application.

#### Steps:

1. **Push code to GitHub** (if not already done):
   ```bash
   git push origin main
   ```

2. **Create Render account**: Visit [render.com](https://render.com) and sign up

3. **Create new Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the `Inko` repository

4. **Configure service**:
   - **Name**: `inko-whiteboard`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

5. **Deploy**: Click "Create Web Service"

6. **Access your app**: Render will provide a URL like `https://inko-whiteboard.onrender.com`

#### Notes:
- Free tier may sleep after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- WebSockets work out of the box

---

### 2. **Railway.app (Free $5 Credit)**

Railway provides excellent WebSocket support with easy deployment.

#### Steps:

1. **Create Railway account**: Visit [railway.app](https://railway.app)

2. **Deploy from GitHub**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `Inko` repository

3. **Configure**:
   - Railway auto-detects Node.js
   - No additional configuration needed

4. **Add domain**: Railway provides a free `.up.railway.app` subdomain

#### Environment Variables (if needed):
```
PORT=3000
```

---

### 3. **Heroku (Requires Credit Card)**

Heroku is reliable but requires payment information even for free tier.

#### Steps:

1. **Install Heroku CLI**:
   ```bash
   npm install -g heroku
   ```

2. **Login**:
   ```bash
   heroku login
   ```

3. **Create app**:
   ```bash
   heroku create inko-whiteboard
   ```

4. **Deploy**:
   ```bash
   git push heroku main
   ```

5. **Open app**:
   ```bash
   heroku open
   ```

#### Additional Configuration:

Create a `Procfile` in the root directory:
```
web: node server/server.js
```

---

### 4. **Vercel (Static + Serverless)**

Vercel requires configuration for WebSocket support using a separate WebSocket server.

**Note**: Vercel's serverless functions don't support long-lived WebSocket connections well. Consider using Render or Railway instead for this WebSocket-heavy application.

---

### 5. **DigitalOcean App Platform**

#### Steps:

1. **Create DigitalOcean account**: [digitalocean.com](https://digitalocean.com)

2. **Create new App**:
   - Select "App Platform"
   - Connect GitHub repository
   - Choose `Inko` repository

3. **Configure**:
   - **Type**: Web Service
   - **Build Command**: `npm install`
   - **Run Command**: `npm start`
   - **HTTP Port**: 3000

4. **Deploy**: Review and create

---

### 6. **AWS (EC2 - Advanced)**

For production-grade deployment with full control.

#### Steps:

1. **Launch EC2 instance**:
   - AMI: Ubuntu 22.04
   - Instance type: t2.micro (free tier)
   - Configure security group: Allow ports 22, 80, 443, 3000

2. **SSH into instance**:
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

3. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Clone repository**:
   ```bash
   git clone https://github.com/your-username/Inko.git
   cd Inko
   npm install
   ```

5. **Install PM2** (process manager):
   ```bash
   sudo npm install -g pm2
   pm2 start server/server.js --name inko
   pm2 startup
   pm2 save
   ```

6. **Configure Nginx** (reverse proxy):
   ```bash
   sudo apt install nginx
   sudo nano /etc/nginx/sites-available/inko
   ```

   Add configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   Enable site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/inko /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

---

### 7. **Docker + Any Platform**

Create a `Dockerfile` for containerized deployment:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

Create `.dockerignore`:
```
node_modules
.git
.gitignore
*.md
tests
```

**Build and run**:
```bash
docker build -t inko-whiteboard .
docker run -p 3000:3000 inko-whiteboard
```

**Deploy to platforms**:
- **Google Cloud Run**: `gcloud run deploy`
- **AWS ECS**: Use ECR + ECS
- **Azure Container Instances**: `az container create`

---

## Environment Variables

The application uses these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |

Most platforms auto-assign `PORT`, so no manual configuration needed.

---

## Pre-Deployment Checklist

- [ ] All changes committed to Git
- [ ] Dependencies listed in `package.json`
- [ ] `npm start` works locally
- [ ] WebSocket connections tested locally
- [ ] No hardcoded `localhost` URLs in client code

---

## Post-Deployment Testing

1. **Access the URL** provided by your hosting platform
2. **Test WebSocket connection**: Open developer console, check for connection messages
3. **Test drawing**: Draw on canvas, verify strokes appear
4. **Test multi-user**: Open app in two browser tabs/windows, verify:
   - Both users can draw
   - Strokes appear in real-time
   - Cursors are visible
   - Undo/redo works across users
5. **Test network resilience**: 
   - Turn off WiFi briefly
   - Verify "Connection lost" toast appears
   - Turn WiFi back on
   - Verify "Reconnected" toast and queued operations sent

---

## Monitoring & Logs

### Render:
- View logs in dashboard under "Logs" tab
- Real-time streaming available

### Railway:
- Deployments → Select deployment → View logs

### Heroku:
```bash
heroku logs --tail
```

### PM2 (for EC2/VPS):
```bash
pm2 logs inko
pm2 monit
```

---

## Troubleshooting

### WebSocket connection fails:
- Check if platform supports WebSocket (Render, Railway, Heroku do)
- Verify firewall/security group allows WebSocket connections
- Check server logs for errors

### Application crashes:
- Check logs for errors
- Verify Node.js version compatibility (18+)
- Ensure all dependencies installed: `npm install`

### Performance issues:
- Free tiers may have CPU/memory limits
- Consider upgrading to paid tier for production use
- Implement operation history limits (already done via `MAX_OPERATIONS`)

---

## Recommended: Render Deployment

For the easiest deployment with WebSocket support, **use Render**:

1. Push to GitHub
2. Connect Render to your repository
3. Deploy with one click
4. Get free HTTPS and subdomain

Your app will be live at `https://your-app-name.onrender.com` in ~2 minutes!

---

## Custom Domain (Optional)

Most platforms allow custom domains:

1. **Purchase domain** (Namecheap, GoDaddy, Google Domains)
2. **Add CNAME record** pointing to platform-provided URL
3. **Configure in platform dashboard**
4. **Enable HTTPS** (usually automatic with Let's Encrypt)

Example DNS configuration:
```
Type: CNAME
Name: whiteboard
Value: your-app.onrender.com
TTL: 3600
```

Access via: `https://whiteboard.yourdomain.com`

---

## Security Considerations

For production deployment:

1. **Rate limiting**: Add to prevent abuse
2. **Authentication**: Implement user authentication
3. **HTTPS**: Ensure SSL/TLS enabled (automatic on most platforms)
4. **Input validation**: Already implemented in `operations.js`
5. **CORS**: Configure if frontend hosted separately

---

## Scaling Considerations

Current implementation is single-room. For multi-room support:

1. Implement room routing in WebSocket handler
2. Use Redis for shared state across instances
3. Load balance with sticky sessions (WebSocket requirement)
4. Consider serverless WebSocket services (AWS API Gateway WebSocket)

---

## Cost Estimates

| Platform | Free Tier | Paid Tier |
|----------|-----------|-----------|
| **Render** | ✅ Free (sleeps) | $7/month (always on) |
| **Railway** | $5 credit | Usage-based (~$5-10/month) |
| **Heroku** | Eco $5/month | Basic $7/month |
| **DigitalOcean** | None | $4-6/month |
| **AWS EC2** | t2.micro free 1 year | $5-10/month |

---

## Quick Deploy Commands

### For Render/Railway/Heroku (from local):
```bash
# Ensure everything is committed
git add .
git commit -m "feat: prepare for deployment"
git push origin main

# Then use platform's web UI to deploy from GitHub
```

### For VPS/EC2 (from server):
```bash
# Clone and setup
git clone https://github.com/your-username/Inko.git
cd Inko
npm install
npm start

# Or with PM2
npm install -g pm2
pm2 start server/server.js --name inko
pm2 save
pm2 startup
```

---

**Need help?** Check platform-specific documentation:
- [Render Docs](https://render.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Heroku Docs](https://devcenter.heroku.com)
