require("dotenv").config();
const Redis = require("ioredis");
let client = null;
const LISTING_GEN_KEY = "listing:v2:gen";

function getClient() {
  if (client) return client;

  const uri = process.env.REDIS_URI;
  console.log(uri)
  if (!uri) {
    console.log("❌ REDIS_URI missing");
    return null;
  }

  client = new Redis(uri, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // tls: {}
  });

  client.on("ready", () => console.log("Redis connected"));
  client.on("error", err => console.log("Redis error:", err.message));

  return client;
}
const TTL = Number(process.env.LISTING_CACHE_TTL) || 60;


async function getListingCacheVersion() {
  const c = getClient();
  if (!c) return "0";

  let v = await c.get(LISTING_GEN_KEY);
  if (!v) {
    await c.set(LISTING_GEN_KEY, "1", "EX", TTL);
    return "1";
  }
  return v;
}

async function incrListingCacheVersion() {
  const c = getClient();
  if (!c) return;
  await c.incr(LISTING_GEN_KEY);
}

module.exports = {
  getClient,
  getListingCacheVersion,
  incrListingCacheVersion
};

