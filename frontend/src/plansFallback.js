/** Keep in sync with `PLANS` in app/main.py (`GET /api/plans`). */
export const PLANS_FALLBACK = {
  tagline:
    "Free proves the loop. Expert unlocks the studio. Pro runs an active search without hitting the wall.",
  note: "Checkout is not live yet — paid upgrades open soon. Limits below already match what Free enforces today.",
  plans: [
    {
      id: "free",
      name: "Free",
      price: "$0",
      price_period: "",
      badge: "Try the loop",
      blurb: "Learn Find → Score → Tailor → Practice. Cap-friendly by design.",
      features: [
        "1 chat · 60 messages",
        "Job hub: ~5 jobs",
        "1 interview quiz cycle",
        "Resume upload for chat + matching",
      ],
      restrictions: [
        "Cannot delete the chat",
        "No live PDF resume editor",
        "Job refreshes cooldown ~1 hour (scrapes less)",
        "No extra quiz rounds",
        "Fit scores / rewrites capped via chat limits",
      ],
      cta: "You're on Free",
      cta_disabled: true,
      featured: false,
    },
    {
      id: "careerexpert",
      name: "CareerExpert",
      price: "$19",
      price_period: "/mo",
      badge: "Best value",
      blurb: "Polish materials without burning Free’s chat budget.",
      features: [
        "More chats / higher message limit",
        "Job hub: up to 120 listings + faster refreshes",
        "Unlimited interview quiz rounds",
        "Unlimited fit scores",
        "Unlimited resume rewrites + cover letters",
        "Live multi-page PDF resume editor",
      ],
      restrictions: [],
      cta: "Coming soon",
      cta_disabled: true,
      featured: true,
    },
    {
      id: "careerpro",
      name: "CareerPro",
      price: "$39",
      price_period: "/mo",
      badge: "For active searches",
      blurb:
        "When Free feels cramped and Expert still isn’t enough headroom — Pro is the full coaching loop.",
      features: [
        "Everything in Expert (incl. live PDF editor)",
        "Job hub: up to 200 listings",
        "Highest limits across chat, jobs, and quiz",
        "Unlimited coaching loop — score, rewrite, practice without rationing",
        "Priority job matching to your prefs",
        "Early access to new tools as they ship",
      ],
      restrictions: [],
      cta: "Coming soon — join for Pro",
      cta_disabled: true,
      featured: false,
    },
  ],
};

export const EXPERT_LOCK_PERKS = [
  "Live multi-page PDF editor",
  "Unlimited rewrites + cover letters",
  "Unlimited fit scores",
];

function isStubFeature(f) {
  const t = String(f || "").trim().toUpperCase();
  return !t || t === "TBA" || t === "TODO" || t === "COMING SOON";
}

/** Prefer API plans, but never show empty / TBA stub feature lists. */
export function resolvePlansPayload(data) {
  const fallback = PLANS_FALLBACK;
  const plans = Array.isArray(data?.plans) ? data.plans : null;
  const usable =
    plans?.length &&
    plans.every(
      (p) =>
        Array.isArray(p.features) &&
        p.features.length > 0 &&
        !p.features.every(isStubFeature) &&
        String(p.price || "").toUpperCase() !== "TBA"
    );

  return {
    tagline: data?.tagline || fallback.tagline,
    note: data?.note || fallback.note,
    plans: usable ? plans : fallback.plans,
  };
}
