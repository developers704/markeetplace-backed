/**
 * Create indexes for ProductListing collection. Run: node scripts/createProductListingIndexes.js
 */
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const dns = require("node:dns/promises");
const ProductListing = require('../models/productListing.model');
dotenv.config();
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    await ProductListing.syncIndexes();
    console.log('ProductListing indexes synced.');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
