const KICK_EVENT_TTL_MS = 30_000;
const MAX_TRACKED_KICKS = 500;
const pendingKicks = new Map();

function kickKey(threadId, targetId) {
  return `${String(threadId)}:${String(targetId)}`;
}

function prunePendingKicks(now = Date.now()) {
  for (const [key, pending] of pendingKicks) {
    if (pending.expiresAt <= now) pendingKicks.delete(key);
  }
  while (pendingKicks.size > MAX_TRACKED_KICKS) {
    pendingKicks.delete(pendingKicks.keys().next().value);
  }
}

export function trackKickActor(threadId, targetId, actor) {
  const now = Date.now();
  prunePendingKicks(now);
  pendingKicks.set(kickKey(threadId, targetId), {
    actor: { ...actor },
    expiresAt: now + KICK_EVENT_TTL_MS,
  });
  prunePendingKicks(now);
}

export function takeKickActor(threadId, targetId) {
  const key = kickKey(threadId, targetId);
  const pending = pendingKicks.get(key);
  if (!pending) return null;
  pendingKicks.delete(key);
  return pending.expiresAt > Date.now() ? pending.actor : null;
}

export function clearKickActor(threadId, targetId) {
  pendingKicks.delete(kickKey(threadId, targetId));
}
