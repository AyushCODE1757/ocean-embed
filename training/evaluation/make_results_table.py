import json
import math
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RESULTS_DIR = ROOT / "results"
README_PATH = ROOT / "README.md"
START_MARKER = "<!-- RESULTS:START -->"
END_MARKER = "<!-- RESULTS:END -->"


def _format(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, (int, float)):
        if math.isnan(float(value)):
            return "-"
        if isinstance(value, float):
            return f"{value:.3f}"
    return str(value)


def _table(headers: list[str], rows: list[list[Any]]) -> str:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(_format(value) for value in row) + " |" for row in rows)
    return "\n".join(lines)


def _read_json(filename: str) -> dict[str, Any]:
    with (RESULTS_DIR / filename).open(encoding="utf-8") as source:
        return json.load(source)


def _depth_table_rows(
    depths: list[int],
    metrics: dict[str, dict[str, list[Any]]],
    include_count: bool = False,
) -> list[list[Any]]:
    rows = []
    for index, depth in enumerate(depths):
        row: list[Any] = [depth]
        if include_count:
            row.append(metrics["n"][index])
        for metric in ("clim", "armor3d", "glorys", "model"):
            row.append(metrics[metric]["rmse"][index])
        rows.append(row)
    return rows


def _results_markdown() -> str:
    results = _read_json("results.json")
    argo = _read_json("argo_validation.json")
    meta = _read_json("meta.json")
    depths = results["test"]["depth"]
    test_period = meta["test_years"]

    if results["val"]["depth"] != depths or argo["depth"] != depths:
        raise ValueError("Depth values must match across results, validation, and metadata inputs")
    for name, table_data in (("test", results["test"]), ("val", results["val"])):
        if len(table_data["model_rmse"]) != len(depths) or len(table_data["clim_rmse"]) != len(
            depths
        ):
            raise ValueError(f"{name} RMSE arrays must have one value per depth")

    lines = [
        "# Results",
        "",
        (
            "Source files: `results.json`, `argo_validation.json`, `meta.json`"
            f" | Test period (`meta.json`): {test_period}"
        ),
        "",
        f"## Test ({test_period}) vs GLORYS",
        "",
        _table(
            [
                "Depth (m)",
                "Climatology RMSE (degC)",
                "Model RMSE (degC)",
                "Skill vs climatology",
            ],
            [
                [
                    depth,
                    clim_rmse,
                    model_rmse,
                    (
                        None
                        if clim_rmse is None
                        or model_rmse is None
                        or math.isnan(float(clim_rmse))
                        or math.isnan(float(model_rmse))
                        or clim_rmse == 0
                        else 1 - (model_rmse / clim_rmse) ** 2
                    ),
                ]
                for depth, clim_rmse, model_rmse in zip(
                    depths,
                    results["test"]["clim_rmse"],
                    results["test"]["model_rmse"],
                )
            ],
        ),
        "",
        f"## Validation ({meta['val_year']}) vs GLORYS",
        "",
        _table(
            [
                "Depth (m)",
                "Climatology RMSE (degC)",
                "Model RMSE (degC)",
                "Skill vs climatology",
            ],
            [
                [
                    depth,
                    clim_rmse,
                    model_rmse,
                    (
                        None
                        if clim_rmse is None
                        or model_rmse is None
                        or math.isnan(float(clim_rmse))
                        or math.isnan(float(model_rmse))
                        or clim_rmse == 0
                        else 1 - (model_rmse / clim_rmse) ** 2
                    ),
                ]
                for depth, clim_rmse, model_rmse in zip(
                    depths,
                    results["val"]["clim_rmse"],
                    results["val"]["model_rmse"],
                )
            ],
        ),
        "",
        "Skill vs climatology is computed as `1 - (model RMSE / climatology RMSE)^2`.",
        "",
        "## Independent check vs Argo, all profiles",
        "",
        _table(
            [
                "Depth (m)",
                "n",
                "Climatology RMSE (degC)",
                "ARMOR3D RMSE (degC)",
                "GLORYS RMSE (degC)",
                "Model RMSE (degC)",
            ],
            _depth_table_rows(depths, argo["all"], include_count=True),
        ),
        "",
        "## Independent check vs Argo, delayed-mode only",
        "",
        _table(
            [
                "Depth (m)",
                "n",
                "Climatology RMSE (degC)",
                "ARMOR3D RMSE (degC)",
                "GLORYS RMSE (degC)",
                "Model RMSE (degC)",
            ],
            _depth_table_rows(depths, argo["delayed"], include_count=True),
        ),
        "",
        "## Model bias vs Argo (all profiles)",
        "",
        _table(
            ["Depth (m)", "Model bias (degC)"],
            [
                [depth, bias]
                for depth, bias in zip(depths, argo["all"]["model"]["bias"])
            ],
        ),
    ]

    for group_name, title, group_data in (
        ("basin", "basin", argo["basin"]),
        ("season", "season", argo["season"]),
    ):
        lines.extend(
            [
                "",
                f"## RMSE at 100 m by {title}",
                "",
                _table(
                    [
                        title.capitalize(),
                        "Climatology RMSE (degC)",
                        "ARMOR3D RMSE (degC)",
                        "GLORYS RMSE (degC)",
                        "Model RMSE (degC)",
                    ],
                    [
                        [
                            group,
                            *(group_data[group][metric]["rmse"][7] for metric in (
                                "clim",
                                "armor3d",
                                "glorys",
                                "model",
                            )),
                        ]
                        for group in group_data
                    ],
                ),
            ]
        )

    lines.extend(
        [
            "",
            "## Caveats",
            "",
            "- GLORYS is the training target; GLORYS, ARMOR3D, and the SSS product all assimilate Argo, so they are not independent.",
            "- Argo 2024-2025 mixes real-time, adjusted, and delayed-mode data.",
            "- 2025 SSS and ARMOR3D are near-real-time.",
            "- The model has no skill at 500 m and deeper.",
            "- Basins and seasons are rough boxes defined by us.",
            "- Argo is matched to the nearest 0.25 deg cell and day, with pressure used as depth.",
        ]
    )
    return "\n".join(lines) + "\n"


def _refresh_readme(markdown: str) -> None:
    readme = README_PATH.read_text(encoding="utf-8")
    if readme.count(START_MARKER) != 1 or readme.count(END_MARKER) != 1:
        raise ValueError("README.md must contain exactly one RESULTS:START and RESULTS:END marker")

    start = readme.index(START_MARKER) + len(START_MARKER)
    end = readme.index(END_MARKER)
    if start >= end:
        raise ValueError("README.md results markers are out of order")

    updated = f"{readme[:start]}\n\n{markdown.rstrip()}\n\n{readme[end:]}"
    README_PATH.write_text(updated, encoding="utf-8")


def main() -> None:
    markdown = _results_markdown()
    (RESULTS_DIR / "RESULTS.md").write_text(markdown, encoding="utf-8")
    _refresh_readme(markdown)


if __name__ == "__main__":
    main()
