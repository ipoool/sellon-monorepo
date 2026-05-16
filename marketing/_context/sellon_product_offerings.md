# SellOn — Product Offerings

Use this file when writing ad copy, landing page content, pricing sections, sales decks, or any output that describes what SellOn sells and why sellers should use it.

---

## Core Product

**SellOn** — Online store platform for Indonesian UMKM sellers

Sellers open an online store by:
1. Signing up and creating a store (name, slug, logo, description)
2. Adding products to the catalog (photos, price, stock, category, variants)
3. Sharing the store link `sellon.id/{slug}` with buyers
4. Buyers open the store, browse products, check out independently, and pay
5. Seller receives a notification, confirms the order, and ships

**Access model**: Monthly subscription (Free / Pro / Business). Sellers use their own Midtrans account — SellOn does not take a commission on any transaction.

---

## Subscription Tiers

> Pricing details: see the pricing page at sellon.id or contact the SellOn team for current information.

### Free
Suitable for new sellers who want to try, or those still at low volume.

| Limit | Value |
|---|---|
| Active products | Limited |
| Orders per month | Limited (50 orders/month) |
| Image upload | Via Supabase storage |
| Core features | Yes — storefront, catalog, checkout, payments |
| Theme customization | No (default theme) |
| Bulk product upload | No |
| Sales reports | No |
| Staff / team management | No |

### Pro
For sellers who are getting busy and want a more powerful system.

**All Free features, plus:**
- More active products
- More orders per month
- Bulk product upload via Excel/XLSX
- Store theme color customization (theme hue)
- Catalog layout customization (grid/list)
- Sales reports (overview, best-selling products, top customers)
- Promo code management
- Customer data export

### Business
For teams and businesses seriously scaling up.

**All Pro features, plus:**
- Even more active products
- Unlimited orders (or very high limit)
- Staff and team management (add members, control access)
- Activity audit log
- Additional premium features

---

## Full Feature List

### Public Storefront
- **Store page** (`/{slug}`) — product catalog accessible to anyone
- **Product detail** — photos, description, price, variant options
- **Shopping cart** — buyers can add multiple products at once
- **Independent checkout** — flow: buyer identity → select shipping → select payment
- **Buyer order page** — order status, payment proof upload, tracking number
- **Store customization** — logo, banner, theme color, catalog layout (Pro+)

### Product Management
- **Product CRUD** — add, edit, delete products easily
- **Product photos** — upload multiple photos per product
- **Product variants** — sizes, colors, or other variants
- **Product categories** — organize products by seller-created categories
- **Bulk upload via XLSX** — import hundreds of products at once from Excel (Pro+)
- **Product duplication** — copy an existing product for similar items
- **Bulk delete** — delete many products at once

### Order Management
- **Orders dashboard** — all incoming orders in one place
- **Filter and search** — filter by status, date, customer
- **Order status updates** — pending → confirmed → shipped → completed
- **Payment confirmation** — receive and verify payment proof
- **Shipping tracking input** — enter tracking numbers into the system
- **WA templates** — send WA order confirmation / payment link / shipping update templates to buyers
- **CSV export** — export order data for bookkeeping
- **Real-time notifications** — new order notifications via SSE in the dashboard

### Customer Management
- **Customer list** — all buyers who have ever ordered are automatically recorded
- **Customer profile** — order history, total spending, WA contact
- **Segmentation** — filter customers by activity
- **Contact via WA** — open a WA chat to a customer directly from the dashboard
- **Data export** — export customer list

### Payments
- **Midtrans integration** — seller connects their own Midtrans account
- **QRIS** — GoPay, ShopeePay, all digital wallets
- **Virtual Account** — BCA, BNI, BRI, Mandiri, etc.
- **Credit/debit card** — via Midtrans
- **Manual bank transfer** — seller adds bank account number, buyer transfers and uploads proof
- **Static QRIS** — upload static store QRIS as a payment option
- **Midtrans webhook** — automatic payment confirmation from Midtrans

### Shipping
- **RajaOngkir integration** — real-time shipping rate lookup for JNE, TIKI, POS
- **Built-in courier estimates** — J&T, SiCepat, AnterAja, GoSend, GrabExpress
- **Seller origin city** — seller sets origin city for shipping rate calculation
- **Free shipping** — set a minimum order value threshold for free shipping
- **Active couriers** — seller selects which couriers to offer

### WhatsApp Templates
- **Order confirmation template** — send order details to buyer via WA
- **Payment link template** — send Midtrans payment link to buyer
- **Shipping update template** — send tracking number and courier to buyer
- **WA notification number** — seller sets a WA number to receive new order notifications

### Promo Codes
- **Create promo codes** — percentage discount or fixed amount
- **Set conditions** — minimum order, usage limit, active period

### Sales Reports (Pro+)
- **Overview** — total orders, total revenue, new orders
- **Best-selling products** — product ranking by sales volume
- **Top customers** — customer ranking by total spending

### Team Management (Business)
- **Add staff** — invite team members with limited access
- **Activity audit log** — full history of all store activity

---

## Value Props by Segment

### For New Sellers (Just Starting Online)
- "Open an online store without learning to code or hiring a developer"
- "Buyers can check out on their own — you don't need to reply to chats one by one"
- "Look professional from day one"

### For Busy Sellers (Starting to Get Overwhelmed)
- "No orders get missed — everything goes to one dashboard"
- "No more chasing buyers who forgot to pay — the system tracks it"
- "Sales records are there, no more manual counting"

### For Teams (Already Have Staff)
- "Add staff to the store — cashiers or admins can access without using your account"
- "Activity audit log — know who updated what and when"
- "Scale operations without communication chaos"

---

## Objection Handling

| Objection | Response |
|---|---|
| "I already use Tokopedia/Shopee" | Marketplaces are great for discovery, but SellOn is for customers who already know you. No commission cuts, no competing with other sellers on the same page. |
| "WA is enough for me" | WA is great for communication, but it can't track inventory, has no automatic records, and buyers can't check out independently. As your business grows, manual systems get harder. |
| "I'm worried setup is complicated" | Store setup can be done in 5 minutes. There's a step-by-step onboarding. Zero coding required. |
| "Subscription fees are expensive" | Try the Free plan first — no credit card needed. Upgrade only when you've seen the value. |
| "My buyers aren't used to shopping online" | SellOn's storefront is designed to be as easy as a marketplace. Buyers just click, fill in their address, and pay. |
| "Does buyer payment go to SellOn first?" | No. Payment goes directly to your Midtrans account or bank account. SellOn does not hold a single rupiah of yours. |
| "What if my internet is slow?" | SellOn is web-based and works with a normal connection. No app installation required. |

---

## Proof Points

| Claim | Evidence / Context |
|---|---|
| Zero commission | SellOn's business model is subscription-based, not commission-based. Stated in terms of service. |
| Payment goes directly to seller | Sellers integrate their own Midtrans account — SellOn acts as a facilitator only, not a fund holder. |
| Real-time shipping rates | Official RajaOngkir integration for JNE, TIKI, POS — prices match actual courier rates. |
| Easy to use | Sellers can add a product and receive their first order on the same day they sign up. |
| Customer data is secure | Buyer data is only accessible to the seller of that specific store. |
