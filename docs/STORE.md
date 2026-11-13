# TheDashboard Store (module: Store)

> Code and database use the internal name `kibali` (tables, `kibali_*` functions,
> the `kibali` row in `shop_modules`). Screens live under `/store`.
> Store's movement history is in `store_movements`. It never uses the mobile
> app's `stock_movements` table.

Store stops order-paper tampering ("1 box" changed to "11"). The shop creates
the order in the system and prints a receipt with an order number, QR code and
4-digit release code. The store releases **only what the system shows** for
that order, never what the paper says. Every release deducts stock and is
logged with who released it and who collected it.

## 1. Run the database migration (once)

Open the Supabase dashboard → SQL editor → paste
`supabase/migrations/20261113000000_kibali.sql` → Run.

Then also run, in order:
- `supabase/migrations/20261113010000_kibali_owner_shop_fix.sql` (owners linked through `shop_owners`)
- `supabase/migrations/20261113020000_kibali_stock_fields.sql`
- `supabase/migrations/20261113030000_kibali_retail_wholesale.sql` (retail and wholesale stock tracked separately)

## Retail (Rejareja) and wholesale (Jumla)

Kibali uses the same fields as the Stock page: retail = `retail_stock`,
wholesale = `wholesale_stock`. Every order line, delivery and adjustment is
marked Rejareja or Jumla, and only that quantity moves. The default follows
the product type (wholesale items → Jumla, others → Rejareja); for items sold
both ways the clerk / storekeeper picks with one tap.

It only **adds** tables and functions. Every existing shop gets the `pos`
module, so nothing changes for current clients. It is safe to run twice.

## 2. Switch Store on for a client

```sql
-- POS + Store
insert into shop_modules (shop_id, module, active)
values ('<shop uuid>', 'kibali', true)
on conflict (shop_id, module) do update set active = true, updated_at = now();

-- Store only (hides POS pages for that shop)
update shop_modules set active = false where shop_id = '<shop uuid>' and module = 'pos';

-- Subscription end date (optional)
update shop_modules set expires_at = '2027-01-31' where shop_id = '<shop uuid>' and module = 'kibali';
```

Shops cannot change their own modules; only Serengeti Labs can (SQL editor or
the billing admin with the service role key).

## 3. Add staff

The owner opens **Team → + Add Team Member** and picks a role:

| Role | Lands on | Can do |
|---|---|---|
| Owner (shop_admin) | Store in the sidebar | Everything, plus alerts, order history, stock adjustments, clearing flags |
| Shop clerk | `/store/shop` | Create orders, print receipts, cancel orders not yet released |
| Storekeeper | `/store/release` | Scan / open orders, release goods, report paper mismatch, receive stock |
| Cashier | `/cashier` (+ `/store/shop` when Kibali is on) | POS, plus creating release orders |

Clerks and storekeepers sign in with their username email and 4-digit PIN,
like cashiers.

## Kibali-only shops

- Owner sidebar: Store, Stock, Team, Settings. All POS pages and
  Customers are hidden and blocked.
- Team offers only Shop clerk and Storekeeper. An existing cashier account
  works as a shop clerk; a sales rep account has no Kibali screen.

## Stock quantities in Kibali shops

When Kibali is on, quantities on the Stock page are read-only. Stock only
changes through Kibali (Pokea mzigo, releases, Hesabu / rekebisha), so every
change is recorded. New items can be created in Kibali (+ Bidhaa mpya) or on
the Stock page; opening stock is recorded as a delivery. The Stock page bulk
import also records each quantity as a Kibali delivery.

## Stock recording by plan

| | POS only | Store only | POS + Store |
|---|---|---|---|
| Stock in | Stock page, bulk import, vendors, warehouse (direct) | Pokea mzigo, + Bidhaa mpya, bulk import (recorded) | All recorded: Pokea, bulk import, Vendors receiving, Warehouse transfers |
| Stock out | POS sales, credit, field orders (direct) | Store releases only (recorded) | POS sales / credit / field orders recorded as SALE; "Chukua store" sales create a release order and stock comes off when the store releases |
| Corrections | Stock page | Hesabu / rekebisha (owner, reason, alert) | Hesabu / rekebisha (owner, reason, alert) |
| History | none | full | full |

Run `supabase/migrations/20261113040000_store_sales.sql`: it creates `store_movements`,
adds the SALE movement type and `kibali_sell`, and restores `stock_movements` on
databases where an earlier Store version had modified it.

## Part numbers (optional, per shop)

Part numbers are not a products column. Each shop can have a custom field
(Settings → product custom fields) named like "Part number", "SKU", "OEM",
"Item code" or "Product code"; Store reads it from `product_field_values`.
Shops without such a field just see item names: the part number column and
search hint are hidden automatically.

## How it is protected

- All Kibali writes go through database functions (`kibali_*`) that check
  the caller's role **and** that the shop's Kibali module is active. Tables
  have read-only RLS policies and no write policies.
- Release codes are stored separately; storekeepers can never read them.
- A release locks the order row and the product row, so two screens cannot
  release the same goods twice.
- 5 wrong codes in an hour lock the order for an hour and alert the owner.
- Stock movements are append-only: no one can edit or delete them.
- A flagged order (paper mismatch) cannot be released until the owner clears it.

## Pages

- `/store/shop` — new order with live "available" check, receipt (80mm print), today's orders
- `/store/release` — QR scan (Chrome on Android) or type number + code, release / partial release, paper mismatch, waiting list, receive stock
- `/store/owner` — alerts, all orders with full history, stock (on hand / reserved / available), movement history, receive and adjust

## Not yet done

- Mobile (Expo) screens — the same database functions are ready for them
- "Collect from store" at POS checkout (creates a release order from a sale)
- Photo upload on paper mismatch and delivery notes
- Billing admin toggle for `shop_modules`
