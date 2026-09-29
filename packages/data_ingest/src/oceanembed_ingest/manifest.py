"""Manifest and Data Provenance Tracker for OceanEmbed Ingestion."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def compute_sha256(file_path: Path) -> str:
    """Compute SHA-256 hash of a file in streaming chunks."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


class ManifestManager:
    """Manages creation, loading, and updating of data/manifest.json."""

    def __init__(self, manifest_path: Path = Path("data/manifest.json")):
        self.manifest_path = Path(manifest_path)
        self.entries: List[Dict[str, Any]] = []
        if self.manifest_path.exists():
            self.load()

    def load(self) -> None:
        """Load manifest from disk."""
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            self.entries = data.get("files", [])

    def add_file(
        self,
        file_path: Path,
        dataset_id: str,
        variable: str,
        source_tier: str,
        start_date: str,
        end_date: str,
        source_url: Optional[str] = None,
        doi: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Record an ingested file with its checksum and metadata."""
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"Cannot record non-existent file: {file_path}")

        sha = compute_sha256(file_path)
        size_bytes = file_path.stat().st_size

        entry = {
            "dataset_id": dataset_id,
            "variable": variable,
            "filename": file_path.name,
            "relative_path": str(file_path).replace("\\", "/"),
            "sha256": sha,
            "bytes": size_bytes,
            "source_tier": source_tier,
            "source_url": source_url or "",
            "doi": doi or "",
            "date_range": {
                "start": start_date,
                "end": end_date,
            },
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }

        # Replace existing entry if same filename
        self.entries = [e for e in self.entries if e.get("filename") != file_path.name]
        self.entries.append(entry)
        return entry

    def save(self) -> Path:
        """Save manifest to disk."""
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        total_bytes = sum(e.get("bytes", 0) for e in self.entries)
        manifest_data = {
            "version": "1.0.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_files": len(self.entries),
            "total_bytes": total_bytes,
            "files": sorted(self.entries, key=lambda x: (x.get("variable", ""), x.get("filename", ""))),
        }
        with open(self.manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2)
        return self.manifest_path
