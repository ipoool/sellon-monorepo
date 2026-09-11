# Mailtrap unban request — account "get sellon"

> **How to use this file.** Reply to the ban email from `support@mailtrap.io`
> and paste the section below the line. Fill in every `«...»` placeholder
> first — those are facts only you can confirm. The code fix is done; deploy
> it before sending so the claims are true (see "Before you send" at the
> bottom).

---

Hi Mailtrap Compliance Team,

Thank you for the notice about account **get sellon** (sending domain
`sellon.id`). I have reviewed our sending and I believe I have found the
cause. I am not disputing the decision — one of our email streams was not
compliant, and I explain below what it was and what we have changed.

## 1. A brief description of our business

SellOn is a small SaaS product for Indonesian micro and small businesses
(UMKM). Sellers sign up, create an online store, list products, and take
orders through a link they share with their own customers, mostly over
WhatsApp.

We operate a facilitator model: each seller connects their own payment
account, and we never hold buyer funds. We charge sellers a monthly
subscription. We are not an email marketing product, an agency, or a list
provider, and we have never purchased, rented, imported, or scraped an
email list.

- Website: https://sellon.id
- Sending domain: `sellon.id`
- From address: `halo@sellon.id`
- Company: «legal entity name»
- Business address: «business address»
- Contact for this request: «your name», «your email»

## 2. How we collect recipients

Every address we send to comes from one of exactly three first-party
sources. There is no other path by which an address enters our system.

**Sellers** enter their own email address to create an account on
https://sellon.id. Nothing is sent to that address until the person proves
control of the mailbox by entering a 6-digit code we email them.

**Buyers** enter their email themselves during checkout on a seller's
store, or when they ask for a one-time code to open a digital product they
purchased. Buyers only ever receive mail about the specific order they
placed.

**Staff invitations** are sent when a seller types a colleague's address to
invite them into their own store account. The invite names the seller and
the store that triggered it.

We do not maintain any list beyond these accounts and orders, and we do not
send to addresses that have not taken one of the actions above.

## 3. The type of emails we send

Almost everything we send is transactional, triggered by a specific action
the recipient just took:

| Email | Trigger |
|---|---|
| Email verification code | Recipient submitted the signup form |
| Password reset code | Recipient requested a reset |
| Buyer one-time access code | Buyer opened their purchased digital product |
| Order created / payment received | Buyer placed or paid for that order |
| New order notification | An order arrived in that seller's own store |
| Digital product delivery link | Buyer's paid order contained a digital item |
| Staff invitation | A seller invited that person to their store |
| Subscription expiry reminder | That seller's own plan is about to lapse |

**We also had one non-transactional stream, and this is where we went
wrong.** A weekly "tips for sellers" email went out every Monday to all
registered sellers. It contained business advice rather than account
information, which makes it promotional. It was sent to every seller
account, it was not something anyone opted into separately from signing up,
and — the clear failure — **it carried no unsubscribe link and no
`List-Unsubscribe` header.**

That is a violation of your Terms of Service and of standard
permission-based practice. I am not going to argue it was anything else.
Sending promotional content to people who only ever agreed to create an
account, with no way to opt out, is exactly the kind of sender behaviour
your policy exists to stop.

## 4. Our opt-in process

For the transactional mail, the opt-in is the action itself: a person types
their own address into our signup form, our checkout, or a password-reset
form, and the message they receive is the direct result. For signup we go
one step further and send nothing beyond the verification code until the
recipient proves they control the mailbox by entering that code.

For the weekly tips email there was no separate opt-in, and that is the gap.
We treated account creation as consent for promotional content. It is not,
and we have corrected our understanding.

## What we have changed

These are implemented in our codebase, not plans. Fill in the deploy date
before sending.

- **The weekly promotional email is off.** It now requires an explicit
  `WEEKLY_TIPS_ENABLED` switch which is **off by default**, so it cannot be
  re-enabled by accident or by a fresh deployment.
- **Consent is now recorded per user and defaults to none.** We added a
  `marketing_opt_in_at` column. Every pre-existing account starts NULL — we
  did not migrate anyone into consent — and the send query selects only
  users who have explicitly opted in. Nobody is currently opted in, so the
  eligible audience is zero until people actively choose it.
- **Every promotional message carries a working opt-out.** A visible
  unsubscribe link in both the text and HTML parts, plus `List-Unsubscribe`
  and `List-Unsubscribe-Post` (RFC 8058 one-click) headers. The endpoint is
  public and needs no login, so a recipient or their mail client can always
  act on it. Opting out is immediate and permanent.
- **Transactional and promotional mail are separated.** The opt-out applies
  only to promotional mail, so unsubscribing can never suppress a password
  reset, an order receipt or a security code.
- Deployed to production on «date».

## Technical setup

Our domain authentication has been in place and passing throughout:
SPF, DKIM (`rwmt1._domainkey.sellon.id`) and the domain verification record
all report `pass` in our Mailtrap sending-domain settings. Our sending is
low-volume and driven by real user activity — «approximate emails per day»
per day across «approximate number of seller accounts» seller accounts.

We would be grateful for the chance to restore sending. Our sellers cannot
currently sign up, reset a password, or receive their order notifications,
and I understand that is a consequence of our own mistake rather than
something to be excused. I am happy to provide message samples, our
signup and checkout screens, or anything else that would help you verify
this.

Kind regards,
«your name»
«your role», SellOn — https://sellon.id

---

## Before you send — please read

**The code fix is done; deploy it before you send.** The weekly job is now
behind `WEEKLY_TIPS_ENABLED` (off by default), `marketing_opt_in_at` gates
the recipient query, and the unsubscribe link and headers are in place. All
of that is committed but only takes effect in production once deployed — so
deploy first, then put the date in, then send. An appeal that overstates
what has shipped is worse than one that is a day later.

**Sanity-check before sending** that nobody is silently opted in:

```sql
SELECT COUNT(*) FROM users WHERE marketing_opt_in_at IS NOT NULL;
```

It should be 0. If it is not, someone was migrated into consent and that
needs explaining rather than hiding.

**Numbers to fill in.** I left the volume and account-count placeholders
empty rather than guess. Compliance teams check these against what they
see, so an invented figure would hurt the appeal.
