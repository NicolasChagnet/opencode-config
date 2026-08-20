---
name: python-perf
description: This skill should be used when analyzing Python code for performance bottlenecks, profiling wall time, CPU usage, or peak RSS, and recommending improvements ranked by effort versus expected gain.
---

# Python Performance Bottlenecks

Identify the dominant bottlenecks first, then recommend fixes in priority order by expected impact versus implementation effort.

## When to Use This Skill

Use this skill when a Python program is slow, CPU-heavy, memory-hungry, or unstable under load.
Use it when the goal is to explain where time or memory goes, not just to suggest generic optimizations.

Treat performance as three distinct targets:
wall time, CPU usage, and peak RSS.

## How to Use

1. Load the profiling reference before suggesting changes, or build it if necessary.
2. Establish the workload, inputs, and performance target.
3. Measure the problem with representative data before changing code.
4. Separate symptoms by wall time, CPU, and memory.
5. Identify the dominant bottleneck class and the code pattern causing it.
6. Recommend micro-optimizations first when they are low effort and clearly local.
7. Recommend macro-optimizations when the bottleneck is architectural or repeated at scale.
8. Rank every suggestion by implementation effort versus expected improvement.
9. State the evidence behind each recommendation and call out any uncertainty.

## References

Load `references/python-performance-profiling.md` for profiling tools, interpretation guidance, common bottleneck patterns, and a fix-prioritization rubric.

## Scripts

No scripts required.

## Assets

No assets required.
