TEACHING EVALUATION DASHBOARD — PACKAGE CONTENTS
===================================================
Branded for University College of Bahrain (UCB).
Brand color used: #CF152D (UCB red), extracted directly from ucb_logo.png.

FILES
-----
etl_teaching_evaluation.py
    The data-processing script. Reads the raw source folder and produces
    teaching_evaluation_consolidated.json. Fully documented (file-resolution
    logic, sheet layout assumptions, averaging rules, known limitations).
    Re-run any time source data changes:
        python etl_teaching_evaluation.py --input "<path to raw folder>" --output teaching_evaluation_consolidated.json

teaching_evaluation_consolidated.json
    Output of that script — the single source of truth the dashboard and
    Excel workbook are both built from.

teaching_evaluation_consolidated.xlsx
    Human-readable Excel version for manual QA (Faculty/Program/Department
    Summary sheets, Question Reference, Improvement Flags).

dashboard.html
    The interactive dashboard, UCB-branded (logo in header, UCB red used
    across charts, buttons, and accents). Loads teaching_evaluation_consolidated.json
    at runtime via fetch() — no embedded data.

ucb_logo.png
    UCB logo, trimmed of transparent padding, referenced by dashboard.html.
    Must stay in the same folder as dashboard.html.

HOW TO RUN THE DASHBOARD
--------------------------
Browsers block fetch() against local files opened directly (file://), so
you need a tiny local server. From inside this folder, run:

    python3 -m http.server 8000

then open http://localhost:8000/dashboard.html in a browser.
