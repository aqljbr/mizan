"""The consultant. Sees ONLY client_records(). Calibrates on weeks 1-8,
keeps weeks 9-12 frozen as holdout, and logs every decision."""
import json, math, statistics as st
from collections import Counter
from multiprocessing import Pool
from engine import World, metrics
import reality as R

W0, TRAIN, HOLD = R.WARMUP, 56, 84          # model timeline: warm-up, then obs days 0..84
LOG = []


def log(stage, action, **kw):
    LOG.append(dict(stage=stage, action=action, **kw))
    print(f"[{stage}] {action}" + "".join(f"\n    {k}: {v}" for k, v in kw.items()))


# ---------- observed KPIs straight from client records ----------
def obs_metrics(rec, d0, d1):
    ed = [x for x in rec['ed'] if d0 * 24 <= x['arrival'] < d1 * 24]
    adm = [x['departed'] - x['treated'] for x in ed if x['admitted']]
    wk = (d1 - d0) / 7
    return {'pct4h': 100 * sum(x['departed'] - x['arrival'] <= 4 for x in ed) / len(ed),
            'waits12h_wk': sum(x['departed'] - x['arrival'] > 12 for x in ed) / wk,
            'board_h': st.mean(adm),
            'cancel_wk': sum(d0 * 24 <= c < d1 * 24 for c in rec['cancelled']) / wk,
            'arr_day': len(ed) / (d1 - d0)}


def discharge_pattern(ward_rows, key='discharge'):
    ts = [x[key] for x in ward_rows]
    return {'pct_dis_before_noon': round(100 * sum(8 <= t % 24 < 12 for t in ts) / len(ts), 1),
            'pct_dis_weekend': round(100 * sum((t // 24) % 7 >= 5 for t in ts) / len(ts), 1)}


def lognorm_fit(xs):
    return (st.mean(xs), st.stdev(xs))


# ---------- calibration (TRAIN window only — holdout is never touched here) ----------
def calibrate(rec, mode):
    ed = [x for x in rec['ed'] if x['arrival'] < TRAIN * 24]
    days = Counter((d % 7) for d in range(TRAIN))
    tab = [[0.0] * 24 for _ in range(7)]
    for x in ed:
        d = int(x['arrival'] // 24); tab[d % 7][int(x['arrival'] % 24)] += 1
    tab = [[c / days[dow] for c in row] for dow, row in enumerate(tab)]
    # linear demand trend over training weeks
    daily = Counter(int(x['arrival'] // 24) for x in ed)
    xs, ys = list(range(TRAIN)), [daily[d] for d in range(TRAIN)]
    mx, my = st.mean(xs), st.mean(ys)
    slope = sum((a - mx) * (b - my) for a, b in zip(xs, ys)) / sum((a - mx) ** 2 for a in xs)
    trend = slope * 7 / my
    centre = (W0 + TRAIN / 2) / 7                 # table is average level at mid-train
    tab = [[r / (1 + trend * centre) for r in row] for row in tab]
    wd_days = sum(1 for d in range(TRAIN) if d % 7 < 5)
    el = sum(1 for x in rec['ward'] if x['source'] == 'EL' and x['admit'] < TRAIN * 24)
    el += sum(c < TRAIN * 24 for c in rec['cancelled'])
    p = dict(mode=mode, cubicles=rec['cubicles'], beds=rec['beds'], rate_table=tab,
             trend_per_week=trend, treat=lognorm_fit([x['treated'] - x['seen'] for x in ed]),
             p_admit=sum(x['admitted'] for x in ed) / len(ed), electives=round(el / wd_days),
             d2a_slots=0, d2a_los=21)
    ward = [x for x in rec['ward'] if x['admit'] < TRAIN * 24]
    p['stay_ED'] = [x['discharge'] - x['admit'] for x in ward if x['source'] == 'ED']
    p['stay_EL'] = [x['discharge'] - x['admit'] for x in ward if x['source'] == 'EL']
    if mode == 'process':
        wp = [x for x in rec['ward_process'] if x['admit'] < TRAIN * 24]
        p['fit_ED'] = lognorm_fit([(x['fit'] - x['admit']) / 24 for x in wp if x['source'] == 'ED'])
        p['fit_EL'] = lognorm_fit([(x['fit'] - x['admit']) / 24 for x in wp if x['source'] == 'EL'])
        p['round_hour'] = Counter(int(x['decision'] % 24) for x in wp).most_common(1)[0][0]
        p['tto'] = lognorm_fit([x['discharge'] - x['decision'] for x in wp if not x['social']])
        soc = [x for x in wp if x['social']]
        p['p_social'] = len(soc) / len(wp)
        p['social_mean'] = st.mean((x['discharge'] - x['decision']) / 24 for x in soc)
        # weekend decision probability: fit patients whose first eligible round is Sat/Sun
        hit = tot = 0
        for x in wp:
            first = math.floor((x['fit'] - p['round_hour']) / 24 + 1) * 24 + p['round_hour']
            if (first // 24) % 7 >= 5:
                tot += 1; hit += abs(x['decision'] - first) < 0.01
        p['weekend_prob'] = hit / tot
    return p


# ---------- running the consultant's model ----------
def _run(args):
    p, seed, d0, d1 = args
    w = World(p, seed).run(W0 + d1 + 7)
    m = metrics(w, W0 + d0, W0 + d1)
    if p['mode'] != 'ed_only':
        rows = [dict(discharge=x['dis']) for x in w.ward_log if (W0 + d0) * 24 <= x['admit'] < (W0 + d1) * 24]
        m.update(discharge_pattern(rows))
    return m


def simulate(p, d0, d1, seeds=12, pool=None):
    runs = pool.map(_run, [(p, 1000 + s, d0, d1) for s in range(seeds)])
    out = {}
    for k in runs[0]:
        v = sorted(r[k] for r in runs)
        out[k] = dict(mean=st.mean(v), lo=v[int(0.05 * len(v))], hi=v[int(0.95 * len(v)) - 1 if len(v) > 1 else 0])
    return out


def replay_demand(p, rec, d0, d1):
    """Condition the model on observed daily arrivals in [d0,d1): tests mechanism, not forecast."""
    daily = Counter(int(x['arrival'] // 24) for x in rec['ed'])
    ser = {}
    for d in range(d0, d1):
        D = W0 + d
        expected = sum(p['rate_table'][D % 7]) * (1 + p['trend_per_week'] * D / 7)
        ser[D] = daily[d] / expected
    return {**p, 'day_mult_series': ser}


def validate(p, rec, pool, label):
    """Level A/B/C checks. Level C = frozen holdout (weeks 9-12)."""
    report = {}
    # A: invariants are asserted on every event inside World; replay must be deterministic
    a1, a2 = _run((p, 7, 0, 14)), _run((p, 7, 0, 14))
    report['A_seed_replay'] = 'pass' if a1 == a2 else 'FAIL'
    # B: boundary case — infinite capacity => nobody queues or boards, so %4h must equal
    # P(treatment <= 4h) of the fitted lognormal (v0 of this test wrongly expected >97%)
    m, sd = p['treat']; s2 = math.log(1 + (sd / m) ** 2)
    expect = 100 * 0.5 * (1 + math.erf((math.log(4) - (math.log(m) - s2 / 2)) / math.sqrt(2 * s2)))
    b = _run(({**p, 'cubicles': 500, 'beds': 2000}, 3, 0, 28))
    ok = abs(b['pct4h'] - expect) < 1.0 and b['board_h'] < 0.01 and b['cancel_wk'] == 0
    report['B_infinite_capacity'] = 'pass' if ok else f"FAIL got {b['pct4h']:.1f} expect {expect:.1f}"
    # C: holdout — observed must sit inside the model's simulation band (widened by 10% tolerance)
    pred = simulate(p, TRAIN, HOLD, pool=pool)
    obs = obs_metrics(rec, TRAIN, HOLD)
    if p['mode'] != 'ed_only':
        obs.update(discharge_pattern([x for x in rec['ward'] if TRAIN * 24 <= x['admit'] < HOLD * 24]))
    checks = {}
    for k, o in obs.items():
        if k == 'arr_day' or k not in pred:
            continue
        lo, hi = pred[k]['lo'], pred[k]['hi']
        tol = 0.10 * max(abs(pred[k]['mean']), 1)
        checks[k] = dict(observed=round(o, 1), predicted=round(pred[k]['mean'], 1),
                         band=[round(lo, 1), round(hi, 1)],
                         verdict='pass' if lo - tol <= o <= hi + tol else 'FAIL')
    report['C_holdout'] = checks
    report['C_overall'] = 'pass' if all(c['verdict'] == 'pass' for c in checks.values()) else 'FAIL'
    log('VALIDATE', f'{label}: validity A/B/C', A=report['A_seed_replay'], B=report['B_infinite_capacity'],
        C=report['C_overall'], detail={k: f"obs {c['observed']} vs pred {c['predicted']} {c['band']} -> {c['verdict']}"
                                       for k, c in checks.items()})
    return report
