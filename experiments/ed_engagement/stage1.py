"""Stages 1-3: frame, demand evidence, build v1, validate, route failure."""
import json, pickle
from multiprocessing import Pool
import reality as R
from consultant import *

if __name__ == '__main__':
    log('FRAME', 'Interpret brief',
        client_claim='"ED overcrowded; buy 10 more ED cubicles"',
        symptom='4-hour target breached, long waits',
        client_cause_hypothesis='ED has too few cubicles (UNTESTED - treated as one hypothesis among several)',
        competing_hypotheses=['ED cubicle capacity at peak hours', 'exit block: admitted patients board in ED for want of ward beds',
                              'ward discharge process timing', 'demand growth'],
        objectives='primary: % within 4h, 12h waits; guardrails: elective cancellations, cost/yr, safety')
    log('EVIDENCE', 'Request critical evidence (ranked by power to change the decision)',
        critical=['patient-level ED timestamps: arrival, seen, treated, departed, admitted flag',
                  'ward admissions & discharges with source (ED/elective)', 'elective cancellations', 'bed & cubicle counts'],
        useful_later=['discharge-process timestamps (medically fit, decision, TTO)', 'care-home placement waits'],
        not_requested='staff rosters, case-mix codes (would not change the cubicles-vs-beds decision yet)')
    w = R.reality()
    rec = R.client_records(w, level=1)
    pickle.dump(rec, open('rec1.pkl', 'wb'))
    log('EVIDENCE', 'Client supplied level-1 records',
        ed_rows=len(rec['ed']), ward_rows=len(rec['ward']), split='weeks 1-8 calibration / weeks 9-12 FROZEN holdout',
        observed_train=({k: round(v, 1) for k, v in obs_metrics(rec, 0, TRAIN).items()}))

    with Pool() as pool:
        p1 = calibrate(rec, 'ed_only')
        log('CONSTRUCT', 'Model v1: ED-only queue (cheapest model consistent with client framing)',
            params={'treat_mean_h': round(p1['treat'][0], 2), 'p_admit': round(p1['p_admit'], 3),
                    'trend_per_week': round(p1['trend_per_week'], 4)})
        v1 = validate(p1, rec, pool, 'v1')
        p2 = calibrate(rec, 'stay')
        log('CONSTRUCT', 'Model v2: ED + ward with boarding; ward stay resampled from observed stays',
            electives_per_weekday=p2['electives'])
        v2 = validate(p2, rec, pool, 'v2')
    json.dump(LOG, open('log_stage1.json', 'w'), indent=1, default=str)
