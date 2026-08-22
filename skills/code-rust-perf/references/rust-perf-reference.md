# Rust-perf reference

Load this to get concrete profiling commands, a criterion benchmark skeleton, and a pyo3 interop checklist once the `rust-perf` workflow gate has already confirmed you are optimizing a measured bottleneck.

## Concrete profiling commands

| Task | Command |
|---|---|
| Read binary size / release build | `cargo build --release` |
| Micro-benchmark | `cargo bench` (criterion) |
| Sampling profiler | `cargo flamegraph` (needs `flamegraph` install) |
| Perf call tree (Linux-only) | `perf record --call-graph dwarf ./target/release/bin && perf report` |
| Allocation hotspots (Linux-only) | `valgrind --tool=massif`, or `--features dhat` if using `dhat` for debug builds |
| macOS sampling profiler | `samply record ./target/release/bin --args...` (auto-opens the profile in the browser) |
| macOS call tree / mem (Xcode) | Instruments: `xcrun xctrace record --template 'Time Profiler' --launch ./target/release/bin`; GUI for Allocations |

`perf` and `valgrind` do not run on macOS. On macOS use `samply` for sampling (install via `cargo install samply` / `brew install samply`) and Xcode Instruments (`Time Profiler`, `Allocations`) for call trees and memory. Measure in `--release` only. A debug-build timing number is not a baseline.

## Criterion benchmark skeleton

```rust
// benches/perf.rs
use criterion::{criterion_group, criterion_main, Criterion, black_box};

fn bench_func(c: &mut Criterion) {
    let input = black_box(input());
    c.bench_function("my_hot_fn", |b| b.iter(|| black_box(my_hot_fn(input.clone()))));
}
criterion_group!(benches, bench_func);
criterion_main!(benches);
```

Run `cargo bench`, record the mean and its confidence interval, make ONE change, re-run, and compare against the same recorded number.

**Criterion noise & baseline comparison:**
- Wrap inputs and outputs in `black_box` so the optimizer does not elide the work; clone inside the loop only if the function mutates its input.
- Criterion treats the reported `±` as an estimate of noise, not proof. Decide by comparing confidence intervals, not point means: if the intervals overlap, call it "no change" — do not claim a win (or loss) on an overlapping mean.
- Do not compare numbers across machines, compilers, or `--release`-vs-debug runs; only same-machine, same-build delta matters.
- To compare against a stored baseline run `cargo bench -- --save-baseline main`, then later `cargo bench -- --baseline main`.
- Use `--sample-size`/`--warm-up-time` only if the default run is too noisy; increasing them shrinks the interval rather than moving the mean.

Keep a separate `#[test]` asserting correctness — benchmarking alone never validates the result.

## Correctness check (acceptance test)

Keep a `#[test]` that asserts the optimized path returns the same/expected output:

```rust
#[test]
fn optimized_matches_reference() {
    assert_eq!(my_hot_fn(input()), expected_output());
}
```

Optimization is accepted only if the test passes AND the benchmark improves.

## pyo3 interop checklist

- Name the crate/API used (`pyo3`, `numpy`, or a manual `ndarray` boundary) and its version.
- Make ownership/copy explicit: what is borrowed vs cloned per call.
- Prefer `&PyArray`/view extraction over per-element Python calls; batch data across the boundary.
- If the boundary is the measured bottleneck, optimize conversion first — not the Rust core.

## Arrow / Polars boundary accounting

- Crossing `arrow`/`polars`<->Python should be an O(1) metadata handoff, not a copy: keep the data as an Arrow array and pass its buffer address/refcount (`pyarrow` zero-copy, or `arrow-rs`' C-Data `ffi`) so the data is never serialized.
- Count the copies per row or per chunk; a per-element or per-chunk clone across the boundary is a hot spot even if the Rust core is fast.
- Use valid/count arrays and offset views where available so slices don't force a materialized copy.

## GIL / copy accounting

- The GIL serializes all Python threads: if a `#[pymethods]` function holds the GIL while it runs long Rust work, other Python threads stall. Release it around pure-Rust computation with `py.allow_threads(|| ...)`, and only re-acquire it to convert back to Python objects.
- Never call `Py`/`Python` APIs from Rust threads without the GIL; use `Python::detach` rules and `py.allow_threads` for background work.
- A Python object owned by Rust keeps the source alive; count reference retention (leaked PyObjects / unbound `Py<...>`) alongside copies as memory you must account for.

## Warning

Do not add `flamegraph`, `criterion`, `dhat` or other tooling as a new dependency unless the workflow actually needs it. The debug-`dhat` path is opt-in; the `cargo bench` path requires criterion as a dev-dependency only.
