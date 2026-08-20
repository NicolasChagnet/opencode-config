# Python Performance Profiling

## Performance Targets

- Wall time: total elapsed duration for the workload.
- CPU usage: time spent executing on CPU, including hot loops and algorithmic overhead.
- Peak RSS: maximum resident memory usage during the workload.

## Profiling Workflow

1. Reproduce the issue with a representative workload.
2. Record a baseline for wall time, CPU, and peak RSS.
3. Use a profiler that matches the symptom.
4. Confirm the hotspot with a second measurement before changing code.
5. Prefer changes that reduce the dominant cost, not just incidental overhead.
6. Re-measure after each change.

## Tool Selection

- `cProfile` or `profile`: locate Python-level call hotspots.
- `pstats`: sort by cumulative time, then by per-call time.
- `timeit`: benchmark isolated micro-operations.
- `line_profiler`: inspect expensive lines inside a hot function.
- `scalene`: separate Python time, native time, and memory growth.
- `py-spy` or `sampling` profilers: observe production-like workloads with low overhead.
- `tracemalloc`: trace Python allocation sources.
- `memory_profiler` or RSS sampling: track peak memory and leaks.

## Common Bottleneck Patterns

- Repeated work inside loops instead of hoisting invariant computation.
- Quadratic behavior from nested scans, repeated membership tests, or repeated concatenation.
- Excessive object creation, boxing, copying, or conversion.
- Heavy string processing in tight loops.
- Repeated database, network, or filesystem calls without batching.
- Materializing large intermediate collections when streaming would suffice.
- Python-level loops where vectorized, builtin, or compiled operations are available.
- Lock contention, serialization, or unnecessary synchronization.
- Memory growth from caches, retained references, or accidental accumulation.

## Micro-Optimizations

Use these when the issue is local and the expected gain is meaningful.

- Replace repeated attribute lookups or function calls in hot loops.
- Use builtins and standard-library primitives that are implemented in C.
- Cache invariant values outside loops.
- Avoid unnecessary copies, conversions, and intermediate containers.
- Choose the right data structure for membership, ordering, and lookup.
- Reduce logging, formatting, and string concatenation in hot paths.

## Macro-Optimizations

Use these when local tuning cannot fix the dominant cost.

- Change algorithmic complexity.
- Batch I/O or network operations.
- Stream data instead of loading everything into memory.
- Add caching at the right boundary.
- Move work to vectorized libraries, native extensions, or background workers.
- Reduce fan-out, request count, or duplicated computation in the architecture.

## Prioritization Rubric

Rank recommendations by:

1. Low effort, high impact.
2. Low effort, medium impact.
3. Medium effort, high impact.
4. High effort, high impact.
5. Anything speculative or low confidence last.

When presenting recommendations, include the observed symptom, the probable root cause, the scope of the fix, and the expected effect on wall time, CPU, or peak RSS.
