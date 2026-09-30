"""Compare my FastAPI app with A's contracts/openapi/oceanembed.v1.yaml (A is the authority).
Prints paths/methods missing on either side and query parameters that differ.
Usage: uv run --package oceanembed-serving python infra/scripts/check_openapi.py"""
import sys
from pathlib import Path

import yaml

from oceanembed_serving.main import app

SPEC = Path(__file__).resolve().parents[2] / "contracts/openapi/oceanembed.v1.yaml"


def ops(spec: dict) -> dict[tuple[str, str], set[str]]:
    out = {}
    for path, item in spec.get("paths", {}).items():
        for method, op in item.items():
            if method in {"get", "post", "put", "delete", "patch"}:
                out[(method.upper(), path)] = {
                    p["name"] for p in op.get("parameters", []) if p.get("in") == "query"
                }
    return out


def main() -> None:
    theirs = ops(yaml.safe_load(SPEC.read_text()))
    mine = ops(app.openapi())
    bad = 0
    for k in sorted(set(theirs) - set(mine)):
        print(f"MISSING in my API : {k[0]} {k[1]}")
        bad += 1
    for k in sorted(set(mine) - set(theirs)):
        print(f"NOT in A's contract: {k[0]} {k[1]}")
        bad += 1
    for k in sorted(set(theirs) & set(mine)):
        if theirs[k] != mine[k]:
            print(
                f"PARAMS differ {k[0]} {k[1]}: contract={sorted(theirs[k])} mine={sorted(mine[k])}"
            )
            bad += 1
    print(f"{bad} difference(s)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
