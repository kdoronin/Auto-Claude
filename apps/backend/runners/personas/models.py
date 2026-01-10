"""
Data models for persona generation.
"""

from dataclasses import dataclass
from pathlib import Path


@dataclass
class PersonaPhaseResult:
    """Result of a persona phase execution."""

    phase: str
    success: bool
    output_files: list[str]
    errors: list[str]
    retries: int


@dataclass
class PersonaConfig:
    """Configuration for persona generation."""

    project_dir: Path
    output_dir: Path
    model: str = "sonnet"
    thinking_level: str = "medium"
    refresh: bool = False  # Force regeneration even if personas exist
    enable_research: bool = False  # Enable web research enrichment phase
