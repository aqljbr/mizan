"""Stages 4-7: conditional revalidation, agent interrogation, targeted evidence, v3."""
import json, pickle, statistics as st
from multiprocessing import Pool
import reality as R
from consultant import *

if __name__ == '__main__':
    rec1 = pickle.load(open('rec1.pkl', 'rb'))
    with Pool() as pool:
        for mode in ('ed_only', 'stay'):
            p = replay_demand(calibrate(rec1, mode), rec1, 0, HOLD)
            validate(p, rec1, pool, f'{mode} + demand replay')

        log('INTERROGATE', 'Ask ward-manager ENTITY agent (LLM persona): "why do discharges cluster mid-afternoon '
            'and drop at weekends?"  -> rationale recorded as HYPOTHESES, not evidence',
            H1='"Decisions wait for the late-morning consultant ward round"',
            H2='"After the decision we wait hours for pharmacy to dispense take-home meds (TTO)"',
            H3='"At weekends there is rarely a senior doctor to sign discharges"',
            H4='"Patient transport is slow"',
            H5='"Some patients wait days for a care-home placement"',
            evidence_needed='per-patient: medically-fit time, discharge-decision time, social-care flag')
        log('EVIDENCE', 'Request level-2 discharge-process timestamps from client (highest value of information: '
            'v2 cannot evaluate ANY discharge-process intervention)')
        rec2 = R.client_records(R.reality(), level=2)
        pickle.dump(rec2, open('rec2.pkl', 'wb'))

        wp = [x for x in rec2['ward_process'] if x['admit'] < TRAIN * 24]
        dec_h = Counter(int(x['decision'] % 24) for x in wp)
        p3 = calibrate(rec2, 'process')
        fit_to_dec = [(x['decision'] - x['fit']) / 24 for x in wp]
        tto = [x['discharge'] - x['decision'] for x in wp if not x['social']]
        soc = [(x['discharge'] - x['decision']) / 24 for x in wp if x['social']]
        days = TRAIN
        beds_waiting_round = sum(fit_to_dec) / days
        wk_extra = [d for x, d in zip(wp, fit_to_dec) if d > 1.0]
        log('TEST-HYPOTHESES', 'Confront agent rationales with level-2 data (training window only)',
            H1=f"SUPPORTED: {100 * dec_h[p3['round_hour']] / len(wp):.0f}% of decisions at {p3['round_hour']}:00; "
               f"fit->decision wait avg {st.mean(fit_to_dec):.2f} d",
            H2=f"SUPPORTED: decision->discharge (non-social) {st.mean(tto):.1f} h mean",
            H3=f"SUPPORTED: weekend P(decision at first round) = {p3['weekend_prob']:.2f} vs 1.00 weekdays",
            H4="UNTESTABLE with available data: transport is not timestamped; any effect is absorbed into H2's interval",
            H5=f"SUPPORTED but small in flow: {100 * p3['p_social']:.1f}% of patients, avg {st.mean(soc):.1f} d wait",
            fit_patients_occupying_beds=f"{(sum(fit_to_dec) + sum(tto) / 24 + sum(soc)) / days:.1f} beds/day are held by "
                                        f"medically-fit patients (of {rec2['beds']})")
        p3r = replay_demand(p3, rec2, 0, HOLD)
        v3 = validate(p3r, rec2, pool, 'v3 process model + demand replay')
        pickle.dump(p3, open('p3.pkl', 'wb'))
    json.dump(LOG, open('log_stage2.json', 'w'), indent=1, default=str)
