# Dataform ETL Best Practices

## Medallion Architecture

- Bronze: ingest and clean source data with minimal reshaping.
- Silver: apply business logic, deduplication, harmonization, and conformance.
- Gold: publish curated analysis or user-facing datasets.
- Keep each layer responsible for one level of transformation.
- Prefer one-way dependencies from bronze to silver to gold.

## Pipeline Structure

- Group definitions by purpose: sources, bronze, silver, gold, assertions, and shared includes.
- Keep source definitions close to the raw boundary and avoid unnecessary transformations there.
- Use views for lightweight, frequently recomputed logic.
- Use tables for expensive transformations, reusable aggregates, or stable intermediate datasets.
- Publish exposed outputs from curated internal models rather than from raw sources.

## `.sqlx` Structure

- Start with a `config {}` block.
- Set `name`, `schema`, `type`, `description`, and `tags` explicitly.
- Add `bigquery` metadata only when it changes storage or incremental behavior.
- Keep SQL body readable and focused on the transformation.
- Use `js {}` blocks for reusable constants and helpers only when they improve clarity.
- Prefer clear aliases, explicit joins, and column lists over `SELECT *`.

## BigQuery Metadata

- Set `partitionBy` on the most selective and frequently filtered date or timestamp column.
- Set `clusterBy` on columns commonly used in filters, joins, or aggregations.
- Set `uniqueKey` for incremental models that need deterministic upserts.
- Set `updatePartitionFilter` to bound incremental scans and merge work.
- Add `columns` descriptions when the table is published, reused, or hard to infer.
- Keep descriptions short but specific about grain, purpose, and major caveats.

## Tags

- Use tags to group models by layer, domain, boundary, schedule, run mode, and kind.
- Keep tag names stable and machine-friendly.
- Use tags to drive targeted runs, operational filters, and assertions.
- Tag assertions separately from models so validation can be executed independently.

## Incremental Tables

- Choose incremental tables when the dataset is large, append-like, or expensive to rebuild.
- Define the target grain clearly and enforce it with a unique key when needed.
- Restrict source reads to the newest relevant partitions or windows.
- Avoid broad full-table scans inside incremental branches.
- Make incremental predicates match the partitioning strategy of the source and target.
- Validate idempotency and late-arriving data behavior.
- Keep merge logic simple enough to reason about duplicate suppression and backfills.

## Efficiency Patterns

- Filter early and select only needed columns.
- Push partition predicates to the earliest possible source.
- Reduce fan-out before joins when possible.
- Aggregate before joining when cardinality permits.
- Reuse expensive logic only when it is clearly worth it.
- Avoid repeating the same heavy subquery across multiple branches.
- Keep cross-layer dependencies minimal and intentional.

## Review Checklist

- Confirm layer placement matches the transformation cost and responsibility.
- Confirm the output type matches reuse and freshness needs.
- Confirm BigQuery metadata supports pruning and incremental behavior.
- Confirm tags support operational grouping.
- Confirm incremental filters cover the intended freshness window.
- Confirm the model is readable, deterministic, and explainable.
