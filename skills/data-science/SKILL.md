---
name: data-science
description: Use for statistical inference, experimental design, supervised or unsupervised machine learning, reinforcement learning, and continuous, discrete, or constrained optimization.
---

# Data science workflow

Follow the decision gate first, then the pipeline. Do not pick a method before the framing is complete; do not report a conclusion before the runnable check passes.

## Gate 0 — Frame the decision (block until complete)

Return questions to the caller until all are known:
objective and success metric, constraints (compute, time, data bound), assumptions, and the actual schema. With no objective or no measurable metric, stop: do not proceed on invented goals.

## Gate 1 — Choose the method (decision tree)

- Need a quantitative answer with uncertainty about a measured quantity → **statistical inference** (scipy/statsmodels: CI, hypothesis test).
- Compare treatment/control groups → **experimental design** (power analysis, t-test/ANOVA).
- Labeled data, predict for unseen rows → **supervised ML**.
- No labels, find structure → **unsupervised ML**.
- Sequential decisions under a reward → **reinforcement learning**.
- Tune parameters to maximize/minimize an objective under constraints → **optimization** (continuous/discrete/constrained).
- Objective unmeasurable, or answerable by one table/aggregate → **a baseline query, not a model.**

Rule: every ML/RL/optimization project must first beat a simple baseline (mean, dummy classifier, empty model). Report the baseline's metric.

## Safety gates (hard stops)

- **Leakage:** reject any pipeline where a feature is derived from the target or from future rows; split by the sampling unit (group/patient/timestamp), never by row.
- **Ties:** each group/patient/time series must stay entirely within one split fold.
- **Multiplicity:** correct for multiple tests/inspected features (Bonferroni or Holm); label many-test runs exploratory.
- **RL:** check stationarity, reward hacking, exploration, on- vs off-policy evaluation, and seed variance before reporting.
- **Optimization:** report the stopping rule, binding constraints, and solver/settings; a feasibility-violating or budget-cut result is not "converged".
- **Reproducibility:** record seeds, library versions, config, and compute limits before running; pin random states.
- **Prefer what is installed:** use Python libraries already present. For Rust, name the crate/API and the Python↔Rust interop boundary explicitly (see `data-science` reference). Do not reach for a new dependency or a heavier method that a baseline can answer.

## Pipeline

1. Choose and state the method (Gate 1).
2. Inspect schema, missingness, leakage risk, and bounded samples — use the `local-data` skill (DuckDB), never dump a dataset.
3. Fit the simple baseline and record its metric.
4. Design the split: stratified train/validation/test for supervised (time-ordered for series); rollout/evaluation protocol for RL. Report metric with uncertainty or CI (std over seeds).
5. Reproduce the result from the recorded seeds/versions.

## Deliverable — minimal runnable check

End with ONE runnable check against the real schema or a tiny representative input: an assertion that fails if the method or split is wrong. Do not invent results; if schema or objective is still missing, request it.

## Reference

Load `references/method-cheatsheet.md` when you need the concrete library/crate mapping, a minimal-check template for the chosen family, and the substantial rules for multiple-comparison correction, RL checks, and optimization stopping/constraint/solver reporting.
