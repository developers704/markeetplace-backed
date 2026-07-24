/**
 * Proxies visual similarity search to the Python FastAPI service and runs index builds
 * against marketplace product images under uploads/products.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const {
  PROJECT_ROOT,
  getProductUploadsDir,
  productUploadPublicUrl,
} = require('../config/uploadPaths');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:9000').replace(/\/$/, '');
const AI_IMAGE_SEARCH_DIR =
  process.env.AI_IMAGE_SEARCH_DIR || path.resolve(PROJECT_ROOT, '..', 'image-ai-search');
const AI_INDEX_DEBOUNCE_MS = Number(process.env.AI_INDEX_DEBOUNCE_MS || 45000);
const ENABLED = String(process.env.AI_IMAGE_SEARCH_ENABLED || 'true').toLowerCase() !== 'false';

/** Prefer image-ai-search/.venv so build_index uses installed deps (pydantic_settings, torch, etc.). */
function resolvePythonBin() {
  const configured = process.env.AI_PYTHON_BIN?.trim();
  if (configured && path.isAbsolute(configured) && fs.existsSync(configured)) {
    return configured;
  }

  const venvCandidates =
    process.platform === 'win32'
      ? [
          path.join(AI_IMAGE_SEARCH_DIR, '.venv', 'Scripts', 'python.exe'),
          path.join(AI_IMAGE_SEARCH_DIR, 'venv', 'Scripts', 'python.exe'),
        ]
      : [
          path.join(AI_IMAGE_SEARCH_DIR, '.venv', 'bin', 'python'),
          path.join(AI_IMAGE_SEARCH_DIR, 'venv', 'bin', 'python'),
        ];
  const venvPython = venvCandidates.find((p) => fs.existsSync(p));
  if (venvPython) return venvPython;

  return configured || 'python';
}

const AI_PYTHON_BIN = resolvePythonBin();

function getProductImagesDir() {
  const custom = process.env.AI_PRODUCT_IMAGES_DIR;
  if (custom) {
    return path.isAbsolute(custom) ? custom : path.resolve(PROJECT_ROOT, custom);
  }
  return getProductUploadsDir();
}

function isEnabled() {
  return ENABLED;
}

const indexJobState = {
  status: 'idle',
  mode: null,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  logTail: '',
};

let debounceTimer = null;
let pendingAfterRun = false;

function appendLog(chunk) {
  const text = String(chunk || '');
  indexJobState.logTail = (indexJobState.logTail + text).slice(-8000);
}

function mapMatchImageUrl(match) {
  const basename = path.basename(match.filename || match.imageUrl || '');
  if (!basename || basename === '.' || basename === '/') {
    return match.imageUrl;
  }
  return productUploadPublicUrl(basename) || `/uploads/products/${basename}`;
}

function mapMatchFields(match) {
  if (!match) return match;
  return {
    ...match,
    imageUrl: mapMatchImageUrl(match),
  };
}

function mapSearchResponse(data) {
  if (!data) return data;
  const mapped = { ...data };
  if (Array.isArray(data.matches)) {
    mapped.matches = data.matches.map((m) => mapMatchFields(m));
  }
  if (Array.isArray(data.pickSuggestions)) {
    mapped.pickSuggestions = data.pickSuggestions.map((s) => mapMatchFields(s));
  }
  return mapped;
}

async function analyzeByImage(buffer, filename) {
  const form = new FormData();
  form.append('file', buffer, {
    filename: filename || 'query.jpg',
    contentType: 'image/jpeg',
  });

  const { data } = await axios.post(`${AI_SERVICE_URL}/analyze`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000,
  });

  return mapSearchResponse(data);
}

async function searchByImage(buffer, filename, topK = 25) {
  const form = new FormData();
  form.append('file', buffer, {
    filename: filename || 'query.jpg',
    contentType: 'image/jpeg',
  });

  const { data } = await axios.post(`${AI_SERVICE_URL}/search?top_k=${topK}`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000,
  });

  return mapSearchResponse(data);
}

async function fetchStats() {
  const { data } = await axios.get(`${AI_SERVICE_URL}/stats`, { timeout: 15000 });
  return {
    ...data,
    marketplaceImageRoot: getProductImagesDir(),
    aiServiceUrl: AI_SERVICE_URL,
    enabled: isEnabled(),
  };
}

async function fetchHealth() {
  const { data } = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 15000 });
  return data;
}

async function reloadIndex() {
  const { data } = await axios.post(`${AI_SERVICE_URL}/reload-index`, null, { timeout: 60000 });
  return data;
}

function runBuildIndex({ rebuild = false, resume = true } = {}) {
  if (!isEnabled()) {
    return Promise.reject(new Error('AI image search is disabled (AI_IMAGE_SEARCH_ENABLED=false)'));
  }

  if (indexJobState.status === 'running') {
    pendingAfterRun = true;
    return Promise.resolve({ queued: true, message: 'Index job already running; queued another run' });
  }

  const imageRoot = getProductImagesDir();
  if (!fs.existsSync(imageRoot)) {
    return Promise.reject(new Error(`Product images folder not found: ${imageRoot}`));
  }

  const buildScript = path.join(AI_IMAGE_SEARCH_DIR, 'build_index.py');
  if (!fs.existsSync(buildScript)) {
    return Promise.reject(
      new Error(`build_index.py not found at ${buildScript}. Set AI_IMAGE_SEARCH_DIR in .env`),
    );
  }

  const args = [buildScript, '--fast'];
  if (rebuild) args.push('--rebuild');
  else if (resume) args.push('--resume');

  const buildBatch = process.env.AI_BUILD_BATCH_SIZE || '128';
  const embedBatch = process.env.AI_EMBEDDING_BATCH_SIZE || '64';

  indexJobState.status = 'running';
  indexJobState.mode = rebuild ? 'rebuild' : resume ? 'incremental' : 'build';
  indexJobState.startedAt = new Date().toISOString();
  indexJobState.finishedAt = null;
  indexJobState.lastError = null;
  indexJobState.logTail = '';
  appendLog(`Using Python: ${AI_PYTHON_BIN}\n`);
  appendLog(`Image root: ${imageRoot}\n`);
  appendLog(`Fast build: skip verify, one image per SKU, batch=${buildBatch}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(AI_PYTHON_BIN, args, {
      cwd: AI_IMAGE_SEARCH_DIR,
      env: {
        ...process.env,
        IMAGE_ROOT: imageRoot,
        BUILD_SKIP_IMAGE_VERIFY: 'true',
        BUILD_DEDUPE_SKU: 'true',
        BUILD_BATCH_SIZE: buildBatch,
        EMBEDDING_BATCH_SIZE: embedBatch,
        EMBEDDED_IMAGES_MAX_SIDE: process.env.AI_EMBEDDED_MAX_SIDE || '352',
        OMP_NUM_THREADS: process.env.AI_OMP_THREADS || '4',
      },
      windowsHide: true,
    });

    child.stdout.on('data', (d) => appendLog(d));
    child.stderr.on('data', (d) => appendLog(d));

    child.on('error', (err) => {
      indexJobState.status = 'error';
      indexJobState.lastError = err.message;
      indexJobState.finishedAt = new Date().toISOString();
      reject(err);
    });

    child.on('close', async (code) => {
      indexJobState.finishedAt = new Date().toISOString();
      const runAgain = pendingAfterRun;
      pendingAfterRun = false;

      if (code !== 0) {
        indexJobState.status = 'error';
        const hint = indexJobState.logTail.includes('ModuleNotFoundError')
          ? ' Install Python deps: cd image-ai-search && .venv\\Scripts\\pip install -r requirements.txt'
          : '';
        indexJobState.lastError = `build_index exited with code ${code}${hint}`;
        if (runAgain) {
          setTimeout(() => {
            runBuildIndex({ rebuild: false, resume: true }).catch(() => {});
          }, 2000);
        }
        reject(new Error(indexJobState.lastError));
        return;
      }

      try {
        await reloadIndex();
        indexJobState.status = 'success';
        resolve({ success: true, mode: indexJobState.mode });
      } catch (reloadErr) {
        indexJobState.status = 'error';
        indexJobState.lastError = reloadErr.message;
        reject(reloadErr);
      }

      if (runAgain) {
        setTimeout(() => {
          runBuildIndex({ rebuild: false, resume: true }).catch(() => {});
        }, 2000);
      }
    });
  });
}

function scheduleIncrementalIndex() {
  if (!isEnabled()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuildIndex({ rebuild: false, resume: true }).catch((err) => {
      console.warn('[ai-image-search] incremental index failed:', err.message);
    });
  }, AI_INDEX_DEBOUNCE_MS);
}

function getIndexJobState() {
  return { ...indexJobState, pendingAfterRun, pythonBin: AI_PYTHON_BIN };
}

function getPythonBin() {
  return AI_PYTHON_BIN;
}

function notifyProductImagesChanged() {
  scheduleIncrementalIndex();
}

module.exports = {
  isEnabled,
  getProductImagesDir,
  analyzeByImage,
  searchByImage,
  fetchStats,
  fetchHealth,
  reloadIndex,
  runBuildIndex,
  scheduleIncrementalIndex,
  getIndexJobState,
  notifyProductImagesChanged,
  mapMatchImageUrl,
  getPythonBin,
};
