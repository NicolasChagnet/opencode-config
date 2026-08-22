# Marimo API reference

Concrete API details for building marimo notebooks. Verify against your installed version (`marimo --version`); the user's environment is 0.23.x.

## App and cells

- `app = marimo.App(width="medium")` — `width` is `"compact"`, `"medium"`, or `"full"`.
- `@app.cell` — decorates a function; the function body is one cell. The function's parameters are the names it consumes; its return values are the names it defines.
- `@app.cell(hide_code=True)` — hide the cell's source in the rendered notebook.
- `@app.cell(disabled=True)` — cell runs once, never re-runs on dependency change.
- `@app.cell(frozen=True)` — cell runs once and its outputs are cached.
- `__generated_with = "0.23.14"` — the marimo version that generated the file. Keep in sync with the installed version.

## Reactive execution

- A cell re-runs when any value it reads changes. Reading a widget's `.value` creates the dependency.
- Variables are scoped to cells; a cell can only read names it declares in its signature. This is enforced — a missing name is a compile error, not a silent `NameError`.
- To force a re-run of a downstream cell without changing inputs, use `mo.stop` or a `mo.ui.button` value.

## Widgets (`mo.ui`)

- `mo.ui.slider(start, stop, step, value, label)` — numeric slider.
- `mo.ui.number(start, stop, step, value, label)` — numeric input.
- `mo.ui.text(value, label)` / `mo.ui.text_area(value, label)` — text input.
- `mo.ui.checkbox(value, label)` — boolean toggle.
- `mo.ui.dropdown(options, value, label)` — select one; `options` is a dict `{label: value}` or list.
- `mo.ui.multiselect(options, value, label)` — select many.
- `mo.ui.button(label)` — `.value` is the click count; use to gate a re-run.
- `mo.ui.dataframe(df)` — interactive table with filtering/sorting; `.value` is the filtered frame.
- `mo.ui.plotly(fig)` / `mo.ui.altair_chart(chart)` — embed a plot; `.value` carries selection events.
- `mo.ui.tabs({"A": a, "B": b})` — tabbed layout.
- `mo.ui.array([...])` / `mo.ui.dictionary({...})` — compose widgets.

Display a widget by making it the last expression of its cell. Read its current value with `.value`.

## Layout and output

- `mo.md("markdown **text**")` — markdown block; supports f-strings for dynamic prose.
- `mo.hstack([...], gap=1)` / `mo.vstack([...], gap=1)` — horizontal/vertical layout.
- `mo.sidebar(...)` — sidebar content.
- `mo.output.replace(obj)` — replace the cell's output programmatically (e.g. inside a loop or callback).
- `mo.output.append(obj)` — append to the cell's output.
- `mo.status.spinner("training...")` — show a spinner while a block runs; use as a context manager.
- `mo.stop(condition, message)` — stop the cell's execution if `condition` is truthy; show `message`.

## Common gotchas

- **Stale cells**: if a cell reads a widget but the widget cell is `hide_code` and not displayed, the dependency may not register. Display the widget in its own cell.
- **Re-running everything**: `python notebook.py` runs all cells top to bottom once. Interactive edits re-run only affected cells.
- **Don't mutate shared objects**: pass values through return values. Mutating a list defined in another cell does not trigger reactivity.
- **Version drift**: `__generated_with` must match the installed marimo; mismatch can cause the editor to prompt for an upgrade. Regenerate with `marimo edit` if needed.
- **PEP 723 metadata**: the `# /// script` block declares `requires-python` and `dependencies`. `uv run notebook.py` installs and runs with those deps.
