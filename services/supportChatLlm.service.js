const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const LLM_COOLDOWN_MS = Number(process.env.SUPPORT_CHAT_LLM_COOLDOWN_MS) || 10 * 60 * 1000;
const LLM_POLISH_ENABLED = process.env.SUPPORT_CHAT_LLM_POLISH !== 'false';

let llmCooldownUntil = 0;
let lastRateLimitLogAt = 0;

function isEnabled() {
  return Boolean(OPENAI_API_KEY);
}

function isInCooldown() {
  return Date.now() < llmCooldownUntil;
}

/** True only when API key exists and we are not in a 429/5xx cooldown window. */
function isAvailable() {
  return isEnabled() && !isInCooldown();
}

function isPolishEnabled() {
  return isAvailable() && LLM_POLISH_ENABLED;
}

function getCooldownRemainingMs() {
  return Math.max(0, llmCooldownUntil - Date.now());
}

function registerLlmFailure(err, label) {
  const status = Number(err?.response?.status || 0);
  const retryAfterHeader = err?.response?.headers?.['retry-after'];
  const retryAfterSec = Number(retryAfterHeader);
  const retryMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 0;

  if (status === 429 || status === 402 || status === 503) {
    llmCooldownUntil = Date.now() + Math.max(LLM_COOLDOWN_MS, retryMs);
    if (Date.now() - lastRateLimitLogAt > 60_000) {
      const mins = Math.ceil(getCooldownRemainingMs() / 60_000);
      console.warn(
        `[support-chat-llm] ${label}: OpenAI ${status || 'rate limit'} — pausing LLM for ~${mins} min (rule-based search continues)`,
      );
      lastRateLimitLogAt = Date.now();
    }
    return;
  }

  if (status === 401 || status === 403) {
    llmCooldownUntil = Date.now() + 60 * 60 * 1000;
    console.warn(`[support-chat-llm] ${label}: OpenAI auth error (${status}) — LLM disabled for 1 hour`);
    return;
  }

  console.warn(`[support-chat-llm] ${label} failed:`, err.message);
}

async function callChatJson(systemPrompt, userPrompt, label = 'request') {
  if (!isAvailable()) return null;

  try {
    const { data } = await axios.post(
      `${OPENAI_BASE_URL}/chat/completions`,
      {
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        validateStatus: (s) => s >= 200 && s < 300,
      },
    );

    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    registerLlmFailure(err, label);
    return null;
  }
}

/**
 * AI-first analysis: understand what the user wants, fix typos, extract structured search filters.
 */
async function analyzeUserRequest(message, context = {}) {
  try {
    const history = (context.recentMessages || [])
      .slice(-10)
      .map((m) => `${m.role}: ${m.text}`)
      .join('\n');

    const result = await callChatJson(
      [
        'You are the intent engine for Valliani jewelry B2B marketplace support chat.',
        'Read the user message (and recent history) and return strict JSON:',
        '{',
        '  "intent": "conversational" | "meta_question" | "needs_clarification" | "sku_lookup" | "inventory_summary" | "product_browse" | "human_handoff" | "greeting",',
        '  "clarificationType": "warehouse" | "general" | null,',
        '  "sku": string | null,',
        '  "displayQuery": string | null,',
        '  "searchKeywords": string[],',
        '  "productTypes": string[],',
        '  "metalHints": string[],',
        '  "stoneHints": string[],',
        '  "sortBy": "price_asc" | "price_desc" | "inventory_desc" | "relevance",',
        '  "includeProducts": boolean,',
        '  "includeWarehouseBreakdown": boolean,',
        '  "category": string | null',
        '}',
        'Rules:',
        '- Fix typos in keywords (serach→search, diomands/dimonds→diamond, geve→give, jewlery→jewelry).',
        '- "low to high" / "cheapest first" → sortBy price_asc. "high to low" → sortBy price_desc.',
        '- Strip filler words from displayQuery/searchKeywords: please, show, me, you, have, if, so, and, search, find, get, list.',
        '- product_browse when user wants to SEE/LIST products (e.g. "show gold rings", "search gold ring", "you have diamonds low to high").',
        '- searchKeywords = meaningful product terms only (e.g. ["gold","ring"], ["diamond"], ["18kt","yellow","gold","ring"]).',
        '- Match category/subcategory/brand from catalog taxonomy (e.g. DIAMOND JEWELRY > GENTS RING, brand NOVELLO).',
        '- "earring" must map to EARRINGS subcategories ONLY — never GENTS RING / LADYS RING.',
        '- "ring" must map to ring subcategories — never EARRINGS.',
        '- metalHints = metal types: gold, silver, 10kt, 14kt, 18kt, yellow, white, rose, platinum.',
        '- stoneHints = stones: diamond, ruby, sapphire, emerald, pearl, cz.',
        '- sortBy price_asc for "low to high", "cheapest", "low price". price_desc for "high to low". inventory_desc default for general browse.',
        '- sku_lookup ONLY for explicit SKU/item codes (numeric like 106322, or after word SKU). NEVER treat words like gold, ring, chain, diamond as SKU.',
        '- conversational for hi, yes, no, ok, help, thanks, vague short replies WITHOUT a product/inventory request.',
        '- meta_question for questions about the bot itself: founder, owner, who made you, who are you, your name, company history. NEVER product search.',
        '- needs_clarification when request is unclear or missing info (e.g. "show all warehouse" without SKU). Set clarificationType.',
        '- human_handoff when user wants live agent.',
        '- inventory_summary for "how many X in stock/available" including custom keywords like birthstone, birthstone jewelry. includeProducts true if user also asks to show SKUs/samples.',
        '- product_browse ONLY when user clearly wants jewelry products shown. NEVER for founder/owner/general chat.',
        '- includeProducts true ONLY for real product/inventory requests, never for meta_question.',
        '- If message mixes greeting + unrelated question (e.g. "hi who is your founder") → meta_question or conversational, includeProducts false.',
        '- Use conversation history for short follow-ups like "yes" after SKU suggestion.',
        'Examples:',
        '- "please search gold ring and show me" → product_browse, searchKeywords ["gold","ring"], productTypes ["ring"], displayQuery "gold ring", includeProducts true',
        '- "if you have diamonds show low to high" → product_browse, searchKeywords ["diamond"], productTypes ["diamond"], sortBy price_asc, includeProducts true',
        '- "find sku 106322" → sku_lookup, sku "106322", includeWarehouseBreakdown true',
        '- "hi who is your founder" → meta_question, includeProducts false, searchKeywords []',
        '- "how many birthstone jewelry available show some sku" → inventory_summary, searchKeywords ["birthstone"], includeProducts true',
        '- "show me all warehouse" without SKU → needs_clarification, clarificationType warehouse',
      ].join('\n'),
      history ? `Recent conversation:\n${history}\n\nLatest user message:\n${message}` : message,
      'analyze',
    );
    return result;
  } catch (err) {
    registerLlmFailure(err, 'analyze');
    return null;
  }
}

/**
 * Classify user intent. Falls back to null when OpenAI is unavailable.
 */
async function classifyIntent(message, context = {}) {
  try {
    const history = (context.recentMessages || [])
      .slice(-8)
      .map((m) => `${m.role}: ${m.text}`)
      .join('\n');

    const result = await callChatJson(
      [
        'You classify messages for a jewelry B2B marketplace internal support assistant.',
        'Return strict JSON:',
        '{',
        '  "intent": "conversational" | "sku_lookup" | "inventory_summary" | "product_browse" | "human_handoff" | "greeting" | "general_help",',
        '  "sku": string | null,',
        '  "searchTerm": string | null,',
        '  "category": string | null,',
        '  "includeWarehouseBreakdown": boolean,',
        '  "includeProducts": boolean',
        '}',
        'Rules:',
        '- conversational for hi, hello, yes, no, ok, what, help, thanks, vague short replies, or "can you help me". NEVER product search for these.',
        '- greeting for first-time hello without a data request.',
        '- sku_lookup when user asks to check/find/confirm a SKU or numeric item code (e.g. 106322, 163105).',
        '- includeWarehouseBreakdown true when user asks warehouse/store/location wise quantity.',
        '- product_browse when user asks to SHOW/LIST/GIVE/DISPLAY products (e.g. "show me gold chain products", "you have gold ring", "search gold ring").',
        '- For product_browse/product_search, searchTerm must be ONLY the product keywords (e.g. "gold ring", "18KT yellow gold ring") — strip filler words like please, show, search, serach, and, me, you, have.',
        '- inventory_summary for stock count questions (how many rings) — includeProducts false unless user asked to show products.',
        '- human_handoff when user wants a live person.',
        '- Use conversation history to interpret short replies like "yes" after a prior SKU suggestion.',
      ].join('\n'),
      history ? `Recent conversation:\n${history}\n\nLatest user message:\n${message}` : message,
      'classify',
    );
    return result;
  } catch (err) {
    registerLlmFailure(err, 'classify');
    return null;
  }
}

async function conversationalReply(message, context = {}) {
  try {
    const history = (context.recentMessages || [])
      .slice(-6)
      .map((m) => `${m.role}: ${m.text}`)
      .join('\n');
    const result = await callChatJson(
      [
        'You are Valliani marketplace support AI. Reply conversationally in 2-4 short sentences.',
        'Do NOT invent inventory numbers or product names.',
        'Guide the user to ask a specific question: SKU lookup, show products, category stock, image upload, or connect to human.',
        'Return JSON: { "text": string }',
      ].join('\n'),
      JSON.stringify({
        customerName: context.customerName || 'there',
        history,
        message,
      }),
      'conversational',
    );
    return result?.text?.trim() || null;
  } catch (err) {
    registerLlmFailure(err, 'conversational');
    return null;
  }
}

async function metaQuestionReply(message, context = {}) {
  try {
    const result = await callChatJson(
      [
        'You are Valliani Marketplace inventory support AI (not a general company FAQ bot).',
        'The user asked a meta/company question (founder, owner, who made you, etc.).',
        'Reply politely in 2-3 sentences: you help with live jewelry inventory, SKU stock, product search, and human handoff.',
        'Do NOT invent founder/owner names or company history.',
        'Suggest what they can ask next (SKU, product type, birthstone rings, warehouse qty for a SKU).',
        'Return JSON: { "text": string }',
      ].join('\n'),
      JSON.stringify({
        customerName: context.customerName || 'there',
        message,
      }),
      'meta',
    );
    return result?.text?.trim() || null;
  } catch (err) {
    registerLlmFailure(err, 'meta');
    return null;
  }
}

async function clarificationReply(message, context = {}) {
  try {
    const result = await callChatJson(
      [
        'You are Valliani marketplace support AI. The user request was unclear.',
        'Ask a short clarifying question based on clarificationType in context.',
        'warehouse: ask for SKU to show warehouse-wise quantities.',
        'general: ask whether they want product search, SKU lookup, stock count, or human agent.',
        'Do NOT show products. Return JSON: { "text": string }',
      ].join('\n'),
      JSON.stringify({
        customerName: context.customerName || 'there',
        clarificationType: context.clarificationType || 'general',
        message,
      }),
      'clarification',
    );
    return result?.text?.trim() || null;
  } catch (err) {
    registerLlmFailure(err, 'clarification');
    return null;
  }
}

/**
 * Rewrite factual assistant text in a polished tone without inventing data.
 */
async function polishResponse(userMessage, factualPayload) {
  if (!isPolishEnabled()) return null;
  try {
    const result = await callChatJson(
      [
        'You are Valliani marketplace professional support AI.',
        'Rewrite the assistant reply using ONLY the facts in factualPayload.',
        'Never invent SKUs, quantities, warehouses, prices, or products.',
        'Keep warehouse breakdowns as bullet lines.',
        'Use concise professional English. Markdown **bold** allowed for key numbers.',
        'Return JSON: { "text": string }',
      ].join('\n'),
      JSON.stringify({ userMessage, factualPayload }),
      'polish',
    );
    return result?.text?.trim() || null;
  } catch (err) {
    registerLlmFailure(err, 'polish');
    return null;
  }
}

module.exports = {
  isEnabled,
  isAvailable,
  isPolishEnabled,
  getCooldownRemainingMs,
  analyzeUserRequest,
  classifyIntent,
  polishResponse,
  conversationalReply,
  metaQuestionReply,
  clarificationReply,
};
