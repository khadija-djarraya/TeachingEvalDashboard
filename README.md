# UCB Teaching Evaluation Dashboard

Institutional teaching-evaluation reporting for **University College of Bahrain**, built on the UKPSF 2020 framework (Areas of Activity / Core Knowledge / Professional Values). Covers 4 semesters (Fall 2020 – Spring 2022) across 4 departments.

## Live view

Open `site/index.html` via a local server (see below) — it has two views:
- **Institutional / Admin dashboard**: department & program averages, UKPSF capability heatmap, interdepartmental comparison, semester-over-semester trends, improvement-required tracking (<65%), auto-generated executive summary.
- **Individual Faculty dashboard**: per-instructor UKPSF radar, per-course scores, full question-level report, personal trend across semesters.

## Repo contents

| File | Purpose |
|---|---|
| `etl_teaching_evaluation.py` | Documented ETL script: raw `.xlsx` survey exports → consolidated JSON |
| `site/teaching_evaluation_consolidated.json` | Output of the ETL — single source of truth for the dashboard |
| `teaching_evaluation_consolidated.xlsx` | Human-readable Excel export for manual QA |
| `site/index.html` | Interactive dashboard entry page for local use and GitHub Pages |
| `site/app.js` | Dashboard rendering and interaction logic |
| `site/style.css` | Dashboard styles |
| `site/ucb_logo.png` | UCB logo used in the dashboard header |
| `PACKAGE_NOTES.md` | Original packaging notes |

## Running locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000/site/
```

(A local server is required because browsers block `fetch()` against `file://` URLs.)

## Regenerating the data

```bash
python etl_teaching_evaluation.py --input "<path to raw survey folder>" --output site/teaching_evaluation_consolidated.json
```

See the docstring at the top of `etl_teaching_evaluation.py` for the full data-handling logic, assumptions, and known limitations.
