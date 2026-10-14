"""Discrete-event hospital world: ED cubicles + inpatient ward + discharge process.

Shared by the hidden 'reality' and by the consultant's models. The consultant's
models switch mechanisms on/off and use calibrated (not true) parameters.
Agents may propose actions; only this engine commits state changes, and
invariants are asserted after every event (validity level A).
"""
import heapq, math, random
from collections import deque

HOURLY_SHAPE = [0.45, 0.38, 0.32, 0.30, 0.30, 0.35, 0.50, 0.75, 1.10, 1.40, 1.55, 1.55,
                1.50, 1.45, 1.40, 1.35, 1.30, 1.30, 1.25, 1.15, 1.00, 0.85, 0.70, 0.55]
_S = sum(HOURLY_SHAPE)
HOURLY_SHAPE = [x / _S for x in HOURLY_SHAPE]


def lognorm(rng, mean, sd):
    s2 = math.log(1 + (sd / mean) ** 2)
    return rng.lognormvariate(math.log(mean) - s2 / 2, math.sqrt(s2))


def poisson(rng, lam):
    if lam > 30:
        return max(0, int(round(rng.gauss(lam, math.sqrt(lam)))))
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


class World:
    """params keys:
    mode: 'ed_only' | 'stay' (sampled whole ward stay) | 'process' (fit -> round -> TTO/social)
    arrivals: hourly rate table [weekday 0-6][hour] OR (daily, dow_mult) for reality
    """

    def __init__(self, p, seed):
        self.p, self.rng = p, random.Random(seed)
        self.q, self.seq, self.t = [], 0, 0.0
        self.ed_free, self.beds_free = p['cubicles'], p['beds']
        self.ed_wait, self.board = deque(), deque()
        self.fit_waiting = []          # fit patients awaiting a ward-round decision
        self.ed_log, self.ward_log, self.cancelled = [], [], []
        self.n_in_ed = 0
        self.d2a_free = p.get('d2a_slots', 0)   # contracted step-down care-home slots

    # ---- event plumbing
    def at(self, t, kind, x=None):
        self.seq += 1
        heapq.heappush(self.q, (t, self.seq, kind, x))

    def run(self, days):
        for d in range(days):
            self.at(d * 24.0, 'day', d)
        end = days * 24.0
        while self.q and self.q[0][0] < end:
            self.t, _, kind, x = heapq.heappop(self.q)
            getattr(self, 'on_' + kind)(x)
            self.check()
        return self

    def check(self):
        p = self.p
        assert 0 <= self.ed_free <= p['cubicles'], 'cubicle invariant'
        assert 0 <= self.beds_free <= p['beds'], 'bed invariant'
        assert self.ed_free + self.n_in_ed == p['cubicles'], 'ED conservation'
        assert 0 <= self.d2a_free <= p.get('d2a_slots', 0), 'care-home slot invariant'

    # ---- arrivals & electives
    def rate(self, day, hour):
        p, dow = self.p, day % 7
        if 'rate_table' in p:
            r = p['rate_table'][dow][hour]
        else:
            r = p['daily'] * p['dow_mult'][dow] * HOURLY_SHAPE[hour]
        return r * self.day_mult * (1 + p.get('trend_per_week', 0) * day / 7)

    def on_day(self, d):
        p, rng = self.p, self.rng
        cv = p.get('day_noise_cv', 0)
        self.day_mult = rng.gammavariate(1 / cv ** 2, cv ** 2) if cv else 1.0
        self.day_mult = p.get('day_mult_series', {}).get(d, self.day_mult)   # demand replay
        for h in range(24):
            for _ in range(poisson(rng, self.rate(d, h))):
                pt = {'arr': d * 24 + h + rng.random(), 'adm': rng.random() < p['p_admit']}
                self.at(pt['arr'], 'arrive', pt)
        if d % 7 < 5 and p['mode'] != 'ed_only':
            self.at(d * 24 + 8, 'electives', p['electives'])
        if p['mode'] == 'process':
            self.at(d * 24 + p['round_hour'], 'round', d)

    def on_arrive(self, pt):
        if self.ed_free > 0:
            self.start(pt)
        else:
            self.ed_wait.append(pt)

    def start(self, pt):
        self.ed_free -= 1; self.n_in_ed += 1
        pt['seen'] = self.t
        self.at(self.t + lognorm(self.rng, *self.p['treat']), 'treated', pt)

    def leave_ed(self, pt):
        pt['dep'] = self.t
        self.ed_log.append(pt)
        self.ed_free += 1; self.n_in_ed -= 1
        if self.ed_wait:
            self.start(self.ed_wait.popleft())

    def on_treated(self, pt):
        pt['tdone'] = self.t
        if not pt['adm'] or self.p['mode'] == 'ed_only':
            return self.leave_ed(pt)
        if self.beds_free > 0:
            self.admit(pt, 'ED'); self.leave_ed(pt)
        else:
            self.board.append(pt)      # boards: keeps holding the ED cubicle

    def on_electives(self, n):
        for _ in range(n):
            if self.beds_free > 0:
                self.admit({'arr': self.t}, 'EL')
            else:
                self.cancelled.append(self.t)

    # ---- ward
    def admit(self, pt, src):
        p, rng = self.p, self.rng
        self.beds_free -= 1
        w = {'admit': self.t, 'src': src, 'social': rng.random() < p.get('p_social', 0)}
        if p['mode'] == 'stay':
            stay = rng.choice(p['stay_ED'] if src == 'ED' else p['stay_EL'])
            self.at(self.t + stay, 'discharge', w)
        else:
            los = lognorm(rng, *(p['fit_ED'] if src == 'ED' else p['fit_EL']))
            self.at(self.t + los * 24, 'fit', w)

    def on_fit(self, w):
        w['fit'] = self.t
        self.fit_waiting.append(w)

    def on_round(self, d):
        p, rng = self.p, self.rng
        weekend = d % 7 >= 5
        keep = []
        for w in self.fit_waiting:
            if weekend and rng.random() > p['weekend_prob']:
                w.setdefault('reasons', []).append('weekend: no senior decision-maker')
                keep.append(w); continue
            w['decision'] = self.t
            if w['social']:
                w.setdefault('reasons', []).append('awaiting care-home placement')
                if self.d2a_free > 0:      # contracted slot: fast transfer, slot held d2a_los days
                    self.d2a_free -= 1; w['d2a'] = True
                    self.at(self.t + rng.expovariate(2.0) * 24, 'discharge', w)
                else:
                    self.at(self.t + rng.expovariate(1 / p['social_mean']) * 24, 'discharge', w)
            else:
                w.setdefault('reasons', []).append('awaiting pharmacy TTO')
                self.at(self.t + lognorm(rng, *p['tto']), 'discharge', w)
        self.fit_waiting = keep

    def on_discharge(self, w):
        w['dis'] = self.t
        self.ward_log.append(w)
        self.beds_free += 1
        if w.get('d2a'):
            self.at(self.t + self.p['d2a_los'] * 24, 'd2a_release')
        if self.board:
            pt = self.board.popleft()
            self.admit(pt, 'ED'); self.leave_ed(pt)


    def on_d2a_release(self, _):
        self.d2a_free += 1


def metrics(w, d0, d1):
    """KPIs for patients arriving in days [d0, d1)."""
    ed = [x for x in w.ed_log if d0 * 24 <= x['arr'] < d1 * 24]
    weeks = (d1 - d0) / 7
    adm = [x['dep'] - x['tdone'] for x in ed if x['adm'] and 'tdone' in x]
    return {
        'pct4h': 100 * sum(x['dep'] - x['arr'] <= 4 for x in ed) / max(1, len(ed)),
        'waits12h_wk': sum(x['dep'] - x['arr'] > 12 for x in ed) / weeks,
        'board_h': sum(adm) / max(1, len(adm)),
        'cancel_wk': sum(d0 * 24 <= c < d1 * 24 for c in w.cancelled) / weeks,
        'arr_day': len(ed) / (d1 - d0),
    }
