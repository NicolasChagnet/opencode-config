---
name: data-local
description: Use when inspecting local CSV, Parquet, or SQLite data with DuckDB without dumping datasets.
---

# Local data inspection

Inspect in this order: confirm source → schema → row count → nulls/types → bounded sample. Record every path and query so the result is reproducible.

## Decision gate — pick the read path

| Source | Command |
|---|---|
| Parquet | `duckdb -c "SELECT * FROM read_parquet('data.parquet');"` |
| CSV | `duckdb -c "SELECT * FROM read_csv_auto('data.csv');"` |
| SQLite | `duckdb -c "SELECT * FROM sqlite_scan('data.db', 'table');"` |
| Multiple/globs | `read_parquet('dir/*.parquet')` or `read_csv_auto(['a.csv','b.csv'])` |

## Inspect (bounded, never a full dump)

1. Schema and types: `duckdb -c "DESCRIBE SELECT * FROM read_parquet('x.parquet');"`
2. Row count: `duckdb -c "SELECT count(*) FROM read_parquet('x.parquet');"`
3. Nulls and value distribution per column: `duckdb -c "SUMMARIZE SELECT * FROM read_parquet('x.parquet');"`
4. Bounded sample for eyeballing: `duckdb -c "SELECT * FROM read_parquet('x.parquet') USING SAMPLE 100 ROWS;"` — never print the whole dataset. `SAMPLE`/`LIMIT` bound the *output rows*, not necessarily the scan: on a huge file, also project only the needed columns and prune with `WHERE` on partition columns so the read itself stays small.

## Safety gate

- If the target data volume would make the query or output large, inspect via `SUMMARIZE`/`count(*)`/`LIMIT` (bounded output), not a raw `SELECT *`; to bound the read on large parquet, restrict to the columns and partition predicates you need rather than relying on a post-read `SAMPLE`.
- Cap sample output (e.g. `USING SAMPLE 100 ROWS` or `LIMIT 50`); record the exact path and query that produced each number.
- Validate assumptions (types, key uniqueness) before analysis; if schema is unclear, report what exists rather than inferring.

## Minimal runnable check

After inspection, produce one reproducible command that asserts the key assumption, e.g. `duckdb -c "SELECT count(DISTINCT id)=count(*) FROM read_parquet('x.parquet');"` — it must return `true` (or a documented `false`) before analysis proceeds.

## Reference

Load `references/local-data-reference.md` for error cases (missing files, type coercion, huge parquet/partition pruning) and more query patterns.
