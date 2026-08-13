# Simulator report (synthetic_v1)

- seed: `42`
- n_chains: `10000`
- n_rows: `20708`
- csv: `ml/data/synthetic_v1.csv`
- report: `ml/reports/sim_v1.md`

## Self-checks

| check | status | detail |
|---|---|---|
| ranges | PASS | 20708 rows, types/ranges ok |
| reliability_mean | PASS | ≡ 0.75 on all rows |
| categories | PASS | wanted[i] == offered[(i+1)%n] for all chains |
| base_rate | PASS | P(label=COMPLETED)=0.3468 (want [0.30, 0.45]) |
| monotonicity | PASS | P(comp\|FROZEN)=0.8253 [0.80,0.90]; P(comp\|PROPOSED)=0.5655 [0.40,0.60]; P(comp\|CANDIDATE)=0.2106 [0.15,0.30] |
| frozen_broken | PASS | P(BROKEN\|FROZEN)=0.1747 (want [0.03, 0.20]) n=2490 |
| volume | PASS | 10000 chains / 20708 rows (want ~20000–25000 rows) |
| determinism | PASS | second generate(seed) matched byte-for-byte |

## Funnel (rows)

| stage | rows | P(COMPLETED) |
|---|---:|---:|
| CANDIDATE | 14584 | 0.2106 |
| PROPOSED | 3634 | 0.5655 |
| FROZEN | 2490 | 0.8253 |

## Labels (chains)

- COMPLETED: 2055 (0.2055)
- BROKEN: 7945 (0.7945)

## Break reasons (chains)

- completed: 2055
- confirm_timeout: 1144
- freeze_fail: 435
- proposed_timeout: 6366

## Notes

- formula_score from `pkg/utils/ranker` FormulaRanker (`ChainScoreCalculator`) on the same ChainState prod would see.
- LightGBM columns after `raw_json` follow `ml/features.json`.
- `raw_json` is oracle-only (latents including fraud); do not train on it.


## Запуск тестов
```bash
go test ./ml/simulator -v
```