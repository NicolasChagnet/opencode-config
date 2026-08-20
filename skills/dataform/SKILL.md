---
name: dataform
description: This skill should be used when designing or reviewing Dataform ETL pipelines in BigQuery, especially for medallion-layer modeling, .sqlx authoring, metadata configuration, tagging, and incremental table design.
---

# Dataform ETL Efficiency

Design for clear layers, low-scanned bytes, and predictable incremental rebuilds.

## When to Use This Skill

Use this skill when creating or refactoring Dataform pipelines, adding new models, or reviewing performance and maintainability of existing ETL code.
Use it when deciding how to split bronze, silver, and gold models, how to publish tables versus views, or how to configure BigQuery-specific model properties.

## How to Use

1. Load the data engineering best-practices reference.
2. Organize the pipeline by medallion layer and by concern: sources, bronze, silver, gold, assertions, and reusable includes.
3. Prefer views for lightweight transformation layers and tables for expensive or reused materializations.
4. Write `.sqlx` files with a compact `config` block, explicit `description`, useful `tags`, and only the required BigQuery metadata.
5. Configure `partitionBy`, `clusterBy`, `uniqueKey`, and `updatePartitionFilter` when they reduce scanned bytes or control incremental rebuilds.
6. Keep incremental logic narrow and deterministic, using incremental filters that limit both source reads and merge scope.
7. Use tags to group models by layer, domain, schedule, boundary, run mode, and kind so operations can target the right subset.
8. Prefer readable SQL that still pushes filters early, reduces joins, and avoids unnecessary intermediate scans.
9. Run `dataform format` and `dataform compile` before finishing changes.

## References

Load `references/dataform-etl-best-practices.md` for medallion architecture guidance, model structuring, `.sqlx` conventions, metadata patterns, tagging strategy, and incremental-table practices.

## Scripts

No scripts required.

## Assets

No assets required.
