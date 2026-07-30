"""Stripe Checkout + Customer Portal + webhook plan sync."""
from __future__ import annotations

import logging
from typing import Any

import stripe

from app.config import (
    APP_URL,
    STRIPE_PRICE_EXPERT,
    STRIPE_PRICE_PRO,
    STRIPE_PRODUCT_EXPERT,
    STRIPE_PRODUCT_PRO,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
)
from app.db import get_admin_client

logger = logging.getLogger("vetta.stripe")

PLAN_EXPERT = "careerexpert"
PLAN_PRO = "careerpro"
PLAN_FREE = "free"

CHECKOUT_PLANS = {PLAN_EXPERT, PLAN_PRO}
LIVE_SUB_STATUSES = ("active", "trialing", "past_due")


def _log(msg: str, *args: Any) -> None:
    """Always surface billing errors in uvicorn stdout."""
    text = msg % args if args else msg
    logger.warning(text)
    print(f"[vetta.stripe] {text}", flush=True)


def stripe_configured() -> bool:
    return bool(STRIPE_SECRET_KEY and STRIPE_PRICE_EXPERT and STRIPE_PRICE_PRO)


def _configure() -> None:
    if not STRIPE_SECRET_KEY:
        raise RuntimeError("STRIPE_SECRET_KEY is not set")
    stripe.api_key = STRIPE_SECRET_KEY


def price_id_for_plan(plan: str) -> str:
    plan = (plan or "").strip().lower()
    if plan in {"careerexpert", "expert"}:
        if not STRIPE_PRICE_EXPERT:
            raise RuntimeError("STRIPE_PRICE_EXPERT is not set")
        return STRIPE_PRICE_EXPERT
    if plan in {"careerpro", "pro"}:
        if not STRIPE_PRICE_PRO:
            raise RuntimeError("STRIPE_PRICE_PRO is not set")
        return STRIPE_PRICE_PRO
    raise ValueError(f"Unknown plan: {plan}")


def normalize_checkout_plan(plan: str) -> str:
    raw = (plan or "").strip().lower()
    if raw in {"careerexpert", "expert"}:
        return PLAN_EXPERT
    if raw in {"careerpro", "pro"}:
        return PLAN_PRO
    raise ValueError('plan must be "careerexpert" or "careerpro"')


def plan_from_price_or_product(price_id: str | None, product_id: str | None) -> str | None:
    if price_id and price_id == STRIPE_PRICE_EXPERT:
        return PLAN_EXPERT
    if price_id and price_id == STRIPE_PRICE_PRO:
        return PLAN_PRO
    if product_id and product_id == STRIPE_PRODUCT_EXPERT:
        return PLAN_EXPERT
    if product_id and product_id == STRIPE_PRODUCT_PRO:
        return PLAN_PRO
    return None


def _price_and_product_ids(price: Any) -> tuple[str | None, str | None]:
    """Extract price/product ids from a Stripe Price object, dict, or bare id string."""
    if price is None:
        return None, None
    if isinstance(price, str):
        return price or None, None
    price_id = _get(price, "id")
    if not price_id and hasattr(price, "get"):
        try:
            price_id = price.get("id")
        except Exception:
            price_id = None
    product = _get(price, "product")
    if product is None and hasattr(price, "get"):
        try:
            product = price.get("product")
        except Exception:
            product = None
    product_id = product if isinstance(product, str) else _get(product, "id")
    return (str(price_id) if price_id else None), (
        str(product_id) if product_id else None
    )


def plan_from_subscription(sub: dict | Any) -> str:
    """Map an active subscription to careerexpert / careerpro; else free.

    Cancel-at-period-end keeps paid access until Stripe ends the period
    (status becomes canceled). Renew/pay → stay on plan; no renew → Free.
    """
    status = str(_get(sub, "status") or "").lower()
    if status in {"canceled", "incomplete_expired", "unpaid"}:
        return PLAN_FREE
    if status in {"paused"}:
        return PLAN_FREE
    data = _subscription_items(sub)
    for item in data:
        # Prefer expanded price; fall back to legacy item.plan (often the price id).
        price = _get(item, "price")
        price_id, product_id = _price_and_product_ids(price)
        if not price_id:
            legacy = _get(item, "plan")
            price_id, product_id = _price_and_product_ids(legacy)
        plan = plan_from_price_or_product(price_id, product_id)
        if plan:
            return plan
    # Checkout always stamps metadata.plan — use as last resort if price env drift.
    meta = _get(sub, "metadata") or {}
    if not isinstance(meta, dict) and meta is not None:
        meta = dict(meta) if hasattr(meta, "keys") else {}
    raw_plan = _get(meta, "plan") if isinstance(meta, dict) else getattr(meta, "plan", None)
    if raw_plan:
        try:
            return normalize_checkout_plan(str(raw_plan))
        except ValueError:
            pass
    return PLAN_FREE


def _get(obj: Any, key: str) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def app_origin() -> str:
    return (APP_URL or "http://localhost:5173").rstrip("/")


def soft_update_profile(user_id: str, fields: dict) -> bool:
    """Update profiles via service role; verify write landed (RLS-safe)."""
    if not user_id or not fields:
        return False
    from app.config import SUPABASE_SECRET_KEY

    if not SUPABASE_SECRET_KEY:
        _log(
            "SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY missing — "
            "cannot persist profiles.plan (anon key is blocked by RLS)"
        )
        return False
    try:
        admin = get_admin_client()
        # Ensure row exists (signup trigger can lag / miss).
        existing = (
            admin.table("profiles")
            .select("id")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not (existing.data or {}).get("id"):
            admin.table("profiles").upsert(
                {"id": user_id, "plan": fields.get("plan", PLAN_FREE), **fields}
            ).execute()
        else:
            admin.table("profiles").update(fields).eq("id", user_id).execute()

        cols = ",".join(["id", *fields.keys()])
        check = (
            admin.table("profiles")
            .select(cols)
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        row = check.data or {}
        if not row.get("id"):
            _log(
                "soft profile update: no row for %s after update fields=%s",
                user_id,
                list(fields),
            )
            return False
        for key, want in fields.items():
            if key not in row:
                _log(
                    "soft profile update: column %s MISSING on profiles for %s — "
                    "run in Supabase SQL: alter table public.profiles "
                    "add column if not exists plan text default 'free'; "
                    "alter table public.profiles add column if not exists "
                    "stripe_customer_id text;",
                    key,
                    user_id,
                )
                return False
            got = row.get(key)
            if got != want:
                _log(
                    "soft profile update: %s not persisted for %s (got %r want %r)",
                    key,
                    user_id,
                    got,
                    want,
                )
                return False
        return True
    except Exception as exc:
        msg = str(exc)
        if "plan" in msg.lower() and (
            "column" in msg.lower() or "schema cache" in msg.lower()
        ):
            _log(
                "profiles.plan column missing/unavailable — run: "
                "alter table public.profiles add column if not exists plan text default 'free'; "
                "alter table public.profiles add column if not exists stripe_customer_id text; "
                "error=%s",
                msg,
            )
        else:
            _log(
                "soft profile update failed for %s: %s fields=%s",
                user_id,
                exc,
                list(fields),
            )
        return False


def _is_paid_plan(plan: str | None) -> bool:
    p = (plan or PLAN_FREE).strip().lower()
    return p in {PLAN_EXPERT, PLAN_PRO, "expert", "pro"}


def get_profile_plan(user_id: str) -> str | None:
    """Read current profiles.plan via service role (None if unavailable)."""
    if not user_id:
        return None
    try:
        admin = get_admin_client()
        row = (
            admin.table("profiles")
            .select("plan")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        return (row.data or {}).get("plan")
    except Exception as exc:
        _log("get_profile_plan failed for %s: %s", user_id, exc)
        return None


def delete_user_chat_data(user_id: str) -> dict:
    """
    Wipe chats + messages for a user (paid → free cancel cleanup).
    Keeps profile prefs / resume. Uses service role to bypass RLS.
    """
    if not user_id:
        return {"deleted_messages": 0, "deleted_chats": 0, "ok": False}
    try:
        admin = get_admin_client()
        # Delete messages first (FK), then chats.
        msgs = (
            admin.table("messages")
            .delete()
            .eq("user_id", user_id)
            .execute()
        )
        chats = (
            admin.table("chats")
            .delete()
            .eq("user_id", user_id)
            .execute()
        )
        n_msgs = len(msgs.data or [])
        n_chats = len(chats.data or [])
        _log(
            "cancel cleanup: deleted %s messages + %s chats for user=%s",
            n_msgs,
            n_chats,
            user_id,
        )
        return {
            "deleted_messages": n_msgs,
            "deleted_chats": n_chats,
            "ok": True,
        }
    except Exception as exc:
        _log("delete_user_chat_data failed for %s: %s", user_id, exc)
        return {"deleted_messages": 0, "deleted_chats": 0, "ok": False, "error": str(exc)}


def set_user_plan(
    user_id: str,
    plan: str,
    *,
    stripe_customer_id: str | None = None,
    previous_plan: str | None = None,
) -> bool:
    """
    Persist profiles.plan. When transitioning paid → free, wipe chat data
    so Free starts with a clean slate (resume/prefs kept).
    """
    plan = (plan or PLAN_FREE).strip().lower()
    if plan in {"expert"}:
        plan = PLAN_EXPERT
    elif plan in {"pro"}:
        plan = PLAN_PRO
    elif plan not in {PLAN_FREE, PLAN_EXPERT, PLAN_PRO}:
        plan = PLAN_FREE

    if previous_plan is None:
        previous_plan = get_profile_plan(user_id)

    fields: dict = {"plan": plan}
    if stripe_customer_id:
        fields["stripe_customer_id"] = stripe_customer_id
    ok = soft_update_profile(user_id, fields)
    if not ok and stripe_customer_id:
        # Retry plan-only if stripe_customer_id column is missing
        ok = soft_update_profile(user_id, {"plan": plan})

    if ok and _is_paid_plan(previous_plan) and not _is_paid_plan(plan):
        delete_user_chat_data(user_id)

    return ok


def _subscription_items(sub: dict | Any) -> list:
    items = _get(sub, "items") or {}
    data = _get(items, "data") if not isinstance(items, list) else items
    return list(data or [])


def _item_price_id(item: dict | Any) -> str | None:
    price_id, _ = _price_and_product_ids(_get(item, "price"))
    if price_id:
        return price_id
    price_id, _ = _price_and_product_ids(_get(item, "plan"))
    return price_id


def _list_live_subscriptions(customer_id: str) -> list:
    """Active / trialing / past_due subs (anything that can still bill)."""
    out: list = []
    for status in LIVE_SUB_STATUSES:
        page = stripe.Subscription.list(
            customer=customer_id,
            status=status,
            limit=10,
            expand=["data.items.data.price"],
        )
        out.extend(list(page.data or []))
    return out


def _cancel_subscription(sub_id: str) -> None:
    try:
        stripe.Subscription.cancel(sub_id)
    except Exception as exc:
        _log("failed to cancel subscription %s: %s", sub_id, exc)


def _cancel_other_live_subs(customer_id: str, keep_sub_id: str | None) -> None:
    if not customer_id:
        return
    for sub in _list_live_subscriptions(customer_id):
        sid = _get(sub, "id")
        if not sid or sid == keep_sub_id:
            continue
        _log("canceling extra live sub %s (keeping %s)", sid, keep_sub_id)
        _cancel_subscription(str(sid))


def sync_user_plan_from_stripe(
    *,
    user_id: str,
    email: str | None = None,
    stripe_customer_id: str | None = None,
) -> dict:
    """
    Source of truth: Stripe subscriptions → profiles.plan.
    Active/trialing/past_due Expert or Pro wins; otherwise free.
    """
    _configure()
    customer_id = (stripe_customer_id or "").strip() or None

    if not customer_id:
        try:
            found = stripe.Customer.search(
                query=f"metadata['supabase_user_id']:'{user_id}'",
                limit=1,
            )
            if found.data:
                customer_id = found.data[0]["id"]
        except Exception as exc:
            _log("stripe sync customer search failed for %s: %s", user_id, exc)

    if not customer_id and email:
        try:
            listed = stripe.Customer.list(email=email, limit=5)
            for c in listed.data or []:
                meta = _get(c, "metadata") or {}
                if str(_get(meta, "supabase_user_id") or "") == str(user_id):
                    customer_id = _get(c, "id")
                    break
            if not customer_id and listed.data:
                # Single email match with no conflicting metadata
                if len(listed.data) == 1:
                    customer_id = listed.data[0]["id"]
        except Exception as exc:
            _log("stripe sync customer list-by-email failed: %s", exc)

    if not customer_id:
        ok = set_user_plan(user_id, PLAN_FREE)
        return {
            "plan": PLAN_FREE,
            "synced": ok,
            "stripe_customer_id": None,
            "reason": "no_stripe_customer",
        }

    best = PLAN_FREE
    try:
        for sub in _list_live_subscriptions(customer_id):
            plan = plan_from_subscription(sub)
            if plan == PLAN_PRO:
                best = PLAN_PRO
                break
            if plan == PLAN_EXPERT and best != PLAN_PRO:
                best = PLAN_EXPERT
    except Exception as exc:
        _log("stripe sync subscription list failed for %s: %s", user_id, exc)
        raise

    ok = set_user_plan(user_id, best, stripe_customer_id=customer_id)
    if not ok:
        _log(
            "profile_update_failed user=%s plan=%s customer=%s — "
            "check SUPABASE_SECRET_KEY and profiles.plan column",
            user_id,
            best,
            customer_id,
        )
    else:
        _log(
            "synced user=%s plan=%s customer=%s",
            user_id,
            best,
            customer_id,
        )
    return {
        "plan": best,
        "synced": ok,
        "stripe_customer_id": customer_id,
        "reason": "ok" if ok else "profile_update_failed",
    }


def get_or_create_customer(*, user_id: str, email: str | None, existing_customer_id: str | None) -> str:
    _configure()
    if existing_customer_id:
        return existing_customer_id
    # Reuse a prior Stripe customer for this Supabase user (avoids duplicates when
    # stripe_customer_id failed to persist during an earlier checkout).
    try:
        found = stripe.Customer.search(
            query=f"metadata['supabase_user_id']:'{user_id}'",
            limit=1,
        )
        if found.data:
            cid = found.data[0]["id"]
            soft_update_profile(user_id, {"stripe_customer_id": cid})
            return cid
    except Exception as exc:
        _log("stripe customer search failed for %s: %s", user_id, exc)
    customer = stripe.Customer.create(
        email=email or None,
        metadata={"supabase_user_id": user_id},
    )
    cid = customer["id"]
    soft_update_profile(user_id, {"stripe_customer_id": cid})
    return cid


def create_checkout_session(
    *,
    user_id: str,
    email: str | None,
    plan: str,
    stripe_customer_id: str | None = None,
) -> dict:
    """
    First-time payers → hosted Stripe Checkout (checkout.stripe.com).
    Existing live subscribers → in-place price switch (no second subscription).
    """
    _configure()
    plan = normalize_checkout_plan(plan)
    price_id = price_id_for_plan(plan)
    origin = app_origin()
    customer_id = get_or_create_customer(
        user_id=user_id,
        email=email,
        existing_customer_id=stripe_customer_id,
    )

    live = _list_live_subscriptions(customer_id)
    if live:
        # Prefer a sub already on the target price; else first live sub.
        primary = None
        for sub in live:
            items = _subscription_items(sub)
            if not items:
                sub = stripe.Subscription.retrieve(
                    _get(sub, "id"), expand=["items.data.price"]
                )
                items = _subscription_items(sub)
            if items and _item_price_id(items[0]) == price_id:
                primary = sub
                break
        if primary is None:
            primary = live[0]
            items = _subscription_items(primary)
            if not items:
                primary = stripe.Subscription.retrieve(
                    _get(primary, "id"), expand=["items.data.price"]
                )
                items = _subscription_items(primary)

        if not items:
            # Broken live sub — cancel all and fall through to Checkout.
            for sub in live:
                sid = _get(sub, "id")
                if sid:
                    _cancel_subscription(str(sid))
        else:
            item = items[0]
            item_id = _get(item, "id")
            current_price = _item_price_id(item)
            primary_id = str(_get(primary, "id"))

            if current_price == price_id:
                # Exact plan already billing — sync only (no Checkout, no double charge).
                _cancel_other_live_subs(customer_id, primary_id)
                ok = set_user_plan(user_id, plan, stripe_customer_id=customer_id)
                return {
                    "id": primary_id,
                    "url": f"{origin}/app/plans?checkout=success",
                    "switched": True,
                    "already": True,
                    "checkout": False,
                    "plan_synced": ok,
                }

            # Path A: switch price in place (Expert ↔ Pro) with proration.
            stripe.Subscription.modify(
                primary_id,
                items=[{"id": item_id, "price": price_id}],
                metadata={"supabase_user_id": user_id, "plan": plan},
                proration_behavior="create_prorations",
            )
            _cancel_other_live_subs(customer_id, primary_id)
            ok = set_user_plan(user_id, plan, stripe_customer_id=customer_id)
            return {
                "id": primary_id,
                "url": f"{origin}/app/plans?checkout=success",
                "switched": True,
                "already": False,
                "checkout": False,
                "plan_synced": ok,
            }

    # Brand-new payer (or cleaned broken state) → hosted Checkout.
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        client_reference_id=user_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{origin}/app/plans?checkout=success",
        cancel_url=f"{origin}/app/plans?checkout=cancel",
        metadata={"supabase_user_id": user_id, "plan": plan},
        subscription_data={"metadata": {"supabase_user_id": user_id, "plan": plan}},
        allow_promotion_codes=True,
    )
    return {
        "id": session["id"],
        "url": session["url"],
        "checkout": True,
        "switched": False,
        "already": False,
    }


def create_portal_session(*, stripe_customer_id: str) -> dict:
    _configure()
    if not stripe_customer_id:
        raise ValueError("No Stripe customer on this account yet")
    origin = app_origin()
    session = stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{origin}/app/settings",
    )
    return {"url": session["url"]}


def construct_event(payload: bytes, sig_header: str | None):
    _configure()
    if not STRIPE_WEBHOOK_SECRET:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET is not set")
    return stripe.Webhook.construct_event(payload, sig_header or "", STRIPE_WEBHOOK_SECRET)


def _user_id_from_session(session: dict | Any) -> str | None:
    meta = _get(session, "metadata") or {}
    uid = _get(meta, "supabase_user_id") or _get(session, "client_reference_id")
    return str(uid) if uid else None


def handle_checkout_completed(session: dict | Any) -> None:
    user_id = _user_id_from_session(session)
    if not user_id:
        _log("checkout.session.completed missing user id")
        return
    meta = _get(session, "metadata") or {}
    plan = normalize_checkout_plan(_get(meta, "plan") or PLAN_EXPERT)
    customer = _get(session, "customer")
    customer_id = customer if isinstance(customer, str) else _get(customer, "id")
    sub = _get(session, "subscription")
    sub_id = sub if isinstance(sub, str) else _get(sub, "id")
    ok = set_user_plan(user_id, plan, stripe_customer_id=customer_id)
    if not ok:
        _log("checkout.session.completed plan write failed user=%s plan=%s", user_id, plan)
    # Path B safety: never leave an older live sub billing alongside the new one.
    if customer_id:
        _cancel_other_live_subs(str(customer_id), str(sub_id) if sub_id else None)


def handle_subscription_updated(sub: dict | Any) -> None:
    meta = _get(sub, "metadata") or {}
    user_id = _get(meta, "supabase_user_id")
    customer = _get(sub, "customer")
    customer_id = customer if isinstance(customer, str) else _get(customer, "id")
    if not user_id and customer_id:
        user_id = _lookup_user_by_customer(customer_id)
    if not user_id:
        _log("subscription event missing user id")
        return
    plan = plan_from_subscription(sub)
    # If this sub alone is free/canceled, still honor any other live sub.
    if plan == PLAN_FREE and customer_id:
        try:
            for other in _list_live_subscriptions(str(customer_id)):
                if _get(other, "id") == _get(sub, "id"):
                    continue
                p = plan_from_subscription(other)
                if p == PLAN_PRO:
                    plan = PLAN_PRO
                    break
                if p == PLAN_EXPERT:
                    plan = PLAN_EXPERT
        except Exception as exc:
            _log("subscription.updated live-list failed: %s", exc)
    ok = set_user_plan(str(user_id), plan, stripe_customer_id=customer_id)
    if not ok:
        _log("subscription.updated plan write failed user=%s plan=%s", user_id, plan)


def handle_subscription_deleted(sub: dict | Any) -> None:
    meta = _get(sub, "metadata") or {}
    user_id = _get(meta, "supabase_user_id")
    customer = _get(sub, "customer")
    customer_id = customer if isinstance(customer, str) else _get(customer, "id")
    if not user_id and customer_id:
        user_id = _lookup_user_by_customer(customer_id)
    if not user_id:
        _log("subscription.deleted missing user id")
        return
    # Only drop to free if no other live sub remains.
    best = PLAN_FREE
    if customer_id:
        try:
            for other in _list_live_subscriptions(str(customer_id)):
                if _get(other, "id") == _get(sub, "id"):
                    continue
                p = plan_from_subscription(other)
                if p == PLAN_PRO:
                    best = PLAN_PRO
                    break
                if p == PLAN_EXPERT:
                    best = PLAN_EXPERT
        except Exception as exc:
            _log("subscription.deleted live-list failed: %s", exc)
    set_user_plan(str(user_id), best, stripe_customer_id=customer_id)


def _lookup_user_by_customer(customer_id: str) -> str | None:
    try:
        admin = get_admin_client()
        result = (
            admin.table("profiles")
            .select("id")
            .eq("stripe_customer_id", customer_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if rows:
            return rows[0].get("id")
    except Exception as exc:
        _log("lookup by stripe_customer_id failed: %s", exc)
    return None


def process_webhook_event(event: dict | Any) -> dict:
    etype = _get(event, "type")
    data_obj = _get(_get(event, "data"), "object")
    if etype == "checkout.session.completed":
        handle_checkout_completed(data_obj)
    elif etype == "customer.subscription.updated":
        handle_subscription_updated(data_obj)
    elif etype == "customer.subscription.deleted":
        handle_subscription_deleted(data_obj)
    return {"received": True, "type": etype}
