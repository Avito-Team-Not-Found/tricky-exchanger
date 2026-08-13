# Simulator report (synthetic_v1)

- seed: `42`
- n_chains: `10000`
- n_rows: `22304`
- csv: `../data/synthetic_v1.csv`
- report: `../reports/sim_v1.md`

## Self-checks

| check | status | detail |
|---|---|---|
| ranges | PASS | 22304 rows, types/ranges ok |
| reliability_mean | PASS | ≡ 0.75 on all rows |
| categories | PASS | wanted[i] == offered[(i+1)%n] for all chains |
| base_rate | PASS | P(label=COMPLETED)=0.3786 (want [0.30, 0.45]) |
| monotonicity | PASS | P(comp\|IN_PROGRESS)=0.9631; P(comp\|FROZEN)=0.8075 [0.80,0.90]; P(comp\|PROPOSED)=0.5440 [0.40,0.60]; P(comp\|CANDIDATE)=0.1926 [0.15,0.30] |
| frozen_broken | PASS | P(BROKEN\|FROZEN)=0.1925 (want [0.03, 0.20]) n=2327 |
| in_progress | PASS | IN_PROGRESS rows=1951; frozen chains=2327 no_show=376 (want rows = frozen−no_show = 1951) |
| volume | PASS | 10000 chains / 22304 rows (want ~20000–30000 rows) |
| determinism | PASS | second generate(seed) matched byte-for-byte |

## Funnel (rows)

| stage | rows | P(COMPLETED) |
|---|---:|---:|
| CANDIDATE | 14572 | 0.1926 |
| PROPOSED | 3454 | 0.5440 |
| FROZEN | 2327 | 0.8075 |
| IN_PROGRESS | 1951 | 0.9631 |

## Labels (chains)

- COMPLETED: 1879 (0.1879)
- BROKEN: 8121 (0.8121)

## Break reasons (chains)

- completed: 1879
- item_mismatch: 72
- no_show: 376
- proposed_timeout: 6546
- replacement_fail: 1127

## Notes

- After FROZEN the funnel splits: `no_show` (no IN_PROGRESS row) vs ship to PVZ then `item_mismatch`/`completed`.
- Extra RNG draws after FROZEN change the CSV vs older simulator versions even at the same seed.

## Tests

```bash
cd ml/simulator && go test . -v
```
