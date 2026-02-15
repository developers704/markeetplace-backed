/**
 * Backfill ProductListing read model. Run once after deploy or when ProductListing is empty.
 * From project root: node jobs/productListing.jobs.js
 */
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { rebuildAllProductListings } = require('../services/productListingSync.service');
const dns = require("node:dns/promises");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set in .env');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' && err.syscall === 'querySrv' && uri.startsWith('mongodb+srv://')) {
      const match = uri.match(/^mongodb\+srv:\/\/([^@]+)@([^/]+)(\/[^?]*)?(\?.*)?$/);
      const q = (match[4] || '').includes('authSource=') ? (match[4] || '') : (match[4] ? match[4] + '&' : '?') + 'authSource=admin';
      const fallback = match
        ? `mongodb://${match[1]}@${match[2]}:27017${match[3] || '/'}${q}`
        : uri;
      await mongoose.connect(fallback);
    } else throw err;
  }
  try {
    await rebuildAllProductListings(500);
    console.log('ProductListing rebuild complete.');
  } finally {
    await mongoose.disconnect();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
