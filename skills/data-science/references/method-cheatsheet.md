# Method cheatsheet (data-science)

Load this when the method family is known and you need the concrete library/crate mapping and a minimal runnable check.

## Library / crate mapping

Prefer Python libraries already present in the project first. For Rust, name the crate/API and the interop boundary.

| Family | Python (prefer installed) | Rust crate (name the API) | Interop |
|---|---|---|---|
| Inference (CI, hypothesis) | `scipy.stats`, `statsmodels` | `statrs` | convert samples via `ndarray`/`pyo3` |
| Experimental design | `statsmodels`, `scipy.stats` | `statrs` | pass group labels + values |
| Supervised ML | `scikit-learn` | `linfa` | model build in Rust, or `sklearn` in Python |
| Unsupervised ML | `scikit-learn` | `linfa-clustering` | fit then export labels |
| RL | `gymnasium` + algorithm lib | `mlrl` / CRATE API | env boundary, not per-step Python calls |
| Optimization | `scipy.optimize`, `pulp` | `argmin`, `good_lp` | hand off objective + constraints |

Always use Polars for dataframe manipulation if you can.

## Multiple comparisons (inference)

- If a report runs more than one hypothesis test or inspects many candidate features/coefficients, correct for multiplicity (Bonferroni is safe, Holm is a strictly-more-powerful drop-in; both via `statsmodels.stats.multitest.multipletests`).
- State plainly-corrected p-values against your alpha; a raw p<0.05 across, say, 20 tests is not evidence. Label screening/many-test runs as exploratory, not confirmatory.
- Never let the number of tests surprise you: count them (tests x features x seeds) before reporting any threshold crossing.

## Reinforcement learning checks

- **Stationarity:** assert the environment/reward distribution is stable across the eval horizon; a non-stationary env invalidates a fixed resume buffer and offline data reuse. Report drift (per-episode mean/std of reward) before trusting stops.
- **Reward hacking:** the agent optimizes the reward you coded, not the goal; watch for degenerate-but-high-reward policies (infinite loops, exploiting negatives/caps) and keep a separate human/validation metric that cannot be gamed.
- **Exploration:** report epsilon/entropy/action coverage; a policy that collapsed to one action without exploring has high-variance value estimates. Verify early exploration before judging final performance.
- **Evaluation, on- vs off-policy:** estimate a policy's value *on-policy* (roll out under that policy) or correctly importance-sample, never just replay the behaviour data as if it were the result. State which you are reporting.
- **Seed variance:** RL is high-variance; report the mean and spread over ≥5 seeds, and do not call a seed-1 run a result.

## Optimization reporting rules

- **Stopping:** state the stopping rule upfront (max iterations, function-tolerance/`gtol`, time, budget-count). Report whether you hit a convergent stop or the budget — a "converged" claim requires the criterion, not just reaching iterations.
- **Constraints:** list every constraint, whether it is binding at the optimum (Lagrange/dual status or `resid<tol`), and how feasibility is enforced (projection, penalty, barrier, solver handles). A solution that violates a hard constraint is not a solution.
- **Solver/fidelity:** name the solver and its settings/version; for local solvers report the starting point(s)/seeds tried and that a restart or multi-start did not change the optimum (or that it did). State gradient/derivative fidelity (analytic vs finite-difference) when it affects the result.

## Safety-check template (minimal, runnable)

Every deliverable ends with ONE check that fails if the method/split is wrong. Adapt the metric line to the family.

```python
# check_split.py  (stdlib-only, splits by GROUP not by row, leaks nothing)
import random

def main(split_ratio=0.2, seed=42):
    rng = random.Random(seed)
    # Each row belongs to one group (the sampling unit); split by group, never by row.
    groups = list(range(30))                            # 30 groups, 4 rows each
    rng.shuffle(groups)                                 # shuffle *groups*
    cut = int(len(groups) * (1 - split_ratio))
    tr_g, va_g = set(groups[:cut]), set(groups[cut:])
    # no group spans both splits, and every group is used exactly once
    assert not tr_g & va_g, "group leakage"
    assert len(tr_g | va_g) == len(groups), "dropped a group"
    print("check_split: ok", len(tr_g), "train groups;", len(va_g), "val groups")

if __name__ == "__main__":
    main()
```

Replace the split/grouping logic with the real schema's sampling unit; the assertion is the ceiling for acceptance. For RL, assert the rollout/env keeps each episode in one split.

> ponytail: this is a structural template, not a per-method suite — extend the assertion lines, do not add frameworks.
