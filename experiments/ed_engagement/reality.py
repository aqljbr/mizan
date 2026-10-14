"""HIDDEN GROUND TRUTH. The consultant never reads these parameters; it only
receives the records `client_records()` hands over when evidence is requested.
Reality has features the consultant's models don't: day-level demand noise,
a demand trend, a weekend decision gap and slow care-home placements."""
from engine import World

TRUTH = dict(
    mode='process', cubicles=36, beds=335,
    daily=205, dow_mult=[1.12, 1.03, 1.0, 0.99, 1.0, 0.93, 0.93],
    day_noise_cv=0.08, trend_per_week=0.005,
    treat=(2.0, 1.3), p_admit=0.26, electives=14,
    fit_ED=(4.2, 3.5), fit_EL=(2.5, 1.5),
    round_hour=11, tto=(3.2, 1.5), weekend_prob=0.40,
    p_social=0.08, social_mean=3.5, d2a_slots=0, d2a_los=21,
)
WARMUP, OBS_DAYS = 35, 84   # 12 observed weeks after warm-up


def reality(seed=2026, **changes):
    return World({**TRUTH, **changes}, seed).run(WARMUP + OBS_DAYS + 7)


def client_records(w, level):
    """level 1: routine extracts. level 2: discharge-process timestamps (on request)."""
    lo, hi = WARMUP * 24, (WARMUP + OBS_DAYS) * 24
    rebase = lambda t: t - WARMUP * 24
    ed = [dict(arrival=rebase(x['arr']), seen=rebase(x['seen']), treated=rebase(x['tdone']),
               departed=rebase(x['dep']), admitted=x['adm']) for x in w.ed_log if lo <= x['arr'] < hi]
    ward = [x for x in w.ward_log if lo <= x['admit'] < hi]
    rec = dict(ed=ed, ward=[dict(admit=rebase(x['admit']), discharge=rebase(x['dis']), source=x['src'])
                            for x in ward],
               cancelled=[rebase(c) for c in w.cancelled if lo <= c < hi],
               beds=TRUTH['beds'], cubicles=TRUTH['cubicles'])
    if level >= 2:
        rec['ward_process'] = [dict(admit=rebase(x['admit']), fit=rebase(x['fit']),
                                    decision=rebase(x['decision']), discharge=rebase(x['dis']),
                                    source=x['src'], social=x['social'])
                               for x in ward if 'fit' in x]
    return rec
