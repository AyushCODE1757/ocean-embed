"""Base abstract interface for data source downloaders."""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List


class BaseSourceDownloader(ABC):
    """Abstract interface for downloading oceanographic observation and reanalysis datasets."""

    def __init__(self, output_dir: Path):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    @abstractmethod
    def download(self, start_date: str, end_date: str, **kwargs) -> List[Path]:
        """Download dataset files for specified date range [start_date, end_date]."""
        pass

    @abstractmethod
    def get_dataset_id(self) -> str:
        """Return unique catalog dataset identifier."""
        pass
