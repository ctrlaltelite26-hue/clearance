# Kestrel Knives — Customer Support & Operations Knowledge Base

**Document ID:** KK-KB-2026-001  
**Version:** 1.1 (Fictional — for internal support & AI autopilot testing)  
**Last updated:** March 22, 2026  
**Classification:** Internal / Support-facing  
**Website:** https://kestrelknives.com  

> **Notice:** This document is a fictional expansion for demo and QA purposes. Product names and brand positioning align with the public Kestrel Knives storefront; policies, SKUs, pricing, and contact details below are invented for testing Clearance autopilot + RAG workflows.

---

## 1. Company overview

**Legal name:** Kestrel Manufacturing LLC (dba **Kestrel Knives**)  
**Customer-facing brand name (use in email sign-offs):** Kestrel Knives  
**Primary support email (use in email sign-offs):** support@kestrelknives.com  
**Headquarters & workshop:** 1847 Ridge Run Road, Bradford, Pennsylvania 16701, United States  
**Founded:** 2018  
**Mission:** Build ultralight, field-proven cutting tools for hunters, backcountry users, and serious EDC enthusiasts — with functional simplicity and zero excess.

**Brand pillars:**
- **Ultralight by design** — every gram is justified in the field.
- **100% American made** — materials and final assembly in Pennsylvania.
- **Drop model for flagship knives** — limited runs; no perpetual waitlists on core hunters.
- **Community-driven refinement** — design feedback comes from hunters and pack-out users.

**Support channels:**
| Channel | Address / URL | Hours (ET) |
|---------|---------------|------------|
| Email | support@kestrelknives.com | Mon–Fri 8:00–17:00 |
| Orders | orders@kestrelknives.com | Mon–Fri 8:00–17:00 |
| Sharpening service | sharpen@kestrelknives.com | Mon–Fri 8:00–16:00 |
| Wholesale | wholesale@kestrelknives.com | By appointment |
| Phone | +1 (814) 555-0198 | Mon–Fri 9:00–16:00 |

**Average first-response SLA:** 1 business day for email; 4 hours for order-shipment inquiries with a valid order number.

---

## 0. Demo inbox — seven test emails (Clearance QA)

Re-index this file after edits. Each block below mirrors a sample inbound email in `kestrel-knives-test-emails.md` and is written for RAG retrieval by **subject line**, **customer email**, and **order number**.

| # | Subject (paste exact) | From | Expected autopilot | Why |
|---|------------------------|------|------------------|-----|
| 1 | Mountain Scalpel inserts dull after one trip | packlite@proton.me | **AUTO** — cite SKU | Clear product how-to; no human judgment |
| 2 | Order #KK10482 not here yet | maya.chen@outlook.com | **AUTO** — cite ship facts | Order lookup + shipping policy |
| 3 | Ovis Hunter restock?? | jake.hunter@gmail.com | **AUTO** — cite drop policy | Policy-only; no order to verify |
| 4 | Blade chip on my Caper | ridge.walker@icloud.com | **HUMAN** — draft only | Warranty vs courtesy needs shop review |
| 5 | Sharpening turnaround | elena.r@company.com | **HUMAN** — draft only | Exact ship date needs shop queue lookup |
| 6 | Return unused Ovis Hunter | buyer@testmail.com | **AUTO** — cite RMA steps | Full return playbook for #KK10220 |
| 7 | Dealer portal access | morgan.wholesale@guideco.com | **APPROVALS** | `access.propose` before grant |

---

### 0.1 AUTO — Mountain Scalpel inserts dull after one trip (Jordan)

**Inbound subject:** Mountain Scalpel inserts dull after one trip  
**Customer email:** packlite@proton.me  
**Customer name:** Jordan  
**Customer question:** “Do you sharpen these or do I need to buy something new?” after one elk trip.

**Product:** Mountain Scalpel (SKU **KK-MS-SLV**, $149). Inserts are **#60 carbon steel** consumables — dull after field use is **normal**.

**Answer — do we sharpen Mountain Scalpel inserts?** **No.** Kestrel does **not** sharpen insert blades. Replacement is the intended maintenance path.

**What to buy:** Replacement insert **3-pack**, SKU **KK-MS-RB-3PK**, **$18 USD**, ships from Pennsylvania. Compatible with Mountain Scalpel Gen 1 and current production.

**Optional order reference (if customer later provides):** #KK10301 — same product guidance applies with or without an order number.

**Approved customer reply (how-to):**
> Thanks for reaching out, Jordan. The **Mountain Scalpel** uses replaceable **#60 carbon steel inserts** — they’re consumable and meant to be swapped when dull after field use like an elk trip. We **do not sharpen inserts**; replacement is the intended path.
>
> You can order **KK-MS-RB-3PK** (3-pack, **$18**) from kestrelknives.com when in stock. Discoloration after blood contact is normal — do not oil insert blades.

**Keywords for search:** Mountain Scalpel, inserts dull, sharpen, buy something new, KK-MS-RB-3PK, replaceable blade, elk trip, packlite@proton.me

---

### 0.2 AUTO — Order #KK10482 not here yet (Maya)

**Inbound subject:** Order #KK10482 not here yet  
**Customer email:** maya.chen@outlook.com  
**Customer name:** Maya  
**Customer question:** Ovis Hunter 2.0 ordered March 10; tracking hasn’t updated in three days.

| Field | Value |
|-------|-------|
| Order | **#KK10482** |
| Product | Ovis Hunter 2.0 (SKU KK-OH2-BLK) |
| Order date | March 10, 2026 |
| Ship date | March 12, 2026 |
| Carrier | USPS Priority ($12.95) |
| Transit | 2–3 business days after ship scan |
| Lost package | File claim after **10 days** domestic with no delivery scan (Section 4.3) |

**Approved customer reply:**
> Hi Maya — I pulled up order **#KK10482** for the **Ovis Hunter 2.0**. It shipped **March 12** via **USPS Priority**. Priority typically delivers in **2–3 business days** after the ship scan.
>
> If tracking hasn’t updated in three days, the package may still be in transit without a new scan. If there’s still no delivery scan **10 days** after the ship date, contact us and we’ll open a lost-package claim.

**Keywords:** KK10482, not here yet, tracking hasn’t updated, where is my order, Maya, maya.chen@outlook.com, shipping status

---

### 0.3 AUTO — Ovis Hunter restock?? (Jake)

**Inbound subject:** Ovis Hunter restock??  
**Customer email:** jake.hunter@gmail.com  
**Customer name:** Jake  
**Customer question:** When restock? Waitlist? Hold one?

**Policy facts (Section 3.1):**
- Ovis Hunter 2.0 is **sold out** between **limited drops** — no standing inventory.
- We **do not** maintain waitlists, reserves, or holds outside Shopify checkout.
- Support **must not** promise restock dates unless published on site or newsletter.
- Newsletter at **kestrelknives.com** gives drop alerts (not guaranteed allocation).

**Approved customer reply:**
> Thanks for your interest in the **Ovis Hunter 2.0**. Flagship knives release in **limited drops** — when the page shows sold out, the current batch is gone. We **don’t maintain waitlists or hold units**.
>
> Subscribe at **kestrelknives.com** with the same email you used here for newsletter notice before the next drop. I’m not able to reserve a knife or confirm a restock date beyond public announcements.

**Keywords:** Ovis Hunter restock, waitlist, hold one, sold out, jake.hunter@gmail.com, drop model

---

### 0.4 HUMAN REVIEW — Blade chip on my Caper (Ridge)

**Inbound subject:** Blade chip on my Caper  
**Customer email:** ridge.walker@icloud.com  
**Customer name:** Ridge  
**Order:** **#KK09877**  
**Product:** Mountain Caper 2.0 (SKU **KK-MC2-GRN**, $169)  
**Issue:** Chip near tip after breaking down an animal.

**Warranty answer (cite Section 6):** Chipping from **field stress** / bone contact during animal breakdown is **not covered** under lifetime craftsmanship warranty. Normal edge wear and stress chips are excluded.

**What tier-1 may offer in draft:** Mail-in **Kestrel Edge Restore** sharpening (**$45**, 10–14 business days) OR note that shop manager may review a **one-time courtesy** replacement.

**Autopilot guidance:** **Save draft for human review — do not auto-send.** Log case **KK-WAR-09877** and escalate to shop manager (J. Whitmore) before promising courtesy replacement or warranty exception.

**Approved draft language (human sends after review):**
> Thanks, Ridge. I reviewed order **#KK09877** for your **Mountain Caper 2.0**. A chip near the tip from breaking down an animal is considered **field stress**, not a manufacturing defect — it’s **not covered under warranty** (Section 6).
>
> We can still help with **Kestrel Edge Restore** mail-in sharpening ($45, 10–14 business days). I’ve logged **KK-WAR-09877** for our shop team to review options with you.

**Keywords:** KK09877, blade chip, Mountain Caper, warranty, animal breakdown, ridge.walker@icloud.com

---

### 0.5 HUMAN REVIEW — Sharpening turnaround (Elena)

**Inbound subject:** Sharpening turnaround  
**Customer email:** elena.r@company.com  
**Customer name:** Elena  
**Service order:** **#KK-SHP-2201**  
**Service:** Kestrel Edge Restore (mail-in)  
**Product:** Ovis Hunter  
**Customer says:** Sent knife in two weeks ago — when will it return?

**Known policy (Section 2.3):** Standard turnaround **10–14 business days from workshop receipt** (not from ship date). Return tracking email comes from **sharpen@kestrelknives.com**. Return shipping uses **$12 prepaid label** from service checkout.

**What tier-1 cannot confirm without shop:** Exact position in queue, whether knife has entered Edge Restore bench, or precise ship-back date.

**Autopilot guidance:** **Save draft for human review — do not auto-send.** Reply may cite policy turnaround but must not invent a ship date. Shop must confirm queue status for #KK-SHP-2201.

**Approved draft language (human confirms dates):**
> Hi Elena — sharpening order **#KK-SHP-2201** is in our **Kestrel Edge Restore** queue. Standard turnaround is **10–14 business days from the date we receive your knife** at Bradford.
>
> I’m checking with our shop on the exact status for your Ovis Hunter and will follow up with your ship-back timing. When it ships, you’ll get tracking from **sharpen@kestrelknives.com**.

**Keywords:** KK-SHP-2201, sharpening turnaround, Edge Restore, two weeks, elena.r@company.com

---

### 0.6 AUTO — Return unused Ovis Hunter (Sam)

**Inbound subject:** Return unused Ovis Hunter  
**Customer email:** buyer@testmail.com  
**Customer name:** Sam  
**Order:** **#KK10220**  
**Product:** Ovis Hunter 2.0 (SKU **KK-OH2-BLK**, $189)  
**Condition:** Unused, still in box.

| Field | Value |
|-------|-------|
| Eligibility | 30-day unused return (Section 5.1) |
| Restocking fee | **$15** |
| Return shipping | Customer pays (not DOA) |
| RMA ID | **KK-RMA-10220** |
| RMA email SLA | Within **2 business days** |
| Include | Kydex sheath + original packaging; no sharpening |
| Ship-to | Kestrel Manufacturing LLC, 1847 Ridge Run Road, Bradford, PA 16701 |
| Refund timing | 5–7 business days after inspection |

**Approved customer reply:**
> Thanks, Sam. Order **#KK10220** for the **Ovis Hunter 2.0** qualifies under our **30-day unused return** policy. I’m issuing RMA **KK-RMA-10220** — packing instructions arrive within **2 business days**.
>
> A **$15 restocking fee** applies. Include the **Kydex sheath** and **original packaging**; return shipping is paid by the customer. Ship tracked to Bradford, PA. Refund (minus fee) posts within **5–7 business days** after inspection.

**Keywords:** KK10220, return unused, Sam, buyer@testmail.com, restocking fee $15, RMA

---

### 0.7 APPROVALS — Dealer portal access (Morgan)

**Inbound subject:** Dealer portal access  
**Customer email:** morgan.wholesale@guideco.com  
**Customer name:** Morgan  
**Company:** Guide Co Outfitters, Bozeman  
**Request:** Access to **dealer wholesale portal** for pricing and purchase orders.

**Wholesale facts (Section 8):** Email **wholesale@kestrelknives.com** with business name, EIN, territory. Minimum opening order **$2,500**; knife allocation by season. Portal access is **not** self-service — requires approval workflow.

**Autopilot workflow:** `user.lookup` → `knowledge.search` → `ticket.create` → **`access.propose`** (role: **dealer**, app: **dealer wholesale portal**) → **pause for human approval** before `access.grant`.

**Approved acknowledgment (after approval only):**
> Thanks, Morgan. We’ve received your wholesale inquiry for Guide Co Outfitters. Our team will review your dealer application and portal access request. Minimum opening order is $2,500; wholesale@kestrelknives.com will follow up with next steps.

**Keywords:** dealer portal, wholesale, Guide Co Outfitters, morgan.wholesale@guideco.com, access request

---

## 2. Product catalog (2026 season)

### 2.1 Fixed-blade hunting & backcountry knives

#### Ovis Hunter 2.0
- **SKU:** KK-OH2-BLK  
- **MSRP:** $189 USD  
- **Weight (knife only):** 2.1 oz (59 g)  
- **Blade steel:** CPM-S35VN, 2.75" drop-point, stonewashed  
- **Handle:** G10, charcoal black  
- **Sheath:** Kydex, reversible belt clip, drain hole  
- **Use case:** General mountain hunting, caping, camp chores  
- **Release model:** Periodic drops on kestrelknives.com — **no waitlist**; when sold out, next drop date is announced via email newsletter only  
- **Replacement blades:** Not user-replaceable (full knife service only)

#### S.E. Ovis Hunter (Special Edition)
- **SKU:** KK-SEOH-COY  
- **MSRP:** $219 USD  
- **Weight:** 2.3 oz (65 g)  
- **Blade steel:** CPM-S35VN, 2.75", coyote tan PVD  
- **Handle:** Micarta, desert coyote  
- **Notes:** Limited colorway; same geometry as Ovis Hunter 2.0  
- **Warranty:** Identical to Ovis Hunter 2.0 (see Section 6)

#### Mountain Scalpel
- **SKU:** KK-MS-SLV  
- **MSRP:** $149 USD  
- **Weight (complete system):** 0.42 oz (12 g) — marketed as lightest replaceable-blade knife in category  
- **Blade:** #60 surgical-style carbon steel inserts (3-pack included)  
- **Handle:** Titanium clip frame  
- **Use case:** Ultralight backcountry, precise caping, emergency field cuts  
- **Replacement blades SKU:** KK-MS-RB-3PK ($18 USD)  
- **Important:** Blades are **consumable**; discoloration after blood contact is normal. Do not oil insert blades.

#### Mountain Caper 2.0
- **SKU:** KK-MC2-GRN  
- **MSRP:** $169 USD  
- **Weight:** 0.71 oz (20 g)  
- **Blade steel:** CPM-154, 2.4" caping blade  
- **Handle:** Carbon fiber scales, forest green accent  
- **Notes:** Refined finger choil vs. MC1; better control for detail work  
- **Sheath:** Molded polymer, snap retention

### 2.2 Apparel & accessories

| Product | SKU | MSRP | Notes |
|---------|-----|------|-------|
| Patch Hat | KK-APP-HAT-BLK | $32 | Structured trucker; sold in drops |
| Keystone HD Hoodie | KK-APP-HDY-ASH | $78 | Heavyweight fleece, ash grey |
| Kestrel Camo Tee | KK-APP-TEE-CMO | $36 | Soft cotton blend |
| Vertical Tee | KK-APP-TEE-VRT | $34 | Logo vertical stack print |
| Kydex Sheath (Ovis) | KK-ACC-SH-OH2 | $28 | Replacement sheath only |

Apparel is **final sale** unless defective on arrival (see Section 5).

### 2.3 Knife sharpening service (mail-in)

**Service name:** Kestrel Edge Restore  
**Tagline:** *Your knife keeps its history; your blade gets new life.*

- **Price:** $45 per knife (Ovis, Caper, non-replaceable models)  
- **Turnaround:** 10–14 business days from receipt at workshop  
- **Includes:** Cleaning, edge geometry restore, stropping, protective wrap  
- **Not included:** Chip repair > 1 mm, broken tips, handle repair (quoted separately)  
- **Mountain Scalpel:** We do **not** sharpen insert blades — direct customers to replacement 3-packs (KK-MS-RB-3PK)  
- **Shipping to Kestrel:** Use tracked shipping; include printed form from kestrelknives.com/sharpening  
- **Return shipping:** Flat $12 prepaid label added at checkout when service is purchased online  

---

## 3. Ordering, drops & inventory

### 3.1 Drop model (knives)
Kestrel does **not** maintain standing inventory on flagship knives. When a product page shows **SOLD OUT**:
1. Customer may join the **newsletter** for drop announcements (not a guaranteed allocation waitlist).
2. Support must **not** promise restock dates unless published on the site or in the official newsletter.
3. Employees may **not** hold units, reserve knives, or accept payment outside Shopify checkout.

**Approved response for “When will Ovis Hunter restock?”**  
> “Ovis Hunter 2.0 is released in limited drops. We don’t publish a fixed calendar, but newsletter subscribers get early notice. I can confirm you’re on the list if you share the email you used to subscribe.”

### 3.2 Order processing
- Orders placed before **14:00 ET** ship same or next business day **when in stock**.
- Shopify order numbers format: `#KK10234` (always include `#` when looking up).
- Confirmation emails come from `orders@kestrelknives.com`.
- We ship to US, Canada, and EU (see Section 4). APO/FPO supported via USPS only.

### 3.3 Cancellations & changes
- **Unshipped orders:** Cancel or change address free of charge — contact orders@ within 2 hours of purchase.
- **After shipment:** Cannot cancel; customer must use return process (Section 5).
- **Wrong address entered by customer:** If tracking shows “in transit,” we cannot reroute. If returned to sender, customer pays re-ship ($8 domestic).

---

## 4. Shipping policy

### 4.1 Domestic (United States)
| Method | Cost | Transit |
|--------|------|---------|
| USPS Ground Advantage | $6.95 (free over $150) | 3–5 business days |
| USPS Priority | $12.95 | 2–3 business days |
| FedEx 2Day | $24.95 | 2 business days |

Knives ship **signature not required** under $300; orders $300+ require adult signature in compliance with carrier rules.

### 4.2 International
- **Canada:** Duties may apply; DDP not offered. Typical transit 5–10 days.
- **EU/UK:** Customer responsible for VAT/import fees. We declare full commercial value.
- **Restrictions:** We **cannot** ship knives to countries where fixed-blade import is prohibited. If customs seizes a package, we do not refund product cost (customer acknowledged at checkout).

### 4.3 Lost & damaged packages
- Customer must report damage within **7 days** of delivery scan with photos of box and item.
- Lost packages: file claim after **10 days** domestic / **21 days** international with no delivery scan.
- Resolution: replace if SKU in stock; otherwise refund to original payment method.

---

## 5. Returns & exchanges

### 5.1 Knives (unused)
- **Window:** 30 days from delivery  
- **Condition:** Unused, no sharpening, sheath and packaging intact  
- **Restocking fee:** $15 on knives (covers inspection and re-pack)  
- **Return shipping:** Customer pays unless item was defective or wrong item sent  
- **Process:** Email support@ with order # and reason → receive RMA within 2 business days  

### 5.2 Defective on arrival (DOA)
- Report within **14 days** with photos  
- No restocking fee; Kestrel provides prepaid return label  
- Defects covered: grind issues, loose handles, sheath retention failure, cosmetic flaws exceeding normal stonewash variation  

### 5.3 Exchanges
- Exchanges treated as return + new order (drop inventory may block like-for-like exchange)  
- If customer wants different model and target SKU is sold out, issue store credit only  

### 5.4 Sharpening service refunds
- Cancel before knives are logged into shop queue: full refund  
- After work begins: no refund  

### 5.5 Apparel
- **Final sale** except DOA or wrong item shipped  
- No returns for sizing preference  

---

## 6. Lifetime craftsmanship warranty

**Applies to:** Ovis Hunter 2.0, S.E. Ovis Hunter, Mountain Caper 2.0 (original purchaser with proof of order)

**Covers:**
- Handle structural failure (G10, micarta, carbon fiber delamination)
- Blade breakage under normal field use (not prying, not batoning)
- Sheath retention clip failure

**Does not cover:**
- Normal wear, edge dulling, patina
- Mountain Scalpel consumable inserts
- Loss or theft
- Modifications by third parties
- Damage from improper sharpening angles (< 15° per side)

**Warranty claim process:**
1. Customer emails support@ with photos, order #, description of failure  
2. Tier-1 approves RMA or requests additional photos within 3 business days  
3. Customer ships knife to Bradford workshop (prepaid label provided if approved)  
4. Repair or replace at Kestrel discretion; typical turnaround 3–4 weeks  

**Mountain Scalpel frame warranty:** 2 years on titanium clip frame only; blades are consumables.

---

## 7. Care, maintenance & safety

### 7.1 General care (fixed blades)
- Clean blood and moisture after field use; dry thoroughly  
- Light food-safe mineral oil on non-stainless areas if storing long-term  
- Store in sheath with blade dry — trapped moisture causes corrosion spots on S35VN over time  

### 7.2 Mountain Scalpel inserts
- Replace inserts when edge chips or corrosion appears  
- Do not reuse inserts after heavy bone contact — micro-fractures possible  
- Pack used inserts in provided cardboard sleeve for safe disposal  

### 7.3 Sharpening angles (factory)
| Model | Factory angle | Recommended maintenance |
|-------|---------------|------------------------|
| Ovis Hunter 2.0 | 20° per side | 20–22° per side |
| Mountain Caper 2.0 | 18° per side | 18–20° per side |
| Mountain Scalpel inserts | Factory only | Replace, do not sharpen |

### 7.4 Legal reminder (support script)
Kestrel provides general product information only. Customers are responsible for knowing local laws on fixed-blade carry, transport, and hunting use.

---

## 8. Frequently asked questions (FAQ)

**Q: Mountain Scalpel inserts dull after one trip — do you sharpen them or do I need to buy something new?**  
A: **Do not sharpen inserts.** Replace them. Order SKU **KK-MS-RB-3PK** (3-pack, **$18**). The Mountain Scalpel uses consumable #60 carbon steel inserts — dull after elk trip or field use is normal. See **§0.1** and **§10.2**.

**Q: Order #KK10482 not here yet — tracking hasn’t updated in three days (Maya).**  
A: Order **#KK10482** (Ovis Hunter 2.0) shipped **March 12** via **USPS Priority** (2–3 business days after scan). Stale tracking can mean in transit. Lost-package claim after **10 days** with no delivery scan. See **§0.2** and **§10.7**.

**Q: When are you getting more Ovis Hunter 2.0? Can you put me on a waitlist or hold one?**  
A: **No waitlists or holds.** Limited drops only; newsletter at kestrelknives.com for alerts. See **§0.3**, **§3.1**, and **§10.10**.

**Q: Order #KK09877 — Mountain Caper 2.0 chip near tip after breaking down an animal — warranty?**  
A: **Not covered** — field stress / misuse (Section 6). Offer Edge Restore sharpening ($45) or escalate **KK-WAR-09877** for shop courtesy review. **Human approval required before sending.** See **§0.4** and **§10.9**.

**Q: Sharpening order #KK-SHP-2201 — when will my Ovis Hunter come back? (sent two weeks ago)**  
A: Policy turnaround **10–14 business days from workshop receipt**. Exact ship date requires shop queue lookup — **human must confirm** before promising a date. See **§0.5** and **§10.8**.

**Q: Return unused Ovis Hunter 2.0 from order #KK10220 — still in box (Sam).**  
A: **30-day unused return**, **$15 restocking fee**, RMA **KK-RMA-10220** within 2 business days, sheath + packaging required, ship to Bradford PA. See **§0.6** and **§10.6**.

**Q: Dealer portal access for wholesale pricing and POs (Guide Co Outfitters).**  
A: Requires **`access.propose`** and human approval. Minimum order $2,500; contact wholesale@. See **§0.7** and **§14.8**.

**Q: Why is everything sold out?**  
A: Flagship knives are built in small batches. Sold out means the current batch is gone. Subscribe to the newsletter for drop alerts — we don’t run traditional waitlists.

**Q: Can I buy a Mountain Scalpel replacement blade separately?**  
A: Yes — SKU **KK-MS-RB-3PK**, $18, ships from Pennsylvania. Compatible only with Mountain Scalpel Gen 1 and current production.

**Q: My Ovis Hunter edge rolled on antler — is that a warranty issue?**  
A: Edge rolling from normal hunting use is not a defect. We can recommend our mail-in sharpening service ($45) or local stropping at 20° per side.

**Q: Do you offer military or first-responder discounts?**  
A: Yes — 10% off apparel and accessories only (not knives) via ID.me verification. Code issued once per year per customer.

**Q: I entered the wrong shipping address.**  
A: Contact orders@ within 2 hours of purchase. After the label is printed, we cannot change the address.

**Q: Can you engrave my knife?**  
A: We do not offer engraving on current production runs.

**Q: Is the Mountain Caper 2.0 good for fishing?**  
A: It’s designed for caping and detail cuts. Saltwater rinse required; carbon fiber handles are not submerged for long periods.

**Q: How do I track my sharpening service?**  
A: Use the tracking link in the email from sharpen@ sent when the knife ships back. Inbound tracking is the customer’s responsibility.

**Q: Wholesale / dealer inquiries?**  
A: Email wholesale@ with business name, EIN, and territory. Minimum opening order $2,500; knives allocated by season.

---

## 9. Support escalation matrix

| Issue type | Tier-1 action | Escalate to |
|------------|---------------|-------------|
| Order status, address change | Lookup Shopify `#KK` order | Orders lead if > $500 |
| Warranty claim | Collect photos + RMA | Shop manager (J. Whitmore) |
| Customs seizure international | Explain policy; no refund | Finance (L. Park) |
| Injury allegation | **Do not admit liability** | Legal + founder immediately |
| Press / influencer | Template response only | marketing@kestrelknives.com |
| Chargeback threat | Document thread; no promises | Finance |

**Founder contact (escalation only):** Elias Venn — elias@kestrelknives.com (not for routine shipping questions).

---

## 10. Sample support macros (approved language)

### 10.1 Sold out / drop inquiry
> Thanks for reaching out. The **Ovis Hunter 2.0** is currently sold out on our site. We release knives in limited drops rather than holding open waitlists. If you subscribe at kestrelknives.com with the same email you used here, you’ll get notice before the next batch goes live. I’m not able to reserve a unit or confirm a restock date beyond what we’ve announced publicly.

### 10.2 Mountain Scalpel blade replacement
> The **Mountain Scalpel** uses replaceable #60 carbon steel inserts — they’re meant to be swapped when dull or corroded. You can order **KK-MS-RB-3PK** (3-pack, $18) from our site when in stock, or I can notify you when inserts are available. We don’t sharpen inserts; replacement is the intended maintenance path.

### 10.3 Sharpening service intake
> Our **Kestrel Edge Restore** mail-in service is $45 with 10–14 business day turnaround once we receive your knife. Please use the form at kestrelknives.com/sharpening and ship tracked to our Bradford workshop. Mountain Scalpel inserts aren’t eligible — only fixed-blade models like Ovis and Mountain Caper.

### 10.4 Warranty — edge chipping from misuse
> Thanks for the photos. Chipping from prying or hitting hard bone is considered out-of-warranty stress, but we can still help with our sharpening service or a discounted replacement if the team approves a one-time courtesy. I’ve logged this under case **KK-WAR-**_[auto]_.

### 10.5 Return initiation
> I’ve approved a return for order **#KK____** under our 30-day unused policy. A $15 restocking fee applies to knife returns. You’ll receive an RMA email within 2 business days with packing instructions. The knife must be unused and include the sheath and original packaging.

### 10.6 Return — Order #KK10220 (Ovis Hunter 2.0, unused)
> Thanks for reaching out, Sam. I’ve confirmed order **#KK10220** for the **Ovis Hunter 2.0** (SKU **KK-OH2-BLK**, $189). Because the knife is unused and still in the box, you’re eligible under our **30-day unused return** policy (Section 5.1).
>
> Here’s what happens next:
> 1. I’m issuing RMA **KK-RMA-10220** — you’ll receive packing instructions at your email within **2 business days**.
> 2. A **$15 restocking fee** applies to knife returns (covers inspection and re-pack).
> 3. **Return shipping is paid by the customer** unless the item was defective or we sent the wrong product.
> 4. Include the **Kydex sheath** and **original packaging**; the knife must show **no sharpening or field use**.
>
> Ship to: Kestrel Manufacturing LLC, 1847 Ridge Run Road, Bradford, PA 16701. Use tracked shipping and keep your tracking number.
>
> Once we receive and inspect the knife, your refund (minus the $15 restocking fee) posts to your original payment method within **5–7 business days**.

### 10.7 Shipping status — Order #KK10482 (Maya)
> Hi Maya — I pulled up order **#KK10482** for the **Ovis Hunter 2.0**. It shipped **March 12** via **USPS Priority** ($12.95). Priority typically delivers in **2–3 business days** after the ship scan.
>
> If tracking hasn’t updated in three days, that can mean the carrier hasn’t scanned the package yet — it’s still in transit. If there’s still no delivery scan **10 days** after the ship date with no delivery, contact us and we’ll open a lost-package claim (Section 4.3).
>
> Your confirmation was sent from **orders@kestrelknives.com** when the order was placed March 10.

### 10.8 Sharpening status — Order #KK-SHP-2201 (Elena)
> Hi Elena — sharpening service order **#KK-SHP-2201** is in our **Kestrel Edge Restore** queue. Standard turnaround is **10–14 business days from the date we receive your knife** at our Bradford workshop.
>
> If we received your Ovis Hunter about two weeks ago, it should ship back to you within the next few business days. When it ships, you’ll get a tracking email from **sharpen@kestrelknives.com**. Inbound shipping tracking is the customer’s responsibility; return shipping uses the **$12 prepaid label** from your service checkout.

### 10.9 Warranty chip — Order #KK09877 (Ridge, Mountain Caper 2.0)
> Thanks, Ridge. I reviewed order **#KK09877** for your **Mountain Caper 2.0** (SKU **KK-MC2-GRN**). Chipping near the tip from **breaking down an animal** or hitting bone is considered **field stress**, not a manufacturing defect — it’s **not covered under warranty** (Section 6).
>
> We can still help: our **Kestrel Edge Restore** mail-in sharpening is **$45** with **10–14 business day** turnaround, or our team can review a one-time courtesy replacement. I’ve logged case **KK-WAR-09877** for shop review.

### 10.10 Sold out / drop — Jake (no order)
> Thanks for your interest in the **Ovis Hunter 2.0**. Flagship knives are released in **limited drops** — when the product page shows sold out, the current batch is gone. We **don’t maintain waitlists or hold units** (Section 3.1).
>
> Subscribe at **kestrelknives.com** with the same email you used here and you’ll get newsletter notice before the next drop. I’m not able to reserve a knife or confirm a restock date beyond what we’ve announced publicly.

### 10.11 Mountain Scalpel inserts — dull after field use (Jordan / packlite@proton.me)
> The **Mountain Scalpel** uses replaceable **#60 carbon steel inserts** — they’re consumable and meant to be swapped when dull after field use (e.g. an elk trip). We **do not sharpen inserts**; replacement is the intended maintenance path.
>
> Order **KK-MS-RB-3PK** (3-pack, **$18**) from our site when in stock. Discoloration after blood contact is normal — do not oil insert blades. (Optional customer order reference: **#KK10301**.)

### 10.12 Wrong address — Order #KK10501 (Tom)
> Hi Tom — for order **#KK10501**, if you contact **orders@kestrelknives.com** within **2 hours** of purchase we can cancel or change the address free of charge. After the shipping label is printed, we **cannot reroute** the package.
>
> If tracking shows “in transit” to the wrong address, the carrier won’t redirect it. If the package returns to sender, re-ship is **$8 domestic** (Section 3.3).

---

## 11. Internal identifiers (for agent testing)

Use these fictional order and case IDs in demos:

| Scenario | Order # | Customer email | Autopilot | Expected intent |
|----------|---------|----------------|-----------|-----------------|
| Scalpel inserts dull | (none required) | packlite@proton.me | **AUTO** | Product how-to — KK-MS-RB-3PK |
| Where is my order? | #KK10482 | maya.chen@outlook.com | **AUTO** | Shipping status — Priority, shipped Mar 12 |
| Sold out frustration | — | jake.hunter@gmail.com | **AUTO** | Drop / restock policy |
| Warranty chip | #KK09877 | ridge.walker@icloud.com | **HUMAN** | Warranty vs sharpening — shop review |
| Sharpening status | #KK-SHP-2201 | elena.r@company.com | **HUMAN** | Queue lookup needed |
| Return request | #KK10220 | buyer@testmail.com | **AUTO** | Returns — $15 restocking fee |
| Dealer portal access | — | morgan.wholesale@guideco.com | **APPROVALS** | access.propose |
| Wrong address | #KK10501 | tom.b@example.com | **AUTO** | Cancellation / address — label not printed |

---

## 14. Demo scenario playbooks (match test emails)

Use this section for RAG retrieval by **order number**, **customer name**, or **subject line**. Each playbook includes facts agents should cite in replies.

### 14.1 Return unused Ovis Hunter — #KK10220 (Sam / buyer@testmail.com)

**Inbound subject:** Return unused Ovis Hunter  
**Customer message:** Wants to return Ovis Hunter 2.0 from order #KK10220 — unused, still in box.

| Field | Value |
|-------|-------|
| Order | #KK10220 |
| Product | Ovis Hunter 2.0 |
| SKU | KK-OH2-BLK |
| Price paid | $189 USD |
| Customer name | Sam |
| Email | buyer@testmail.com |
| Eligibility | 30-day unused return (Section 5.1) |
| Restocking fee | $15 |
| Return shipping | Customer pays (unused return, not DOA) |
| RMA ID | KK-RMA-10220 |
| RMA email SLA | Within 2 business days |
| Required with return | Kydex sheath + original packaging, no sharpening |
| Ship-to | Kestrel Manufacturing LLC, 1847 Ridge Run Road, Bradford, PA 16701 |
| Refund timing | 5–7 business days after inspection |

**Approved reply:** See macro **§10.6**.

---

### 14.2 Shipping delay — #KK10482 (Maya / maya.chen@outlook.com)

**Inbound subject:** Order #KK10482 not here yet

| Field | Value |
|-------|-------|
| Order | #KK10482 |
| Product | Ovis Hunter 2.0 |
| Order date | March 10, 2026 |
| Ship date | March 12, 2026 |
| Carrier | USPS Priority ($12.95) |
| Transit expectation | 2–3 business days after ship scan |
| Lost-package threshold | 10 days domestic with no delivery scan (Section 4.3) |

**Approved reply:** See macro **§10.7**.

---

### 14.3 Ovis Hunter restock — Jake (jake.hunter@gmail.com)

No order number. Customer wants waitlist or hold for sold-out Ovis Hunter 2.0.

**Key facts:** Drop model only; no waitlists; no holds; newsletter at kestrelknives.com for drop alerts.

**Approved reply:** See macro **§10.10**.

---

### 14.4 Mountain Scalpel dull inserts — Jordan (packlite@proton.me)

**Inbound subject:** Mountain Scalpel inserts dull after one trip  
**Note:** Demo email has **no order number** — answer from product policy, not order lookup.

| Field | Value |
|-------|-------|
| Customer email | packlite@proton.me |
| Customer name | Jordan |
| Product | Mountain Scalpel (KK-MS-SLV) |
| Replacement SKU | KK-MS-RB-3PK ($18, 3-pack) |
| Sharpen inserts? | **No — replace only** |
| Optional order ref | #KK10301 (if customer provides later) |

**Approved reply:** See **§0.1** and macro **§10.11**.

---

### 14.5 Warranty chip — #KK09877 (Ridge / ridge.walker@icloud.com)

**Inbound subject:** Blade chip on my Caper

| Field | Value |
|-------|-------|
| Order | #KK09877 |
| Product | Mountain Caper 2.0 (KK-MC2-GRN) |
| Issue | Chip near tip after animal breakdown |
| Warranty | Not covered — field stress / misuse (Section 6) |
| Case ID | KK-WAR-09877 |
| Alternatives | Edge Restore $45 sharpening; possible one-time courtesy replacement |

**Approved reply:** See macro **§10.9**.

---

### 14.6 Sharpening turnaround — #KK-SHP-2201 (Elena / elena.r@company.com)

**Inbound subject:** Sharpening turnaround

| Field | Value |
|-------|-------|
| Service order | #KK-SHP-2201 |
| Service | Kestrel Edge Restore |
| Product | Ovis Hunter (mail-in) |
| Turnaround | 10–14 business days from workshop receipt |
| Status email from | sharpen@kestrelknives.com |
| Return label | $12 prepaid (from service checkout) |

**Approved reply:** See macro **§10.8**.

---

### 14.7 Wrong shipping address — #KK10501 (Tom / tom.b@example.com)

| Field | Value |
|-------|-------|
| Order | #KK10501 |
| Cancel/change window | 2 hours via orders@kestrelknives.com |
| After label printed | Cannot change address |
| Return to sender re-ship | $8 domestic |

**Approved reply:** See macro **§10.12**.

---

### 14.8 Dealer wholesale access — Morgan (morgan.wholesale@guideco.com)

**Inbound subject:** Dealer portal access  
**Company:** Guide Co Outfitters, Bozeman  
**Request:** Access to dealer wholesale portal, pricing, PO submission  
**Expected workflow:** user.lookup → ticket.create → **access.propose** (requires human approval)  
**Wholesale contact:** wholesale@kestrelknives.com — minimum opening order $2,500 (Section 8 FAQ)

---

## 12. Document revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2026-03-22 | Support Ops | §0 demo email playbooks; FAQ aligned to 7 test emails; human-review flags |
| 1.0 | 2026-03-15 | Support Ops | Initial fictional KB for Clearance RAG testing |

---

## 13. Standard email sign-off (mandatory)

Use this **exact** closing on every outbound support email — use the **Customer-facing brand name** and **Primary support email** from Section 1 (not the customer's name or company):

Thanks,
Kestrel Knives Support
support@kestrelknives.com

**Do not:**
- Use generic lines like "Customer Support Team" or "Best regards" unless shown above
- Put the **customer's** name or company in the signature (e.g. never "Ridge Outdoor Gear" for a customer named Ridge)
- Invent brand names not listed in Section 1

---

*End of knowledge base.*
