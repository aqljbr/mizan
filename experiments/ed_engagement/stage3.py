"""Stages 8-11: entity negotiation, strategy experiments, robustness, (oracle check)."""
import json, pickle, statistics as st
from multiprocessing import Pool
import reality as R
from consultant import *

# Costs are ASSUMPTIONS to be confirmed by the client's finance team (annual, incl. annualised capex)
STRATS = {
    'S0 baseline':                       ({}, 0.0),
    'S1 +10 ED cubicles (client idea)':  ({'cubicles': +10}, 2.5),
    'S2 +20 ward beds':                  ({'beds': +20}, 5.0),
    'S3a ward round 11:00 -> 09:00':     ({'round_hour': 9}, 0.1),
    'S3b TTO prepared at round':         ({'tto': (1.0, 0.6)}, 0.35),
    'S3c weekend discharge cover':       ({'weekend_prob': 0.85}, 0.6),
    'S3 discharge redesign (a+b+c)':     ({'round_hour': 9, 'tto': (1.0, 0.6), 'weekend_prob': 0.85}, 1.05),
}


def negotiate():
    """Hospital entity <-> care-home entity. Agents propose; the ledger/constraint check commits."""
    care = dict(beds=120, occupied=106, cost_day=185, la_tariff=165)
    hosp_max, offer, ask, k = 260, 170, 240, 12
    rounds = []
    while ask - offer > 5:
        rounds.append((offer, ask))
        offer, ask = offer + 0.4 * (ask - offer), ask - 0.3 * (ask - offer)
    price = round((offer + ask) / 2)
    vacant = care['beds'] - care['occupied']
    checks = {'price >= care-home cost +8%': price >= care['cost_day'] * 1.08,
              'price <= hospital max': price <= hosp_max,
              f'slots {k} <= vacant {vacant} - 2 buffer': k <= vacant - 2}
    big = 60
    log('NEGOTIATE', 'Entity agents: hospital <-> care home, block contract for step-down (21-day) slots',
        offer_rounds=rounds, agreed=f'{k} slots @ ${price}/day = ${k * price * 365 / 1e6:.2f}M/yr',
        constraint_engine=checks, rejected=f'hospital also asked for {big} slots -> REJECTED: only {vacant} vacant beds')
    return k, k * price * 365 / 1e6


def forward(p3, rec):
    """Forward world: demand at the level of the last complete holdout weeks (9-11), no replay."""
    lvl = sum(1 for x in rec['ed'] if 56 * 24 <= x['arrival'] < 77 * 24) / 21
    base = sum(sum(r) for r in p3['rate_table']) / 7 * (1 + p3['trend_per_week'] * (W0 + 70) / 7)
    f = lvl / base
    return {**p3, 'rate_table': [[r * f for r in row] for row in p3['rate_table']], 'trend_per_week': 0.0}


def apply(p, ch):
    q = dict(p)
    for k, v in ch.items():
        q[k] = q[k] + v if k in ('cubicles', 'beds') else v
    return q


if __name__ == '__main__':
    rec = pickle.load(open('rec2.pkl', 'rb')); p3 = pickle.load(open('p3.pkl', 'rb'))
    k, cost = negotiate()
    STRATS['S4 care-home block contract'] = ({'d2a_slots': k}, round(cost, 2))
    STRATS['S5 = S3 + S4'] = ({**STRATS['S3 discharge redesign (a+b+c)'][0], 'd2a_slots': k}, round(1.05 + cost, 2))
    STRATS['S6 = S1 + S3 (cubicles AND redesign)'] = ({'cubicles': 10, 'round_hour': 9, 'tto': (1.0, 0.6),
                                                      'weekend_prob': 0.85}, 3.55)
    fwd = forward(p3, rec)
    scen = {'base': fwd,
            'demand +8%': {**fwd, 'rate_table': [[r * 1.08 for r in row] for row in fwd['rate_table']]},
            'LOS +10%': {**fwd, 'fit_ED': (fwd['fit_ED'][0] * 1.1, fwd['fit_ED'][1] * 1.1)}}
    res = {}
    with Pool() as pool:
        for s, (ch, c) in STRATS.items():
            res[s] = {'cost_M': c}
            for sc, p in scen.items():
                m = simulate(apply(p, ch), 0, 84, seeds=16, pool=pool)
                res[s][sc] = {k_: round(v['mean'], 1) for k_, v in m.items() if k_ in ('pct4h', 'waits12h_wk', 'cancel_wk')}
                res[s][sc]['pct4h_p5'] = round(m['pct4h']['lo'], 1)
        print(f"\n{'strategy':40s} {'$M/yr':>6s} | {'base 4h%':>8s} {'p5':>5s} {'12h/wk':>6s} {'canc/wk':>7s} | "
              f"{'dem+8% 4h':>9s} {'12h/wk':>6s} | {'LOS+10% 4h':>10s}")
        for s, r in res.items():
            b, d, l = r['base'], r['demand +8%'], r['LOS +10%']
            print(f"{s:40s} {r['cost_M']:6.2f} | {b['pct4h']:8.1f} {b['pct4h_p5']:5.1f} {b['waits12h_wk']:6.1f} "
                  f"{b['cancel_wk']:7.1f} | {d['pct4h']:9.1f} {d['waits12h_wk']:6.1f} | {l['pct4h']:10.1f}")

        # ---------- ORACLE (impossible in a real engagement): same interventions in hidden reality ----------
        true = {}
        for s in ('S0 baseline', 'S1 +10 ED cubicles (client idea)', 'S2 +20 ward beds',
                  'S3 discharge redesign (a+b+c)', 'S4 care-home block contract', 'S5 = S3 + S4'):
            ch = STRATS[s][0]
            truth_ch = {k_: (R.TRUTH[k_] + v if k_ in ('cubicles', 'beds') else v) for k_, v in ch.items()}
            ws = [R.reality(seed=9000 + i, **truth_ch) for i in range(12)]
            ms = [metrics(w, R.WARMUP + 56, R.WARMUP + 84) for w in ws]
            true[s] = {k_: round(st.mean(m[k_] for m in ms), 1) for k_ in ('pct4h', 'waits12h_wk', 'cancel_wk')}
        print('\nORACLE: predicted effect (model, base scenario) vs TRUE effect in hidden reality (weeks 9-12)')
        b0, t0 = res['S0 baseline']['base'], true['S0 baseline']
        for s, t in true.items():
            pr = res[s]['base']
            print(f"{s:40s} 4h: pred {pr['pct4h'] - b0['pct4h']:+6.1f}  true {t['pct4h'] - t0['pct4h']:+6.1f}   "
                  f"12h/wk: pred {pr['waits12h_wk'] - b0['waits12h_wk']:+7.1f}  true {t['waits12h_wk'] - t0['waits12h_wk']:+7.1f}"
                  f"   (true level {t['pct4h']:.1f}%)")
    json.dump(dict(log=LOG, results=res, oracle=true), open('log_stage3.json', 'w'), indent=1, default=str)
