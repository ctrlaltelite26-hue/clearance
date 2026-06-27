# Kestrel Knives — Sample inbound emails for Clearance testing

Paste these into the inbox (or send to your AgentMail address) after uploading `kestrel-knives-knowledge-base.md` to **Settings → Knowledge**.

---

## Resolution matrix

| # | Subject | Autopilot | Grounded KB section |
|---|---------|-----------|---------------------|
| 1 | Mountain Scalpel inserts dull after one trip | **AUTO** — cite KK-MS-RB-3PK | §0.1, §8 FAQ, §10.11 |
| 2 | Order #KK10482 not here yet | **AUTO** — ship date + Priority transit | §0.2, §8 FAQ, §10.7 |
| 3 | Ovis Hunter restock?? | **AUTO** — no waitlist / drop policy | §0.3, §8 FAQ, §10.10 |
| 4 | Blade chip on my Caper | **HUMAN** — draft only (warranty courtesy) | §0.4, §8 FAQ, §10.9 |
| 5 | Sharpening turnaround | **HUMAN** — draft only (shop queue lookup) | §0.5, §8 FAQ, §10.8 |
| 6 | Return unused Ovis Hunter | **AUTO** — RMA + $15 fee + Bradford address | §0.6, §8 FAQ, §10.6 |
| 7 | Dealer portal access | **APPROVALS** — `access.propose` | §0.7, §14.8 |

**Re-index after KB updates:** Settings → Knowledge → choose **Replace existing**, select the old source, upload the updated file, then **Retry autopilot** on each thread. Remove duplicate sources with the trash icon if you uploaded multiple copies earlier.

---

## 1. How-to (AUTO — should cite scalpel blade SKU)

**From:** packlite@proton.me  
**Subject:** Mountain Scalpel inserts dull after one trip

Hi,

I bought a Mountain Scalpel last season and the insert is already dull after one elk trip. Do you sharpen these or do I need to buy something new?

Thanks,  
Jordan

**Expected reply cites:** KK-MS-RB-3PK ($18), do **not** sharpen inserts, replacement is intended path. See KB **§0.1**.

---

## 2. Shipping status (AUTO)

**From:** maya.chen@outlook.com  
**Subject:** Order #KK10482 not here yet

Hello,

I ordered an Ovis Hunter 2.0 on March 10 (order #KK10482). Tracking hasn’t updated in three days. Can you tell me where it is?

Maya

**Expected reply cites:** Shipped March 12, USPS Priority, 2–3 business days, 10-day lost-package threshold. See KB **§0.2**.

---

## 3. Sold out / drop policy (AUTO)

**From:** jake.hunter@gmail.com  
**Subject:** Ovis Hunter restock??

When are you getting more Ovis Hunter 2.0? I’ve been refreshing the site for weeks. Can you put me on a waitlist or hold one?

Jake

**Expected reply cites:** Limited drops, **no waitlist**, **no holds**, newsletter at kestrelknives.com. See KB **§0.3**.

---

## 4. Warranty vs misuse (HUMAN — draft only)

**From:** ridge.walker@icloud.com  
**Subject:** Blade chip on my Caper

Order #KK09877 — my Mountain Caper 2.0 has a chip near the tip after breaking down an animal. Is this covered under warranty?

Ridge

**Expected:** Draft cites **not covered** (Section 6), offers sharpening $45, logs KK-WAR-09877 — **does not auto-send**; human reviews courtesy options. See KB **§0.4**.

---

## 5. Sharpening service (HUMAN — draft only)

**From:** elena.r@company.com  
**Subject:** Sharpening turnaround

I sent my Ovis Hunter in for Edge Restore two weeks ago (sharpening order #KK-SHP-2201). When should I expect it back?

Elena

**Expected:** Draft cites 10–14 day policy but **does not promise ship date** — shop must confirm queue. **Does not auto-send.** See KB **§0.5**.

---

## 6. Return policy (AUTO)

**From:** buyer@testmail.com  
**Subject:** Return unused Ovis Hunter

Hi, I’d like to return my Ovis Hunter 2.0 from order #KK10220. I haven’t used it — still in the box. What’s the process?

Sam

**Expected reply cites:** §5.1 (30-day unused), **$15 restocking fee**, RMA KK-RMA-10220 within 2 business days, sheath + packaging required, ship to Bradford PA. See KB **§0.6**.

---

## 7. Access request (APPROVALS)

**From:** morgan.wholesale@guideco.com  
**Subject:** Dealer portal access

Hi Kestrel team,

I run Guide Co Outfitters in Bozeman and we’d like to stock your knives. Can you grant me **access** to the **dealer wholesale portal** so I can view pricing and submit purchase orders?

Work email: morgan.wholesale@guideco.com  
Company: Guide Co Outfitters

Thanks,  
Morgan

**Expected:** Autopilot runs safe steps (`user.lookup`, `knowledge.search`, `ticket.create`), then pauses on **`access.propose`** with status **Needs approval**. Open **Approvals** to approve or reject. See KB **§0.7**.

---

## Expected RAG citations

After indexing, replies should pull from **§0** (demo quick reference) first, then macros **§10.6–10.12** and playbooks **§14**.
