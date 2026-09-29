"""OceanEmbed Input Channels Contract.

Defines the fixed ordering, units, and physical bounds for 7 surface input channels and 4 context channels.
"""
from dataclasses import dataclass
from typing import Dict, List, Tuple

SURFACE_CHANNELS: List[str] = [
    "sst",    # 0: Sea Surface Temperature [degC]
    "sss",    # 1: Sea Surface Salinity [psu]
    "sla",    # 2: Sea Level Anomaly [m]
    "ucur",   # 3: Zonal Surface Current [m/s]
    "vcur",   # 4: Meridional Surface Current [m/s]
    "uwind",  # 5: Zonal Surface Wind [m/s]
    "vwind",  # 6: Meridional Surface Wind [m/s]
]

CONTEXT_CHANNELS: List[str] = [
    "bathymetry",  # 0: Seafloor elevation/depth [m]
    "latitude",    # 1: Latitude coordinate [degN]
    "sin_doy",     # 2: Sine of Day of Year (annual cycle)
    "cos_doy",     # 3: Cosine of Day of Year (annual cycle)
]

NUM_SURFACE_CHANNELS: int = len(SURFACE_CHANNELS)  # 7
NUM_CONTEXT_CHANNELS: int = len(CONTEXT_CHANNELS)  # 4


@dataclass(frozen=True)
class ChannelInfo:
    name: str
    long_name: str
    units: str
    order: int
    min_val: float
    max_val: float


CHANNEL_REGISTRY: Dict[str, ChannelInfo] = {
    "sst": ChannelInfo("sst", "Sea Surface Temperature", "degC", 0, -2.0, 38.0),
    "sss": ChannelInfo("sss", "Sea Surface Salinity", "psu", 1, 10.0, 45.0),
    "sla": ChannelInfo("sla", "Sea Level Anomaly", "m", 2, -2.5, 2.5),
    "ucur": ChannelInfo("ucur", "Zonal Surface Current", "m/s", 3, -5.0, 5.0),
    "vcur": ChannelInfo("vcur", "Meridional Surface Current", "m/s", 4, -5.0, 5.0),
    "uwind": ChannelInfo("uwind", "Zonal Surface Wind", "m/s", 5, -50.0, 50.0),
    "vwind": ChannelInfo("vwind", "Meridional Surface Wind", "m/s", 6, -50.0, 50.0),
}


def get_surface_channel_index(name: str) -> int:
    """Return 0-based channel index for a surface input channel."""
    if name not in SURFACE_CHANNELS:
        raise ValueError(f"Channel '{name}' is not in frozen surface channels: {SURFACE_CHANNELS}")
    return SURFACE_CHANNELS.index(name)


def get_context_channel_index(name: str) -> int:
    """Return 0-based channel index for a context channel."""
    if name not in CONTEXT_CHANNELS:
        raise ValueError(f"Channel '{name}' is not in context channels: {CONTEXT_CHANNELS}")
    return CONTEXT_CHANNELS.index(name)
