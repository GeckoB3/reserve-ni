# Class commerce — product rules (implementation reference)

This document locks default rules for credits, course bundles, memberships, multi-session checkout, recurring reservations, cancellations, refunds, and entitlement precedence. Adjust in product review; code should encode these as defaults.

## 1. Entitlement precedence (lowest → highest at checkout)

When multiple discounts or entitlements could apply to the same class session:

1. **Venue published drop-in price** (baseline).
2. **Membership benefit** — if an active membership grants included sessions or a percentage discount, apply after pack/credit rules that fully cover price (see below).
3. **Course bundle / series** — if the session is part of an active paid enrollment, price is governed by the course product (often zero marginal per session).
4. **Class credits** — FIFO by **earliest `expires_at` first** (NULL expiry = last resort). Partial packs are not split across concurrent checkouts without an explicit “split” UX.
5. **Promo / admin override** (future) — always last.

If two entitlements both claim “free”, prefer **course enrollment** over **credits** for sessions that are explicitly on the course roster.

## 2. Authentication (Section 7.3)

- **Single drop-in class** booking: allowed without login unless `venues.require_account_login_for_bookings` is true.
- **Credit pack purchase, course enrollment, membership start/change/cancel, multi-session cart checkout, recurring reservation setup, payment method add/remove, profile updates, viewing bookings beyond tokenised manage link**: require an authenticated session.
- After login, the user must return to the **same path + safe query** they started from (`redirectTo` / `next` sanitised per `safe-auth-redirect`).

## 3. Credits

- **Purchase**: creates a **balance batch** row (`user_class_credit_balances`) with `credits_remaining = pack_size`, optional `expires_at = now() + validity_days` from product.
- **Redemption**: one ledger row `reason = redeem`, negative delta, `booking_id` set. Decrement `credits_remaining` on the batch(es) consumed (FIFO by `expires_at` NULLS LAST, then `created_at`).
- **Cancellation**: if a booking paid **only** with credits (no card PI), on allowed cancel **restore** credits with ledger `reason = refund` unless the venue policy marks the session as forfeited (no-show after start = no restore).
- **Expiry**: nightly or weekly job may insert `reason = expire` and zero remaining on expired batches (future cron).

## 4. Course bundles

- **Enrollment** is a paid product tied to a set of `class_instance_id` values and/or rules; capacity is the minimum of product `max_enrollments` (if set) and per-session remaining capacity at checkout time.
- **Roster**: staff see enrollments linked to `class_course_enrollments` and derived booking rows where applicable.

## 5. Memberships

- Stored as **Stripe Subscriptions** on the **venue connected account** with a Stripe Price per `class_membership_products` row.
- App mirrors status in `class_memberships` from webhooks (`customer.subscription.*`).
- **Allowance** stored as JSON on the product (`rules`); engine interprets `unlimited` | `monthly_credits` | `discount_percent` for quote/checkout.

## 6. Multi-session checkout

- Single **atomic** checkout: validate capacity for **all** lines, then create all `bookings` rows sharing one `group_booking_id` (uuid).
- If any insert fails, roll back **all** rows created in that request (same `group_booking_id` delete) and do not consume credits.
- Requires authenticated user; guest row must match authenticated email (same pattern as multi-service).

## 7. Recurring reservations

- **Rule** stored in `class_recurring_reservations` with JSON recurrence + `class_type_id` anchor.
- **Materialization** creates concrete `bookings` (or holds) on a schedule via cron; failures set `last_error` and `status = failed` until retried or cancelled.

## 8. Stripe Connect — customer payment methods

- **Per venue + per connected account**: `venue_customer_stripe` stores `stripe_customer_id` on the connected account for `(user_id, venue_id)`.
- Saved PaymentMethods are **only** used for charges on that same `stripe_connected_account_id`.

## 9. Idempotency

- Webhook and client **fulfill** paths must use `idempotency_key` / unique `stripe_payment_intent_id` on fulfillment tables or ledger to prevent double grants.
