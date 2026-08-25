// Thin wrapper around the public Sleeper API (https://docs.sleeper.com/) with
// an on-disk JSON cache, since several endpoints (players/nfl, past-season
// draft/transaction data) are large and/or immutable.

'use strict';

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.sleeper.app/v1';
const CACHE_DIR = path.join(__dirname, '.cache');

function cachePathFor(key) {
  const safe = key.replace(/[^a-z0-9._-]/gi, '_');
  return path.join(CACHE_DIR, `${safe}.json`);
}

function readCache(key, maxAgeMs) {
  try {
    const file = cachePathFor(key);
    const stat = fs.statSync(file);
    if (maxAgeMs != null && Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePathFor(key), JSON.stringify(data));
  } catch (err) {
    console.warn(`Warning: failed to write cache for "${key}": ${err.message}`);
  }
}

/**
 * GET a Sleeper API path, with an optional on-disk JSON cache.
 *
 * @param {string} urlPath - path after /v1, e.g. `/league/${id}/rosters`
 * @param {object} [opts]
 * @param {string} [opts.cacheKey] - cache the response under this key when set
 * @param {number} [opts.maxAgeMs] - cache freshness window; omit to cache
 *   indefinitely until `refresh` is passed (good for immutable past-season data)
 * @param {boolean} [opts.refresh] - bypass and overwrite the cache
 */
async function sleeperGet(urlPath, opts = {}) {
  const { cacheKey, maxAgeMs, refresh } = opts;
  if (cacheKey && !refresh) {
    const cached = readCache(cacheKey, maxAgeMs);
    if (cached !== null) return cached;
  }
  const url = `${API_BASE}${urlPath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sleeper API ${res.status} ${res.statusText} for ${url}`);
  }
  const data = await res.json();
  if (cacheKey) writeCache(cacheKey, data);
  return data;
}

module.exports = { sleeperGet, API_BASE, CACHE_DIR };
