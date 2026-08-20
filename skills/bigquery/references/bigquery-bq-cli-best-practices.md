# BigQuery `bq` CLI Best Practices

## Schema-First Workflow

Inspect structure before querying data.

- Use `bq show --format=prettyjson project:dataset.table` to inspect schema and table metadata.
- Check partitioning and clustering fields before writing filters.
- Confirm field types, nested/repeated fields, and likely join keys.
- For views, inspect the underlying SQL or source tables when available.

## Dry-Run Workflow

Always estimate bytes first.

- Run `bq query --dry_run --use_legacy_sql=false '<query>'` before execution.
- Read `totalBytesProcessed` from the output.
- Treat queries near or above 10 GB as expensive unless clearly justified.
- Warn when estimated bytes processed is likely to exceed about 10 GB.
- Refine the query until the dry run cost is acceptable.

## SQL Best Practices

- Select only required columns; avoid `SELECT *` on large tables.
- Push filters as early as possible.
- Filter on partition columns to enable partition pruning.
- Filter on clustering columns when practical to improve cluster pruning.
- Use sargable predicates; avoid wrapping partition/filter columns in functions when it blocks pruning.
- Prefer explicit joins on well-defined keys.
- Reduce row explosion before joins when possible.
- Aggregate before joining when the result cardinality allows it.
- Keep CTEs readable, but avoid repeatedly reusing the same expensive subquery unless BigQuery is expected to optimize it well.
- Materialize intermediate results only when reuse or cost warrants it.
- Use approximate functions only when approximate answers are acceptable.

## Efficient CTEs

- Use CTEs to structure logic, not to assume caching.
- Avoid multiple references to a heavy CTE unless the query plan supports reuse or the data set is small.
- Inline simple filters and projections early.
- Split very large queries when it improves readability and allows stepwise validation.

## Partition and Cluster Pruning

- Partition on the most selective and commonly filtered time or date column.
- Filter partition columns with direct range or equality predicates.
- Cluster on columns used for frequent selective filters or joins.
- Keep clustering predicates simple and type-consistent.
- Verify pruning by comparing dry-run bytes before and after query changes.

## Query Review Checklist

Before running a query, confirm:

1. Schema and table shape are understood.
2. Partition and cluster fields are known.
3. Only required columns are selected.
4. Filters can prune partitions or clusters.
5. Dry-run bytes are acceptable.
6. The query is likely to avoid unnecessary scans, shuffles, and duplicates.
