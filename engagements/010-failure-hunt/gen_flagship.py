# Flagship demo data: voucher and refund abuse at "Lazeez", a fictional Dubai food-delivery app (Q1 2026).
# Planted truth -> flagship_truth.json. All people, phones, emails and devices are made up.
import csv, json, random, datetime as dt

R = random.Random(2027)
OUT = __file__.rsplit("/", 1)[0] + "/"
FIRST = ["Ahmed", "Fatima", "Omar", "Aisha", "Yousef", "Mariam", "Khalid", "Noura", "Hassan", "Layla", "Rashid", "Sara", "Ali", "Hind", "Saeed",
         "Priya", "Rahul", "Anjali", "Mohammed", "Joseph", "Maria", "John", "Grace", "Imran", "Sana", "Arjun", "Elena", "Daniel", "Zainab", "Faisal"]
LAST = ["Al Mansoori", "Al Hashimi", "Khan", "Nair", "Fernandes", "Al Suwaidi", "Haddad", "Sharma", "Al Marri", "Siddiqui", "Pereira", "Al Falasi",
        "Iyer", "Qureshi", "Al Nuaimi", "Mathew", "Rahman", "Al Ketbi", "Das", "Saleh"]
AREAS = ["Dubai Marina", "JLT", "Deira", "Al Barsha", "Business Bay", "Jumeirah", "Al Nahda", "International City", "Mirdif", "Downtown", "Karama", "Silicon Oasis"]
RESTOS = ["Shawarma Station", "Biryani House", "Burger Lab", "Sushi Go", "Manousheh Corner", "Pizza Forno", "Karak & Co", "Grill Point", "Salad Bar", "Thai Wok",
          "Falafel King", "Dosa Express", "Taco Loco", "Mandi Palace", "Cafe Latte"]
RIDERS = [f"R-{100+i}" for i in range(140)]
START = dt.date(2026, 1, 1)
def phone(): return f"+971 5{R.choice([0,2,4,5,6,8])} {R.randint(100,999)} {R.randint(1000,9999)}"
def device(): return f"DEV-{R.randint(10**7, 10**8-1):08X}"
def card(): return f"CARD-{R.randint(10**9, 10**10-1)}"
def name(): return f"{R.choice(FIRST)} {R.choice(LAST)}"
def addr(area): return f"Apt {R.randint(101, 2805)}, {R.choice(['Tower', 'Residence', 'Building', 'Villa'])} {R.randint(1, 60)}, {area}"

customers = []
for i in range(9000):
    nm = name(); area = R.choice(AREAS)
    customers.append(dict(customer_id=f"C{200000+i}", customer_name=nm, phone=phone(), email=f"{nm.split()[0].lower()}.{R.randint(10,9999)}@{R.choice(['gmail.com','outlook.com','yahoo.com','icloud.com'])}",
                          device_id=device(), card_fingerprint=card(), delivery_address=addr(area), area=area, signup=START - dt.timedelta(days=R.randint(0, 900)), farm=None))
# New genuine users in Q1 (they get the welcome voucher and many stay).
for c in R.sample(customers, 1500): c["signup"] = START + dt.timedelta(days=R.randint(0, 80))

# FARMS: accounts created to farm the AED 40 welcome voucher. Linked only through chains of shared devices, phones, cards and addresses
# (each shared value used by 2-3 accounts), so no single device or phone looks alarming on its own.
farms = []
for f, (n, area) in enumerate([(260, "International City"), (190, "Al Nahda"), (120, "Deira")]):
    accts = []
    for k in range(n):
        nm = name()
        accts.append(dict(customer_id=f"C{300000+f*1000+k}", customer_name=nm, phone=phone(), email=f"{nm.split()[0].lower()}{R.randint(100,99999)}@{R.choice(['gmail.com','mail.com','outlook.com'])}",
                          device_id=device(), card_fingerprint=card(), delivery_address=addr(area), area=area, signup=START + dt.timedelta(days=R.randint(0, 85)), farm=f"F{f+1}"))
    for k in range(1, n):
        a, b = accts[k - 1], accts[k]
        key = ["device_id", "phone", "card_fingerprint", "delivery_address"][k % 4]
        b[key] = a[key]
    farms.append(accts)
farm_accts = [a for fa in farms for a in fa]
customers += farm_accts

orders = []
oid = 500000
def order(c, d, voucher, promo, refunded=False, reason="", rider=None):
    global oid; oid += 1
    value = round(R.uniform(28, 160), 2)
    disc = 40.0 if voucher else (round(min(value * 0.2, 25), 2) if promo else 0.0)
    orders.append(dict(order_id=f"O{oid}", order_date=d.strftime("%d/%m/%Y"), customer_id=c["customer_id"], customer_name=c["customer_name"], phone=c["phone"], email=c["email"],
                       device_id=c["device_id"], card_fingerprint=c["card_fingerprint"], delivery_address=c["delivery_address"], area=c["area"],
                       account_age_days=max(0, (d - c["signup"]).days), restaurant=R.choice(RESTOS), rider_id=rider or R.choice(RIDERS),
                       order_value_aed=value, promo_code="WELCOME40" if voucher else ("WEEKEND20" if promo else ""), discount_aed=disc,
                       refunded="yes" if refunded else "no", refund_reason=reason if refunded else "", refund_aed=round(value, 2) if refunded else 0.0))

# Genuine customers.
for c in customers:
    if c["farm"]: continue
    new = c["signup"] >= START
    n = R.choice([0, 1, 1, 2, 2, 3, 4, 5, 6]) + (1 if new else 0)
    for j in range(n):
        d = max(c["signup"], START) + dt.timedelta(days=R.randint(0, 89 - max(0, (c["signup"] - START).days)))
        if d > START + dt.timedelta(days=89): d = START + dt.timedelta(days=89)
        voucher = new and j == 0
        refunded = R.random() < 0.025
        order(c, d, voucher, (not voucher) and R.random() < 0.18, refunded, R.choice(["missing item", "late delivery", "wrong order", "cold food"]))
# Farm accounts: one welcome-voucher order each, almost never order again.
for a in farm_accts:
    order(a, a["signup"] + dt.timedelta(days=R.randint(0, 3)), True, False)
    if R.random() < 0.04: order(a, a["signup"] + dt.timedelta(days=R.randint(5, 20)), False, False)
# RIDER COLLUSION: rider R-217 marks deliveries as "missing item" with a ring of 35 customers; full refunds.
ring = R.sample([c for c in customers if not c["farm"]], 35)
for c in ring:
    for j in range(R.randint(3, 6)):
        order(c, START + dt.timedelta(days=R.randint(0, 89)), False, False, True, "missing item", rider="R-217")
R.shuffle(orders)

cols = list(orders[0].keys())
with open(OUT + "lazeez_orders.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(orders)

def s(rows, k): return round(sum(r[k] for r in rows), 2)
farm_ids = {a["customer_id"]: a["farm"] for a in farm_accts}
fo = [o for o in orders if o["customer_id"] in farm_ids]
welcome = [o for o in orders if o["promo_code"] == "WELCOME40"]
rr = [o for o in orders if o["rider_id"] == "R-217" and o["refunded"] == "yes"]
refunds = [o for o in orders if o["refunded"] == "yes"]
genuine_new = [c for c in customers if not c["farm"] and c["signup"] >= START]
repeat = lambda ids: sum(1 for i in ids if sum(1 for o in orders if o["customer_id"] == i) >= 2)
gn_ids = [c["customer_id"] for c in genuine_new]
truth = {
    "orders": len(orders), "customers": len({o["customer_id"] for o in orders}),
    "welcome_vouchers": {"orders": len(welcome), "aed": s(welcome, "discount_aed")},
    "farms": {f"F{i+1}": {"accounts": len(fa), "area": fa[0]["area"], "voucher_aed": round(40.0 * len(fa), 2)} for i, fa in enumerate(farms)},
    "farm_total": {"accounts": len(farm_accts), "voucher_aed": s([o for o in fo if o["promo_code"] == "WELCOME40"], "discount_aed"),
                   "share_of_welcome_spend_pct": round(100 * s([o for o in fo if o["promo_code"] == "WELCOME40"], "discount_aed") / s(welcome, "discount_aed"), 1)},
    "rider_R217": {"refunded_orders": len(rr), "customers": len({o["customer_id"] for o in rr}), "refund_aed": s(rr, "refund_aed"),
                   "share_of_all_refund_aed_pct": round(100 * s(rr, "refund_aed") / s(refunds, "refund_aed"), 1)},
    "repeat_rate_pct": {"genuine_new_users": round(100 * repeat(gn_ids) / len(gn_ids), 1), "farm_accounts": round(100 * repeat(list(farm_ids)) / len(farm_ids), 1)},
    "answer": "Do NOT cut the welcome voucher budget across the board: genuine new users repeat-order at a high rate. ~570 farm accounts in 3 chain-linked clusters (International City, Al Nahda, Deira) take a large share of welcome spend; block linked accounts (shared device/phone/card/address chains) and stop rider R-217's refund ring.",
}
json.dump(truth, open(OUT + "flagship_truth.json", "w"), indent=1)
print(json.dumps(truth, indent=1))
