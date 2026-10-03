"""Print pinned versions and the GitHub Action tags in use, for a manual latest-version check.
Usage: python infra/scripts/check_versions.py"""
import json
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    py = tomllib.loads((ROOT / "packages/serving/pyproject.toml").read_text())
    print("Python pins:")
    for dep in py["project"]["dependencies"]:
        print("  ", dep)
    pkg = json.loads((ROOT / "apps/web/package.json").read_text())
    print("Web pins:")
    for section in ("dependencies", "devDependencies"):
        for name, ver in pkg.get(section, {}).items():
            flag = "  <-- 'latest' is not reproducible, pin it" if ver == "latest" else ""
            print(f"   {name}@{ver}{flag}")
    print("GitHub Actions in use (compare with each action's releases page):")
    tags = set()
    for wf in (ROOT / "infra/ci/workflows").glob("*.yml"):
        tags.update(re.findall(r"uses:\s*(\S+)", wf.read_text()))
    for t in sorted(tags):
        print("  ", t)


if __name__ == "__main__":
    main()
