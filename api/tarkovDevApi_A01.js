/**
 * api.js – Fully optimized tarkov.dev GraphQL client
 * Performance: Server‑side filtering, localStorage caching, O(1) Map lookups
 */

// ================================================================
//  CONFIGURATION
// ================================================================

const API_URL = 'https://api.tarkov.dev/graphql';
const CACHE_PREFIX = 'tarkov_';
const DEFAULT_TTL = 3600000; // 1 hour (in ms)

// ================================================================
//  QUERY BUILDER – returns the leanest possible request
// ================================================================

const QUEST_QUERY = `
  query($trader: String!) {
    quests(where: { trader: { name: { eq: $trader } } }) {
      id
      name
      description
      objectives { description }
      rewards {
        experience
        roubles
        items {
          quantity
          item { name shortName }
        }
        traderStanding {
          standing
          trader { name }
        }
      }
      trader { name }
      predecessorQuests { id name }
      successors { id name }
    }
  }
`;

// ================================================================
//  CACHE HELPERS – with TTL and size limits
// ================================================================

function getCacheKey(trader) {
    return `${CACHE_PREFIX}${trader.toLowerCase()}_quests_v1`;
}

function getCached(trader) {
    try {
        const key = getCacheKey(trader);
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp > DEFAULT_TTL) {
            localStorage.removeItem(key); // expired, clean it
            return null;
        }
        return data;
    } catch (_) {
        return null; // corrupted or inaccessible
    }
}

function setCached(trader, data) {
    try {
        const key = getCacheKey(trader);
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (_) {
        // silently ignore storage errors (quota, private browsing)
    }
}

// ================================================================
//  GRAPHQL FETCH – with timeout and abort support
// ================================================================

async function fetchGraphQL(query, variables, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        if (json.errors) {
            throw new Error(json.errors[0].message);
        }
        return json.data;
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
            throw new Error('Request timed out after ' + timeout + 'ms');
        }
        throw err;
    }
}

// ================================================================
//  PUBLIC API – fetch quests for a specific trader
// ================================================================

/**
 * Fetch quests for a given trader, with built‑in caching.
 * @param {string} traderName – e.g. "Prapor", "Therapist", etc.
 * @param {object} options
 * @param {number} options.ttl – cache TTL in ms (default: 1 hour)
 * @param {boolean} options.forceRefresh – bypass cache
 * @param {number} options.timeout – fetch timeout in ms (default: 10000)
 * @returns {Promise<Array>} – array of raw quest objects
 */
export async function fetchQuestsByTrader(traderName, options = {}) {
    const { ttl = DEFAULT_TTL, forceRefresh = false, timeout = 10000 } = options;

    if (!traderName || typeof traderName !== 'string') {
        throw new Error('traderName is required and must be a string');
    }

    // 1. Check cache (unless forced refresh)
    if (!forceRefresh) {
        const cached = getCached(traderName);
        if (cached) {
            // Return a copy to prevent accidental mutation of cache
            return JSON.parse(JSON.stringify(cached));
        }
    }

    // 2. Fetch fresh from API
    const data = await fetchGraphQL(QUEST_QUERY, { trader: traderName }, timeout);

    if (!data || !data.quests) {
        throw new Error(`No quests data returned for trader: ${traderName}`);
    }

    const quests = data.quests;

    // 3. Store in cache
    setCached(traderName, quests);

    // 4. Return a copy
    return JSON.parse(JSON.stringify(quests));
}

// ================================================================
//  TREE BUILDER – converts raw quests into a hierarchical tree
// ================================================================

/**
 * Build a parent‑child tree from raw quest data.
 * @param {Array} rawQuests – array of quest objects from the API
 * @param {string} traderName – used for the virtual root node
 * @returns {object} – virtual root node with `children` array
 */
export function buildQuestTree(rawQuests, traderName) {
    if (!rawQuests || rawQuests.length === 0) {
        return {
            name: `🪖 ${traderName || 'Unknown'} (All Quests)`,
            requirements: 'No quests found',
            rewards: ['0 total quests'],
            children: []
        };
    }

    // 1. Build Map for O(1) lookups
    const questMap = new Map();
    for (const q of rawQuests) {
        questMap.set(q.id, q);
    }

    // 2. Convert raw quest to internal node format (lean)
    function mapQuest(apiQuest) {
        // Requirements string
        const reqParts = [];
        if (apiQuest.description) reqParts.push(apiQuest.description);
        if (apiQuest.objectives) {
            for (const obj of apiQuest.objectives) {
                if (obj.description) reqParts.push(`- ${obj.description}`);
            }
        }

        // Rewards array
        const rewardList = [];
        const r = apiQuest.rewards;
        if (r) {
            if (r.experience) rewardList.push(`+${r.experience} EXP`);
            if (r.roubles) rewardList.push(`${r.roubles} Roubles`);
            if (r.items) {
                for (const ir of r.items) {
                    const name = ir.item?.name || ir.item?.shortName || 'Unknown Item';
                    rewardList.push(`${ir.quantity}× ${name}`);
                }
            }
            if (r.traderStanding) {
                for (const ts of r.traderStanding) {
                    rewardList.push(`+${ts.standing} standing with ${ts.trader?.name || 'Trader'}`);
                }
            }
        }

        return {
            name: apiQuest.name,
            requirements: reqParts.join(' • ') || 'none',
            rewards: rewardList.length > 0 ? rewardList : ['none'],
            children: [],
            _apiId: apiQuest.id // internal reference
        };
    }

    // 3. Recursive build with Set to avoid cycles
    const processed = new Set();

    function buildNode(apiQuest) {
        if (processed.has(apiQuest.id)) return null;
        processed.add(apiQuest.id);

        const node = mapQuest(apiQuest);
        if (apiQuest.successors) {
            for (const succ of apiQuest.successors) {
                const childApi = questMap.get(succ.id);
                if (childApi && !processed.has(childApi.id)) {
                    const childNode = buildNode(childApi);
                    if (childNode) node.children.push(childNode);
                }
            }
        }
        return node;
    }

    // 4. Find roots (no predecessor within our filtered set)
    const rootIds = [];
    for (const q of rawQuests) {
        let hasPred = false;
        if (q.predecessorQuests) {
            for (const pred of q.predecessorQuests) {
                if (questMap.has(pred.id)) {
                    hasPred = true;
                    break;
                }
            }
        }
        if (!hasPred) rootIds.push(q.id);
    }

    // 5. Build root nodes
    const rootNodes = [];
    for (const id of rootIds) {
        const node = buildNode(questMap.get(id));
        if (node) rootNodes.push(node);
    }

    // 6. Virtual root
    return {
        name: `🪖 ${traderName || 'Trader'} (All Quests)`,
        requirements: `Quest tree for ${traderName} – fetched from tarkov.dev`,
        rewards: [`${rawQuests.length} total quests`],
        children: rootNodes
    };
}

// ================================================================
//  CONVENIENCE – fetch and build tree in one call
// ================================================================

/**
 * Fetch quests for a trader and immediately build the tree.
 * @param {string} traderName
 * @param {object} options – same as fetchQuestsByTrader
 * @returns {Promise<object>} – virtual root node
 */
export async function fetchQuestTree(traderName, options = {}) {
    const raw = await fetchQuestsByTrader(traderName, options);
    return buildQuestTree(raw, traderName);
}

// ================================================================
//  UTILITY – clear cached data for a specific trader or all
// ================================================================

export function clearCache(traderName = null) {
    if (traderName) {
        localStorage.removeItem(getCacheKey(traderName));
    } else {
        // Clear all tarkov_ prefixed keys
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith(CACHE_PREFIX)) {
                localStorage.removeItem(key);
            }
        }
    }
}