/** Keep in sync with `PLANS` in app/main.py (`GET /api/plans`). Paid tiers TBA. */
export const PLANS_FALLBACK = {
  tagline: "Paid plans are TBA. Everyone currently gets the full product.",
  note:
    "Chat: 2 open chats, 30 messages each. Jobs: limited to 10 due to cost (refresh once per hour). Quiz: 2 cycles per hour.",
  plans: [
    {
      id: "free",
      name: "Free",
      price: "TBA",
      price_period: "",
      badge: "TBA",
      blurb: "Full product access while paid plans are TBA.",
      features: [
        "2 chats · 30 messages each",
        "Delete a chat to free a slot or reset the message cap",
        "Job search limited to 10 due to cost · refresh once per hour",
        "Interview quiz: 2 cycles per hour",
        "Live PDF resume editor",
      ],
      restrictions: [],
      cta: "Coming soon",
      cta_disabled: true,
      featured: false,
    },
    {
      id: "careerexpert",
      name: "CareerExpert",
      price: "TBA",
      price_period: "",
      badge: "TBA",
      blurb: "Paid tiers coming soon.",
      features: ["TBA"],
      restrictions: [],
      cta: "Coming soon",
      cta_disabled: true,
      featured: true,
    },
    {
      id: "careerpro",
      name: "CareerPro",
      price: "TBA",
      price_period: "",
      badge: "TBA",
      blurb: "Paid tiers coming soon.",
      features: ["TBA"],
      restrictions: [],
      cta: "Coming soon",
      cta_disabled: true,
      featured: false,
    },
  ],
};

export function resolvePlansPayload(data) {
  const fallback = PLANS_FALLBACK;
  const plans = Array.isArray(data?.plans) && data.plans.length ? data.plans : fallback.plans;
  return {
    tagline: data?.tagline || fallback.tagline,
    note: data?.note || fallback.note,
    plans,
  };
}
