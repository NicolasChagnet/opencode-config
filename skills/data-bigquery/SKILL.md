---
name: data-bigquery
description: This skill should be used when working with BigQuery through the `bq` CLI, especially before running queries that need schema inspection, dry-run cost estimation, or SQL performance review.
---

# Bq Cli BigQuery

Use a schema-first, auditable approval gate before every query that reads table content.

## When to Use This Skill

Use this skill when querying BigQuery with the `bq` CLI, exploring unfamiliar tables, or reviewing query cost and efficiency.
Use it before scanning large tables, joining multiple datasets, or editing SQL that may be expensive.

## How to Use

1. Inspect table schema and partitioning/cluster metadata before writing the query.
2. Load the BigQuery SQL best-practices reference.
3. Write the query conservatively, selecting only required columns and filters.
4. Run `bq query --dry_run --use_legacy_sql=false "<query>"` before executing.
5. Return exactly `{query, estimated_bytes, threshold_bytes, decision, reason}` before execution. Default `threshold_bytes` to 10 GiB.
6. Set `decision` to `approve` only when the dry run succeeds and estimated bytes are known and at or below the threshold. Above the threshold, require explicit user approval and use `pending_approval`; on dry-run failure or unknown cost, use `blocked`.
7. Do not execute while `decision` is `pending_approval` or `blocked`; this is a workflow gate, not a claim of technical enforcement.
8. Prefer suggestions that reduce scanned bytes, shuffle, and repeated computation.

## References

Load `references/bigquery-bq-cli-best-practices.md` for schema inspection commands, dry-run usage, cost interpretation, and SQL optimization guidance.

## Scripts

No scripts required.

## Assets

No assets required.
