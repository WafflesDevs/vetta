import { api } from "./api";

let cache = null;
let inflight = null;

export function jobsCacheKey(profile) {
  return `${(profile?.target_roles || "").trim()}|${(profile?.locations || "").trim()}`;
}

export function getCachedJobs(profile) {
  const key = jobsCacheKey(profile);
  if (cache && cache.key === key) return cache.data;
  return null;
}

export function clearJobsCache() {
  cache = null;
  inflight = null;
}

export function patchCachedSaves(profile, { liked, applied, external, recommended }) {
  const key = jobsCacheKey(profile);
  const base = (cache && cache.key === key && cache.data) || {
    recommended: recommended || [],
    jobs: recommended || [],
    liked: [],
    applied: [],
    external: [],
    counts: {},
  };
  const nextRecommended = recommended ?? base.recommended ?? base.jobs ?? [];
  const nextLiked = liked ?? base.liked ?? [];
  const nextApplied = applied ?? base.applied ?? [];
  const nextExternal = external ?? base.external ?? [];
  const data = {
    ...base,
    recommended: nextRecommended,
    jobs: nextRecommended,
    liked: nextLiked,
    applied: nextApplied,
    external: nextExternal,
    counts: {
      ...(base.counts || {}),
      recommended: nextRecommended.length,
      liked: nextLiked.length,
      applied: nextApplied.length,
      external: nextExternal.length,
    },
  };
  cache = { key, data, at: Date.now() };
  return data;
}

export function prefetchJobs(profile) {
  if (!(profile?.target_roles || "").trim()) return null;
  const key = jobsCacheKey(profile);
  if (cache && cache.key === key) {
    return Promise.resolve(cache.data);
  }
  if (inflight && inflight.key === key) {
    return inflight.promise;
  }

  const promise = api("/api/careers/hub")
    .then((data) => {
      cache = { key, data, at: Date.now() };
      if (inflight?.key === key) inflight = null;
      return data;
    })
    .catch((err) => {
      if (inflight?.key === key) inflight = null;
      throw err;
    });

  inflight = { key, promise };
  return promise;
}

export async function loadJobs(profile, { force = false } = {}) {
  if (!force) {
    const hit = getCachedJobs(profile);
    if (hit) return hit;
    if (inflight && inflight.key === jobsCacheKey(profile)) {
      return inflight.promise;
    }
  } else {
    clearJobsCache();
  }
  const data = await prefetchJobs(profile);
  return data;
}
