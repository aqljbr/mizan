# Round 10 test data: four problems aimed at Mizan's predicted weak spots. Planted truth goes to truth10.json.
import csv, json, random, datetime as dt
import openpyxl

R = random.Random(10)
OUT = __file__.rsplit("/", 1)[0] + "/"
truth = {}

# ---------- A. Relief fraud across two files, chained rings, US dates (MM/DD/YYYY) ----------
apps, reg = [], []
ssn_pool = [f"{R.randint(100,899)}-{R.randint(10,99)}-{R.randint(1000,9999)}" for _ in range(5200)]
ssn_pool = list(dict.fromkeys(ssn_pool))
start = dt.date(2020, 4, 3)
def us(d): return d.strftime("%m/%d/%Y")
def phone(): return f"({R.randint(200,989)}) {R.randint(200,989)}-{R.randint(1000,9999)}"
def acct(): return f"{R.randint(10000000,99999999)}"
def addr(): return f"{R.randint(1,9999)} {R.choice(['Oak','Pine','Main','Elm','Lake','Hill','Cedar','Maple'])} {R.choice(['St','Ave','Rd','Blvd'])}, {R.choice(['Austin TX','Miami FL','Newark NJ','Atlanta GA','Phoenix AZ','Detroit MI'])}"
n = 4800
for i in range(n):
    d = start + dt.timedelta(days=R.randint(0, 120))
    apps.append(dict(app_id=f"A{100000+i}", business_name=f"Biz {i}", owner_ssn=ssn_pool[i], phone=phone(), bank_account=acct(), address=addr(),
                     loan_amount=round(R.lognormvariate(10.3, 0.7), -2), submitted=d, lender=R.choice(["Bank One", "Citi Small Biz", "Kabbage", "Cross River", "Harvest SB"])))
# SSA register for every SSN used + extras; 70 applicants have deceased / never-issued SSNs (needs the join).
bad_idx = R.sample(range(n), 70)
for s in ssn_pool:
    reg.append(dict(ssn=s, ssa_status="valid", issued_year=R.randint(1960, 2002)))
regmap = {r["ssn"]: r for r in reg}
for k, i in enumerate(bad_idx):
    regmap[apps[i]["owner_ssn"]]["ssa_status"] = "deceased" if k % 2 == 0 else "not_issued"
    if k % 2 == 1: regmap[apps[i]["owner_ssn"]]["issued_year"] = ""
truth["relief_bad_ssn"] = {"apps": 70, "amount": round(sum(apps[i]["loan_amount"] for i in bad_idx))}
# Chained ring: 48 apps, each consecutive pair shares ONE identifier (phone, bank or address), cycling. Every shared value appears exactly twice.
free = [i for i in range(n) if i not in bad_idx]
ring = R.sample(free, 48)
for k in range(47):
    a, b = apps[ring[k]], apps[ring[k + 1]]
    key = ["phone", "bank_account", "address"][k % 3]
    b[key] = a[key]
ring_amt = round(sum(apps[i]["loan_amount"] for i in ring))
truth["relief_chain_ring"] = {"apps": 48, "amount": ring_amt, "note": "each identifier shared by only 2 apps; linked only through chains"}
# Burst: 120 extra applications submitted 04/06/2020 - 04/10/2020 (a day-first reader would put them in June).
for j in range(120):
    d = dt.date(2020, 4, 6) + dt.timedelta(days=R.randint(0, 4))
    apps.append(dict(app_id=f"A{200000+j}", business_name=f"Biz B{j}", owner_ssn=R.choice(ssn_pool[4800:]) if len(ssn_pool) > 4800 else ssn_pool[j], phone=phone(), bank_account=acct(),
                     address=addr(), loan_amount=round(R.lognormvariate(10.3, 0.7), -2), submitted=d, lender="Kabbage"))
truth["relief_burst"] = "120 extra applications in the week of April 6 2020 (04/06-04/10), all via Kabbage"
for a in apps: a["submitted"] = us(a["submitted"])
R.shuffle(apps)
with open(OUT + "applications.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(apps[0].keys())); w.writeheader(); w.writerows(apps)
with open(OUT + "ssa_register.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["ssn", "ssa_status", "issued_year"]); w.writeheader(); w.writerows(reg)
truth["relief_total"] = {"apps": len(apps), "amount": round(sum(a["loan_amount"] for a in apps))}

# ---------- B. Churn: management blames price; the real drivers are support tickets and cash payment ----------
rows = []
for i in range(6000):
    plan = R.choice(["Basic", "Plus", "Premium"])
    fee = {"Basic": 99, "Plus": 149, "Premium": 229}[plan] + R.choice([-10, 0, 0, 10])
    tickets = min(9, int(R.expovariate(1 / (1.6 if plan == "Basic" else 1.1 if plan == "Plus" else 0.7))))
    pay = R.choices(["card", "cash", "bank_transfer"], [0.6, 0.25, 0.15])[0]
    tenure = R.randint(1, 48)
    logins = max(0, int(R.gauss(14, 6)))
    p = 0.07 + (0.38 if tickets >= 3 else 0) + (0.08 if pay == "cash" else 0) + (0.05 if tenure <= 3 else 0)
    rows.append(dict(customer_id=f"C{10000+i}", plan=plan, monthly_fee_aed=fee, tenure_months=tenure, support_tickets_90d=tickets,
                     payment_method=pay, app_logins_month=logins, emirate=R.choice(["Dubai", "Abu Dhabi", "Sharjah", "Ajman"]), churned="yes" if R.random() < p else "no"))
with open(OUT + "subscribers.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
def rate(fn):
    s = [r for r in rows if fn(r)]; return round(100 * sum(r["churned"] == "yes" for r in s) / len(s), 1), len(s)
truth["churn"] = {
    "overall": rate(lambda r: True),
    "tickets>=3": rate(lambda r: r["support_tickets_90d"] >= 3), "tickets<3": rate(lambda r: r["support_tickets_90d"] < 3),
    "cash": rate(lambda r: r["payment_method"] == "cash"), "card": rate(lambda r: r["payment_method"] == "card"),
    "Basic": rate(lambda r: r["plan"] == "Basic"), "Plus": rate(lambda r: r["plan"] == "Plus"), "Premium": rate(lambda r: r["plan"] == "Premium"),
    "Basic, tickets<3": rate(lambda r: r["plan"] == "Basic" and r["support_tickets_90d"] < 3),
    "Premium, tickets<3": rate(lambda r: r["plan"] == "Premium" and r["support_tickets_90d"] < 3),
    "answer": "Price is NOT the driver: within the same ticket level, plans churn alike. Basic churns more only because it gets more tickets. Fix support (3+ tickets) and cash-payment friction; a 15% price cut would cost revenue without fixing churn.",
}

# ---------- C. 5-year business case: numbers only in notes ----------
capex = 2_400_000; rev1 = 1_800_000; g = 0.25; gm = 0.62; opex1 = 750_000; og = 0.05; r_ = 0.12
cf, cum, payback = [], -capex, None
for y in range(1, 6):
    rev = rev1 * (1 + g) ** (y - 1); opex = opex1 * (1 + og) ** (y - 1); c = rev * gm - opex
    cf.append(round(c)); prev = cum; cum += c
    if payback is None and cum >= 0: payback = round(y - 1 + (-prev) / c, 2)
npv = -capex + sum(c / (1 + r_) ** (y + 1) for y, c in enumerate(cf))
truth["bizcase"] = {"cash_flows": cf, "npv_12pct": round(npv), "payback_years": payback, "pays_back_within_3_years": payback is not None and payback <= 3,
                    "answer": f"NPV ≈ AED {round(npv):,}; payback ≈ {payback} years, so NOT within 3 years"}

# ---------- D. Messy Arabic Excel: title rows, totals row, duplicates, mixed currency, day-first dates ----------
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "المبيعات"
ws.append(["تقرير المبيعات الشهري - سري"]); ws.append(["أُعدّ بواسطة: قسم المالية"]); ws.append([])
ws.append(["التاريخ", "الفرع", "القناة", "المبلغ", "العملة", "عدد الطلبات"])
branches = ["ديرة", "مردف", "الكرامة", "جميرا"]
srows = []
for m in range(1, 7):
    for b in branches:
        for ch in ["متجر", "أونلاين"]:
            for k in range(5):
                day = R.randint(1, 28)
                base = 42000 if ch == "متجر" else 18000
                if b == "ديرة" and m >= 4: base *= 0.62  # Deira drops ~38% in Q2
                amt = round(base * R.uniform(0.85, 1.15))
                cur = "AED"
                if ch == "أونلاين" and b == "جميرا": cur = "USD"; amt = round(amt / 3.6725)  # online Jumeirah booked in USD
                srows.append([f"{day:02d}/{m:02d}/2026", b, ch, amt, cur, R.randint(40, 300)])
dups = R.sample(srows, 25)
allrows = srows + [list(r) for r in dups]
R.shuffle(allrows)
for r in allrows: ws.append(r)
ws.append(["", "الإجمالي", "", sum(r[3] for r in allrows), "", ""])
wb.save(OUT + "sales_branches.xlsx")
def aed(r): return r[3] * (3.6725 if r[4] == "USD" else 1)
q = lambda r: 1 if int(r[0][3:5]) <= 3 else 2
by = {b: [round(sum(aed(r) for r in srows if r[1] == b and q(r) == k)) for k in (1, 2)] for b in branches}
truth["messy"] = {"true_by_branch_Q1_Q2_AED": by, "deira_change_pct": round(100 * (by["ديرة"][1] / by["ديرة"][0] - 1), 1),
                  "traps": "3 title rows before header; totals row at bottom; 25 duplicate rows; Jumeirah online in USD; dates DD/MM/YYYY (e.g. 13/02/2026)",
                  "true_total_AED": round(sum(aed(r) for r in srows))}
json.dump(truth, open(OUT + "truth10.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(truth, ensure_ascii=False, indent=1))
