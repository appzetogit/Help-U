# Redis Setup Guide for Appzeto

## Why Redis?
Redis provides high-performance caching for:
- **Online worker tracking** - Fast lookup of who's online
- **Location caching** - Avoid DB hits for geo queries
- **Session management** - Faster auth token validation
- **Rate limiting** - Per-worker request throttling

## Installation Steps

### Option 1: Local Development (Windows)

1. **Download Redis for Windows**
   - Go to: https://github.com/tporadowski/redis/releases
   - Download: `Redis-x64-5.0.14.1.msi` (or latest version)
   - Run the installer

2. **Start Redis Server**
   ```bash
   redis-server
   ```

3. **Test Connection**
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

### Option 2: Docker (Recommended for Dev)

```bash
docker run -d --name redis-appzeto -p 6379:6379 redis:alpine
```

### Option 3: Cloud Redis (Production)

**Redis Cloud (Free Tier)**
1. Go to: https://redis.com/try-free/
2. Create account and get connection URL

**AWS ElastiCache**
- Use for production at scale

## Environment Variables

Add to your `.env` file:

```env
# Redis Configuration
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL=redis://localhost:6379

# For cloud Redis (Redis Cloud, Upstash, etc.)
# REDIS_URL=redis://default:password@host:port
```

## Install Node Package

```bash
cd Backend
npm install ioredis
```

## Usage in Code

Once installed, create `services/redisService.js`:

```javascript
const Redis = require('ioredis');

let redis = null;

const initRedis = () => {
  if (process.env.REDIS_ENABLED !== 'true') {
    console.log('[Redis] Disabled via env');
    return null;
  }

  try {
    redis = new Redis(process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined
    });

    redis.on('connect', () => console.log('[Redis] Connected'));
    redis.on('error', (err) => console.error('[Redis] Error:', err));

    return redis;
  } catch (error) {
    console.error('[Redis] Init failed:', error);
    return null;
  }
};

// Cache worker online status
const setWorkerOnline = async (vendorId, isOnline) => {
  if (!redis) return;
  if (isOnline) {
    await redis.sadd('vendors:online', vendorId);
  } else {
    await redis.srem('vendors:online', vendorId);
  }
};

const getOnlineWorkers = async () => {
  if (!redis) return [];
  return redis.smembers('vendors:online');
};

// Cache worker location (for fast geo queries)
const setWorkerLocation = async (vendorId, lat, lng) => {
  if (!redis) return;
  await redis.geoadd('vendors:locations', lng, lat, vendorId);
};

const getNearbyWorkers = async (lat, lng, radiusKm = 10) => {
  if (!redis) return [];
  return redis.georadius('vendors:locations', lng, lat, radiusKm, 'km', 'WITHDIST', 'ASC');
};

module.exports = {
  initRedis,
  getRedis: () => redis,
  setWorkerOnline,
  getOnlineWorkers,
  setWorkerLocation,
  getNearbyWorkers
};
```

## Integration Points

1. **server.js** - Initialize on startup
2. **sockets/index.js** - Update online status on connect/disconnect
3. **locationService.js** - Use Redis geo queries first, fallback to MongoDB

## When to Implement

Redis is a **Phase 4 (Future)** optimization. Current MongoDB implementation works fine for:
- Up to 1000 workers
- Up to 100 concurrent bookings

Consider Redis when you see:
- Slow worker search (>500ms)
- High database CPU usage
- Need for real-time online status at scale
