import json
import subprocess
import sys
from pathlib import Path

from evaluation.make_results_table import _table

ROOT = Path(__file__).resolve().parents[1]
RESULTS_PATH = ROOT / "results" / "RESULTS.md"
SCRIPT_PATH = ROOT / "evaluation" / "make_results_table.py"


def _table_rows(markdown: str, heading: str) -> list[list[str]]:
    section_start = markdown.index(heading)
    section_end = markdown.find("\n## ", section_start + len(heading))
    section = markdown[section_start:] if section_end == -1 else markdown[section_start:section_end]
    table_lines = [line for line in section.splitlines() if line.startswith("|")]
    return [
        [cell.strip() for cell in line.strip("|").split("|")]
        for line in table_lines[2:]
    ]


def test_results_table_is_refreshed_from_json() -> None:
    subprocess.run([sys.executable, str(SCRIPT_PATH)], cwd=ROOT, check=True)

    markdown = RESULTS_PATH.read_text(encoding="utf-8")
    depth_table_headings = [
        "## Test (2024-2025) vs GLORYS",
        "## Validation (2023) vs GLORYS",
        "## Independent check vs Argo, all profiles",
        "## Independent check vs Argo, delayed-mode only",
        "## Model bias vs Argo (all profiles)",
    ]
    for heading in depth_table_headings:
        assert len(_table_rows(markdown, heading)) == 15

    with (ROOT / "results" / "results.json").open(encoding="utf-8") as source:
        results = json.load(source)
    test_rows = _table_rows(markdown, depth_table_headings[0])
    row_at_100m = next(row for row in test_rows if row[0] == "100")
    assert float(row_at_100m[2]) == results["test"]["model_rmse"][7]
    assert "| - |" in _table(["metric"], [[float("nan")]])
    assert "nan" not in markdown.lower()

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    results_block = readme.split("<!-- RESULTS:START -->", 1)[1].split(
        "<!-- RESULTS:END -->", 1
    )[0]
    assert markdown.strip() in results_block
    assert "nan" not in results_block.lower()
