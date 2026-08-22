# Local-data reference (DuckDB)

Load this when the basic schema/count/sample inspection needs to go further: error cases, type coercion, and partition pruning on large parquet.

## Error cases

- **Missing file** → returns an error listing the resolved path; verify the path before blaming the query:
  ```bash
  duckdb -c "SELECT * FROM read_parquet('dir/*.parquet');"   # glob hits zero files -> error
  ```
- **Type coercion** — `read_csv_auto` guesses types; if a column comes back wrong, force it:
  ```bash
  duckdb -c "SELECT * FROM read_csv_auto('x.csv', sample_size=-1);"
  ```
- **Huge single parquet** — never `SELECT *`; use partition pruning and projection:
  ```bash
  duckdb -c "SELECT a,b,count(*) FROM read_parquet('dir/year=*/month=*/*.parquet') WHERE year=2024 GROUP BY a,b;"
  ```

## Common query patterns

| Need | Command |
|---|---|
| Distinct count / key check | `SELECT count(DISTINCT id), count(*) FROM ...;` |
| Column null counts | `SUMMARIZE SELECT * FROM ...;` |
| Bounded eyeball sample | `... USING SAMPLE reservoir(50 ROWS) REPEATABLE (1);` (deterministic only with `SET threads=1`) |
| List SQLite tables | `SELECT name FROM sqlite_master;` via `sqlite_scan` |
| Reuse across files | `CREATE VIEW tbl AS SELECT * FROM read_parquet('x.parquet');` then query `tbl` |

## Reproducibility rule

Record the exact path + query that produced every number you report. The reproducibility rule holds even for ad-hoc samples: a reported count must be reproducible from the same one-liner.
