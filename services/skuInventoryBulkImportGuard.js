/**
 * Re-entrancy-safe flag: while >0, SkuInventory mongoose hooks should skip
 * Redis rebuild + ProductListing scheduling (used by CSV bulk import worker).
 */

let depth = 0;

function enter() {
  depth += 1;
}

function exit() {
  depth = Math.max(0, depth - 1);
}

function isActive() {
  return depth > 0;
}

module.exports = {
  enter,
  exit,
  isActive,
};
