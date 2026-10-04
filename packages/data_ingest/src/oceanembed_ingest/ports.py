"""Ports and interfaces for OceanEmbed data ingestion."""

from oceanembed_ingest.sources.argo import ArgoGriddedDownloader, ArgoProfilesDownloader
from oceanembed_ingest.sources.base import BaseSourceDownloader
from oceanembed_ingest.sources.bathymetry import BathymetryDownloader
from oceanembed_ingest.sources.copernicus import AllProductsDownloader, CopernicusDownloader
from oceanembed_ingest.sources.podaac import PodaacDownloader

__all__ = [
    "BaseSourceDownloader",
    "CopernicusDownloader",
    "AllProductsDownloader",
    "PodaacDownloader",
    "ArgoProfilesDownloader",
    "ArgoGriddedDownloader",
    "BathymetryDownloader",
]
