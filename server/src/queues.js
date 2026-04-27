/** @typedef {'male' | 'female' | 'other'} Gender */
/** @typedef {'male' | 'female' | 'both'} Seeking */

/**
 * Redis ZSET key: queue:{declared}_seeking_{interested}
 * @param {string} declared
 * @param {string} seeking
 */
export function queueKey(declared, seeking) {
  return `queue:${declared}_seeking_${seeking}`;
}

const ALL_DECLARED = /** @type {const} */ (["male", "female", "other"]);

/**
 * Opposite queues to drain (FIFO via ZPOPMIN) when this user joins the pool.
 * Order: tighter intent first (exact seeking), then partner_seeking_both.
 * @param {string} declared
 * @param {string} interested
 * @returns {string[]}
 */
export function complementaryQueues(declared, interested) {
  /** @type {string[]} */
  const keys = [];
  const seen = new Set();

  const add = (d, s) => {
    const k = queueKey(d, s);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  };

  const seekTargets =
    interested === "both" ? [...ALL_DECLARED] : [interested];

  for (const partnerDeclared of seekTargets) {
    if (declared !== "both") {
      add(partnerDeclared, declared);
      add(partnerDeclared, "both");
    }
  }

  return keys;
}

/**
 * @param {unknown } g
 * @param {unknown} s
 * @returns {g is DeclaredGender}
 */
function isDeclared(g) {
  return g === "male" || g === "female" || g === "other";
}

/**
 * @param {unknown} s
 * @returns {s is InterestedIn}
 */
function isSeeking(s) {
  return s === "male" || s === "female" || s === "both";
}

/**
 * @param {unknown} payload
 * @returns {{ userId: string; gender: Gender; seeking: Seeking } | null}
 */
export function parseJoinPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const { userId, gender, seeking } = /** @type {Record<string, unknown>} */ (
    payload
  );
  if (typeof userId !== "string" || !userId.trim()) return null;
  if (!isDeclared(gender)) return null;
  if (!isSeeking(seeking)) return null;
  return { userId: userId.trim(), gender, seeking };
}
