---
name: code-rust-perf
description: Use when profiling, benchmarking, or optimizing Rust code and when choosing Rust/Python data-science interop boundaries.
---

# Rust performance

Optimize only after measuring. The order is: capture a baseline → profile → fix the top bottleneck → verify with the same baseline → keep or revert.

## Decision gate — profile before you change

- Measure first with a reproducible benchmark or profile; never pre-optimize code you have not measured.
- Fix only what shows up in the profile (allocations, copies, I/O, contention, algorithmic complexity), not what "feels" slow.

## Verify the baseline is real (safety gate)

- Run the benchmark in `--release`; debug builds are not a baseline.
- Use a focused test or benchmark that asserts correctness after each change.
- Record the crate/API and version already used before touching code.

## Procedure

1. Baseline: `cargo bench` (criterion) or a release-mode timing run. Record the number.
2. Profile to find the hotspot: `cargo flamegraph`, or on Linux `perf record`/`perf report` (on macOS use `samply` or Xcode Instruments — `perf`/`valgrind` are Linux-only), or instrument with `std` timing.
3. Apply ONE change (algorithm choice, allocation pattern, I/O batching, lock/contention).
4. Re-run the same benchmark; keep the change only if it reproducibly improves on the baseline, and the correctness check still passes.
5. Reject changes with no measured gain.

## Rust↔Python interop boundary

- Name the crate/API at the boundary (e.g. `pyo3`, `numpy` array conversion) and its version.
- Make the ownership/copy cost explicit: where data is serialized, copied, or moved; prefer views/zero-copy where the API allows.
- Account for the GIL and the copy count across Arrow/Polars/Python boundaries (see the reference) before optimizing the Rust core.
- If interop is the bottleneck, measure the conversion itself before optimizing the Rust core.

## Minimal runnable check

Keep one runnable correctness check (a `#[test]` or one criterion benchmark) that fails if the optimized path returns wrong output. It is the acceptance test for every optimization.

## Reference

Load `references/rust-perf-reference.md` for concrete profiling commands, Benchmark-case setup, and a pyo3 interop checklist.
