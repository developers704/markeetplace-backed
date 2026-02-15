const { getClient, getListingCacheVersion, incrListingCacheVersion } = require("./config/redis");

async function testRedis() {
  const client = getClient();
  if (!client) {
    console.log('Redis client not initialized');
    return;
  }

  console.log('Redis client initialized');

  // Test get and set
  const version = await getListingCacheVersion();
  console.log('Current cache version:', version);

  await incrListingCacheVersion();
  const newVersion = await getListingCacheVersion();
  console.log('After increment, cache version:', newVersion);

  client.quit();
}

testRedis().catch(console.error);
