#!/usr/bin/env python3
"""
Persona Generation Runner

CLI entry point for generating user personas for a project.
Analyzes project structure, documentation, and optionally conducts web research
to generate detailed user personas.

Usage:
    python persona_runner.py [options]

Examples:
    # Generate personas for current directory
    python persona_runner.py

    # Generate personas for specific project
    python persona_runner.py --project /path/to/project

    # Enable web research enrichment
    python persona_runner.py --research

    # Force regeneration
    python persona_runner.py --refresh
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from personas import PersonaOrchestrator


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate user personas for a project",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python persona_runner.py
    python persona_runner.py --project /path/to/project
    python persona_runner.py --research
    python persona_runner.py --refresh --research
        """,
    )

    parser.add_argument(
        "--project",
        "-p",
        type=str,
        default=".",
        help="Path to project directory (default: current directory)",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Output directory for personas (default: .auto-claude/personas/)",
    )

    parser.add_argument(
        "--model",
        "-m",
        type=str,
        default="sonnet",
        choices=["sonnet", "opus", "haiku"],
        help="Claude model to use (default: sonnet)",
    )

    parser.add_argument(
        "--thinking-level",
        "-t",
        type=str,
        default="medium",
        choices=["none", "low", "medium", "high"],
        help="Thinking level for agent (default: medium)",
    )

    parser.add_argument(
        "--refresh",
        "-r",
        action="store_true",
        help="Force regeneration even if personas exist",
    )

    parser.add_argument(
        "--research",
        action="store_true",
        help="Enable web research enrichment phase",
    )

    return parser.parse_args()


async def main():
    """Main entry point."""
    args = parse_args()

    project_dir = Path(args.project).resolve()
    if not project_dir.exists():
        print(f"Error: Project directory not found: {project_dir}")
        sys.exit(1)

    output_dir = Path(args.output).resolve() if args.output else None

    orchestrator = PersonaOrchestrator(
        project_dir=project_dir,
        output_dir=output_dir,
        model=args.model,
        thinking_level=args.thinking_level,
        refresh=args.refresh,
        enable_research=args.research,
    )

    success = await orchestrator.run()

    if success:
        print("\n✓ Persona generation completed successfully")
        sys.exit(0)
    else:
        print("\n✗ Persona generation failed")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
