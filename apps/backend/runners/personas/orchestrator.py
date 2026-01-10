"""
Persona generation orchestrator.

Coordinates all phases of the persona generation process.
"""

import asyncio
import json
from pathlib import Path

from client import create_client
from debug import debug, debug_error, debug_section, debug_success
from init import init_auto_claude_dir
from phase_config import get_thinking_budget
from ui import Icons, box, icon, muted, print_section, print_status

from .executor import AgentExecutor, ScriptExecutor
from .graph_integration import GraphHintsProvider
from .phases import DiscoveryPhase, GenerationPhase, ProjectIndexPhase, ResearchPhase


class PersonaOrchestrator:
    """Orchestrates the persona creation process."""

    def __init__(
        self,
        project_dir: Path,
        output_dir: Path | None = None,
        model: str = "sonnet",
        thinking_level: str = "medium",
        refresh: bool = False,
        enable_research: bool = False,
    ):
        self.project_dir = Path(project_dir)
        self.model = model
        self.thinking_level = thinking_level
        self.thinking_budget = get_thinking_budget(thinking_level)
        self.refresh = refresh
        self.enable_research = enable_research

        # Default output to project's .auto-claude directory (installed instance)
        # Note: auto-claude/ is source code, .auto-claude/ is the installed instance
        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            # Initialize .auto-claude directory and ensure it's in .gitignore
            init_auto_claude_dir(self.project_dir)
            self.output_dir = self.project_dir / ".auto-claude" / "personas"

        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Initialize executors
        self.script_executor = ScriptExecutor(self.project_dir)
        self.agent_executor = AgentExecutor(
            self.project_dir,
            self.output_dir,
            self.model,
            create_client,
            self.thinking_budget,
        )

        # Initialize phase handlers
        self.graph_hints_provider = GraphHintsProvider(
            self.output_dir, self.project_dir, self.refresh
        )
        self.project_index_phase = ProjectIndexPhase(
            self.output_dir, self.refresh, self.script_executor
        )
        self.discovery_phase = DiscoveryPhase(
            self.output_dir, self.refresh, self.agent_executor
        )
        self.research_phase = ResearchPhase(
            self.output_dir, self.refresh, self.agent_executor
        )
        self.generation_phase = GenerationPhase(
            self.output_dir, self.refresh, self.agent_executor
        )

        debug_section("persona_orchestrator", "Persona Orchestrator Initialized")
        debug(
            "persona_orchestrator",
            "Configuration",
            project_dir=str(self.project_dir),
            output_dir=str(self.output_dir),
            model=self.model,
            refresh=self.refresh,
            enable_research=self.enable_research,
        )

    async def run(self) -> bool:
        """Run the complete persona generation process."""
        debug_section("persona_orchestrator", "Starting Persona Generation")
        debug(
            "persona_orchestrator",
            "Run configuration",
            project_dir=str(self.project_dir),
            output_dir=str(self.output_dir),
            model=self.model,
            refresh=self.refresh,
            enable_research=self.enable_research,
        )

        print(
            box(
                f"Project: {self.project_dir}\n"
                f"Output: {self.output_dir}\n"
                f"Model: {self.model}\n"
                f"Web Research: {'enabled' if self.enable_research else 'disabled'}",
                title="PERSONA GENERATOR",
                style="heavy",
            )
        )
        results = []

        # Phase 1: Project Index & Graph Hints (in parallel)
        debug(
            "persona_orchestrator",
            "Starting Phase 1: Project Analysis & Graph Hints (parallel)",
        )
        print_section("PHASE 1: PROJECT ANALYSIS & GRAPH HINTS", Icons.FOLDER)

        # Run project index and graph hints in parallel
        index_task = self.project_index_phase.execute()
        hints_task = self.graph_hints_provider.retrieve_hints()
        index_result, hints_result = await asyncio.gather(index_task, hints_task)

        results.append(index_result)
        results.append(hints_result)

        debug(
            "persona_orchestrator",
            "Phase 1 complete",
            index_success=index_result.success,
            hints_success=hints_result.success,
        )

        if not index_result.success:
            debug_error(
                "persona_orchestrator",
                "Project analysis failed - aborting persona generation",
            )
            print_status("Project analysis failed", "error")
            return False
        # Note: hints_result.success is always True (graceful degradation)

        # Phase 2: Discovery
        debug("persona_orchestrator", "Starting Phase 2: User Type Discovery")
        print_section("PHASE 2: USER TYPE DISCOVERY", Icons.SEARCH)
        result = await self.discovery_phase.execute()
        results.append(result)
        if not result.success:
            debug_error(
                "persona_orchestrator",
                "Discovery failed - aborting persona generation",
                errors=result.errors,
            )
            print_status("Discovery failed", "error")
            for err in result.errors:
                print(f"  {muted('Error:')} {err}")
            return False
        debug_success("persona_orchestrator", "Phase 2 complete")

        # Phase 3: Research (optional, graceful degradation)
        debug("persona_orchestrator", "Starting Phase 3: Research (optional)")
        print_section("PHASE 3: WEB RESEARCH (OPTIONAL)", Icons.SEARCH)
        research_result = await self.research_phase.execute(enabled=self.enable_research)
        results.append(research_result)
        # Note: research_result.success is always True (graceful degradation)

        # Phase 4: Persona Generation
        debug("persona_orchestrator", "Starting Phase 4: Persona Generation")
        print_section("PHASE 4: PERSONA GENERATION", Icons.SUBTASK)
        result = await self.generation_phase.execute()
        results.append(result)
        if not result.success:
            debug_error(
                "persona_orchestrator",
                "Persona generation failed - aborting",
                errors=result.errors,
            )
            print_status("Persona generation failed", "error")
            for err in result.errors:
                print(f"  {muted('Error:')} {err}")
            return False
        debug_success("persona_orchestrator", "Phase 4 complete")

        # Summary
        self._print_summary()
        return True

    def _print_summary(self):
        """Print the final persona generation summary."""
        personas_file = self.output_dir / "personas.json"
        if not personas_file.exists():
            return

        with open(personas_file) as f:
            personas_data = json.load(f)

        personas = personas_data.get("personas", [])
        metadata = personas_data.get("metadata", {})

        # Count by type
        type_counts = {}
        for p in personas:
            t = p.get("type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1

        # Count goals and pain points
        total_goals = sum(len(p.get("goals", [])) for p in personas)
        total_pain_points = sum(len(p.get("painPoints", [])) for p in personas)

        debug_success(
            "persona_orchestrator",
            "Persona generation complete",
            persona_count=len(personas),
            type_breakdown=type_counts,
            total_goals=total_goals,
            total_pain_points=total_pain_points,
        )

        # Build persona list for display
        persona_list = "\n".join(
            f"  {icon(Icons.ARROW_RIGHT)} {p.get('name', 'Unknown')} ({p.get('type', 'unknown')})"
            for p in personas
        )

        print(
            box(
                f"Personas Generated: {len(personas)}\n\n"
                f"Personas:\n{persona_list}\n\n"
                f"Type breakdown:\n"
                + "\n".join(
                    f"  {icon(Icons.ARROW_RIGHT)} {t.upper()}: {c}"
                    for t, c in type_counts.items()
                )
                + f"\n\nGoals: {total_goals} | Pain Points: {total_pain_points}"
                + f"\nResearch Enriched: {'Yes' if metadata.get('researchEnriched') else 'No'}"
                + f"\n\nPersonas saved to: {personas_file}",
                title=f"{icon(Icons.SUCCESS)} PERSONAS GENERATED",
                style="heavy",
            )
        )
