---
name: data-marimo
description: Builds and edits marimo notebooks for exploratory data science — data analysis, model training, and hyperparameter experiments. Use when the user wants to analyze data, train or evaluate a model, run experiments across hyperparameters, or create an interactive notebook in marimo. Triggers on "marimo", "notebook", "explore this data", "train a model", "run an experiment".
---

# Marimo for Exploratory Data Science

Build reactive marimo notebooks for data analysis, model training, and hyperparameter experiments. Marimo notebooks are plain `.py` files: cells are functions decorated with `@app.cell`, and execution is reactive — a cell re-runs automatically when any value it reads changes.

## When to use this skill

Use when the task is exploratory and interactive: inspecting a dataset, prototyping a model, sweeping hyperparameters, or producing a shareable analysis. For a one-shot script that runs headless, prefer a plain script; for a durable pipeline, prefer a module. Marimo is the right tool when the user wants to *look at* results and *tune* inputs interactively.

## Core structure

Every notebook is a single `.py` file with PEP 723 inline metadata and a marimo app:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["marimo", "polars", "altair"]
# ///

import marimo

__generated_with = "0.23.14"
app = marimo.App(width="medium")

@app.cell
def _():
    import marimo as mo
    import polars as pl
    return mo, pl

@app.cell
def _(pl):
    df = pl.read_csv("data.csv")
    return df
```

Rules:
- Put all imports in one setup cell; return the names you use elsewhere.
- Each cell returns the variables it defines that other cells read. A cell's `def _(pl)` signature lists exactly what it consumes.
- Keep cells small and single-purpose. One cell = one step (load, clean, plot, train, evaluate).
- Do not mutate shared state across cells; pass values through return values so reactivity works.
- `hide_code=True` on a cell hides its source in the rendered notebook (use for setup and widget cells).

## Interactivity

Use `mo.ui` widgets for parameters the user tunes, and display them by referencing them in a cell:

```python
@app.cell(hide_code=True)
def _(mo):
    lr = mo.ui.slider(1e-4, 1e-1, value=1e-3, label="learning rate")
    epochs = mo.ui.number(1, 500, value=100, label="epochs")
    lr, epochs
    return lr, epochs

@app.cell
def _(lr, epochs, train):
    history = train(lr.value, epochs.value)
    return history
```

- Widgets are reactive: reading `.value` in a cell re-runs that cell when the widget changes.
- Display a widget by placing it as the last expression of its cell.
- Use `mo.ui.dataframe` for interactive table exploration, `mo.ui.plotly`/`mo.ui.altair_chart` to embed plots that react to selections.
- Use `mo.md("...")` for markdown prose, headings, and explanations between cells.

## Data analysis workflow

1. Load with the `local-data` skill's guidance (schema, types, nulls, bounded samples) — never dump a whole dataset.
2. Clean and transform in dedicated cells; keep each transformation observable.
3. Plot with altair or plotly; make plots reactive to `mo.ui` filters where useful.
4. Summarize findings in `mo.md` cells so the notebook reads as a narrative.

## Model training and experiments

- Keep the model definition, training loop, and evaluation in separate cells so you can re-run evaluation without retraining.
- Expose hyperparameters as `mo.ui` widgets so the user can sweep them interactively.
- For a systematic sweep, loop over a grid in one cell and collect results into a table, then plot the table:

```python
@app.cell
def _(lr, epochs, train, pl):
    results = []
    for l in [1e-4, 1e-3, 1e-2]:
        for e in [50, 100]:
            hist = train(l, e)
            results.append({"lr": l, "epochs": e, "loss": hist[-1]})
    sweep = pl.DataFrame(results)
    return sweep
```

- Record seeds, library versions, and config before running (see the `data-science` skill's reproducibility rules). Pin random states.
- End with ONE runnable check that fails if the method or split is wrong, per the `data-science` skill.

## Running and exporting

- Run interactively: `marimo edit notebook.py` (opens the editor).
- Run headless as a script: `python notebook.py` (executes all cells top to bottom).
- Export to HTML: `marimo export html notebook.py -o notebook.html`.
- Convert to a plain script: `marimo export script notebook.py -o script.py`.

## Reference

Load `references/marimo-api.md` for the widget catalog, layout helpers, output controls, and common gotchas (stale cells, `mo.stop`, `mo.output.replace`, caching).
