"""
Core phases for persona generation.
"""

import json
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from debug import (
    debug,
    debug_detailed,
    debug_error,
    debug_success,
    debug_warning,
)
from ui import print_status

from .models import PersonaPhaseResult

if TYPE_CHECKING:
    from .executor import AgentExecutor, ScriptExecutor

MAX_RETRIES = 3


class ProjectIndexPhase:
    """Handles project index creation and validation."""

    def __init__(
        self,
        output_dir: Path,
        refresh: bool,
        script_executor: "ScriptExecutor",
    ):
        self.output_dir = output_dir
        self.refresh = refresh
        self.script_executor = script_executor
        self.project_index = output_dir / "project_index.json"
        # Check for existing index in roadmap directory
        self.roadmap_index = output_dir.parent / "roadmap" / "project_index.json"

    async def execute(self) -> PersonaPhaseResult:
        """Ensure project index exists."""
        debug("persona_phase", "Starting phase: project_index")

        debug_detailed(
            "persona_phase",
            "Checking for existing project index",
            project_index=str(self.project_index),
            roadmap_index=str(self.roadmap_index),
        )

        # Check if we can copy existing index from roadmap
        if self.roadmap_index.exists() and not self.project_index.exists():
            debug(
                "persona_phase", "Copying existing project_index.json from roadmap"
            )
            shutil.copy(self.roadmap_index, self.project_index)
            print_status("Copied existing project_index.json from roadmap", "success")
            debug_success("persona_phase", "Project index copied successfully")
            return PersonaPhaseResult(
                "project_index", True, [str(self.project_index)], [], 0
            )

        if self.project_index.exists() and not self.refresh:
            debug("persona_phase", "project_index.json already exists, skipping")
            print_status("project_index.json already exists", "success")
            return PersonaPhaseResult(
                "project_index", True, [str(self.project_index)], [], 0
            )

        # Run analyzer
        debug("persona_phase", "Running project analyzer to create index")
        print_status("Running project analyzer...", "progress")
        success, output = self.script_executor.run_script(
            "analyzer.py", ["--output", str(self.project_index)]
        )

        if success and self.project_index.exists():
            debug_success("persona_phase", "Created project_index.json")
            print_status("Created project_index.json", "success")
            return PersonaPhaseResult(
                "project_index", True, [str(self.project_index)], [], 0
            )

        debug_error(
            "persona_phase",
            "Failed to create project index",
            output=output[:500] if output else None,
        )
        return PersonaPhaseResult("project_index", False, [], [output], 1)


class DiscoveryPhase:
    """Handles user type discovery from project analysis."""

    def __init__(
        self,
        output_dir: Path,
        refresh: bool,
        agent_executor: "AgentExecutor",
    ):
        self.output_dir = output_dir
        self.refresh = refresh
        self.agent_executor = agent_executor
        self.discovery_file = output_dir / "persona_discovery.json"
        self.project_index_file = output_dir / "project_index.json"
        # Check for roadmap discovery to sync
        self.roadmap_discovery = output_dir.parent / "roadmap" / "roadmap_discovery.json"

    async def execute(self) -> PersonaPhaseResult:
        """Run discovery phase to identify user types."""
        debug("persona_phase", "Starting phase: discovery")

        if self.discovery_file.exists() and not self.refresh:
            debug("persona_phase", "persona_discovery.json already exists, skipping")
            print_status("persona_discovery.json already exists", "success")
            return PersonaPhaseResult(
                "discovery", True, [str(self.discovery_file)], [], 0
            )

        errors = []
        for attempt in range(MAX_RETRIES):
            debug("persona_phase", f"Discovery attempt {attempt + 1}/{MAX_RETRIES}")
            print_status(
                f"Running persona discovery agent (attempt {attempt + 1})...", "progress"
            )

            context = self._build_context()
            success, output = await self.agent_executor.run_agent(
                "persona_discovery.md",
                additional_context=context,
            )

            if success and self.discovery_file.exists():
                validation_result = self._validate_discovery(attempt)
                if validation_result is not None:
                    return validation_result
                errors.append(f"Validation failed on attempt {attempt + 1}")
            else:
                debug_warning(
                    "persona_phase",
                    f"Discovery attempt {attempt + 1} failed - file not created",
                )
                errors.append(
                    f"Attempt {attempt + 1}: Agent did not create discovery file"
                )

        debug_error(
            "persona_phase", "Discovery phase failed after all retries", errors=errors
        )
        return PersonaPhaseResult("discovery", False, [], errors, MAX_RETRIES)

    def _build_context(self) -> str:
        """Build context string for the discovery agent."""
        context = f"""
**Project Index**: {self.project_index_file}
**Output Directory**: {self.output_dir}
**Output File**: {self.discovery_file}

IMPORTANT: This runs NON-INTERACTIVELY. Do NOT ask questions or wait for user input.

Your task:
1. Analyze the project (read README, code structure, git history)
2. Identify distinct user types that would use this software
3. IMMEDIATELY create {self.discovery_file} with identified user types
"""
        # Add roadmap context if available
        if self.roadmap_discovery.exists():
            context += f"""
**Roadmap Discovery Available**: {self.roadmap_discovery}
Sync with roadmap target_audience if available.
"""
        else:
            context += "\n**Roadmap Discovery**: Not available\n"

        context += "\nDo NOT ask questions. Make educated inferences and create the file.\n"
        return context

    def _validate_discovery(self, attempt: int) -> PersonaPhaseResult | None:
        """Validate the discovery file.

        Returns PersonaPhaseResult if validation succeeds, None otherwise.
        """
        try:
            with open(self.discovery_file) as f:
                data = json.load(f)

            required = ["project_name", "identified_user_types"]
            missing = [k for k in required if k not in data]

            user_types = data.get("identified_user_types", [])
            if not user_types:
                missing.append("identified_user_types (empty)")

            if not missing:
                debug_success(
                    "persona_phase",
                    "Created valid persona_discovery.json",
                    attempt=attempt + 1,
                    user_type_count=len(user_types),
                )
                print_status(
                    f"Created valid persona_discovery.json with {len(user_types)} user types",
                    "success",
                )
                return PersonaPhaseResult(
                    "discovery", True, [str(self.discovery_file)], [], attempt
                )
            else:
                debug_warning("persona_phase", f"Missing required fields: {missing}")
                return None

        except json.JSONDecodeError as e:
            debug_error("persona_phase", "Invalid JSON in discovery file", error=str(e))
            return None


class ResearchPhase:
    """Handles optional web research enrichment of personas."""

    def __init__(
        self,
        output_dir: Path,
        refresh: bool,
        agent_executor: "AgentExecutor",
    ):
        self.output_dir = output_dir
        self.refresh = refresh
        self.agent_executor = agent_executor
        self.research_file = output_dir / "research_results.json"
        self.discovery_file = output_dir / "persona_discovery.json"

    async def execute(self, enabled: bool = False) -> PersonaPhaseResult:
        """Run research phase to enrich personas with web insights."""
        debug("persona_phase", "Starting phase: research", enabled=enabled)

        if not enabled:
            debug("persona_phase", "Research phase disabled, skipping")
            print_status("Web research disabled, skipping", "info")
            self._create_disabled_research_file()
            return PersonaPhaseResult(
                "research", True, [str(self.research_file)], [], 0
            )

        if not self.discovery_file.exists():
            debug_error(
                "persona_phase",
                "Discovery file not found - cannot run research",
                discovery_file=str(self.discovery_file),
            )
            return PersonaPhaseResult(
                "research", False, [], ["Discovery file not found"], 0
            )

        if self.research_file.exists() and not self.refresh:
            debug("persona_phase", "research_results.json already exists, skipping")
            print_status("research_results.json already exists", "success")
            return PersonaPhaseResult(
                "research", True, [str(self.research_file)], [], 0
            )

        errors = []
        for attempt in range(MAX_RETRIES):
            debug("persona_phase", f"Research attempt {attempt + 1}/{MAX_RETRIES}")
            print_status(
                f"Running persona research agent (attempt {attempt + 1})...", "progress"
            )

            context = self._build_context()
            success, output = await self.agent_executor.run_agent(
                "persona_research.md",
                additional_context=context,
            )

            if success and self.research_file.exists():
                validation_result = self._validate_research(attempt)
                if validation_result is not None:
                    return validation_result
                errors.append(f"Validation failed on attempt {attempt + 1}")
            else:
                debug_warning(
                    "persona_phase",
                    f"Research attempt {attempt + 1} failed - file not created",
                )
                errors.append(
                    f"Attempt {attempt + 1}: Agent did not create research file"
                )

        # Research is optional - graceful degradation
        debug_warning(
            "persona_phase",
            "Research phase failed, creating fallback file",
            errors=errors,
        )
        print_status("Research failed, proceeding without enrichment", "warning")
        self._create_fallback_research_file(errors)
        return PersonaPhaseResult(
            "research", True, [str(self.research_file)], errors, MAX_RETRIES
        )

    def _build_context(self) -> str:
        """Build context string for the research agent."""
        return f"""
**Discovery File**: {self.discovery_file}
**Output Directory**: {self.output_dir}
**Output File**: {self.research_file}

Your task:
1. Read persona_discovery.json to understand identified user types
2. Conduct web research to enrich each user type
3. IMMEDIATELY create {self.research_file} with research results

Do NOT ask questions. Conduct research and create the file.
"""

    def _validate_research(self, attempt: int) -> PersonaPhaseResult | None:
        """Validate the research file.

        Returns PersonaPhaseResult if validation succeeds, None otherwise.
        """
        try:
            with open(self.research_file) as f:
                data = json.load(f)

            required = ["research_completed_at", "user_type_enrichments"]
            missing = [k for k in required if k not in data]

            if not missing:
                enrichment_count = len(data.get("user_type_enrichments", []))
                debug_success(
                    "persona_phase",
                    "Created valid research_results.json",
                    attempt=attempt + 1,
                    enrichment_count=enrichment_count,
                )
                print_status(
                    f"Created valid research_results.json with {enrichment_count} enrichments",
                    "success",
                )
                return PersonaPhaseResult(
                    "research", True, [str(self.research_file)], [], attempt
                )
            else:
                debug_warning("persona_phase", f"Missing required fields: {missing}")
                return None

        except json.JSONDecodeError as e:
            debug_error("persona_phase", "Invalid JSON in research file", error=str(e))
            return None

    def _create_disabled_research_file(self):
        """Create a research file indicating research was disabled."""
        from datetime import datetime

        with open(self.research_file, "w") as f:
            json.dump(
                {
                    "research_completed_at": datetime.now().isoformat(),
                    "user_type_enrichments": [],
                    "market_context": None,
                    "research_sources": [],
                    "research_limitations": ["Research phase was disabled by user"],
                },
                f,
                indent=2,
            )

    def _create_fallback_research_file(self, errors: list[str]):
        """Create a fallback research file on failure."""
        from datetime import datetime

        with open(self.research_file, "w") as f:
            json.dump(
                {
                    "research_completed_at": datetime.now().isoformat(),
                    "user_type_enrichments": [],
                    "market_context": None,
                    "research_sources": [],
                    "research_limitations": [
                        "Research phase failed - proceeding without enrichment"
                    ]
                    + errors,
                },
                f,
                indent=2,
            )


class GenerationPhase:
    """Handles persona generation from discovery and research data."""

    def __init__(
        self,
        output_dir: Path,
        refresh: bool,
        agent_executor: "AgentExecutor",
    ):
        self.output_dir = output_dir
        self.refresh = refresh
        self.agent_executor = agent_executor
        self.personas_file = output_dir / "personas.json"
        self.discovery_file = output_dir / "persona_discovery.json"
        self.research_file = output_dir / "research_results.json"

    async def execute(self) -> PersonaPhaseResult:
        """Generate detailed personas from discovery and research data."""
        debug("persona_phase", "Starting phase: generation")

        if not self.discovery_file.exists():
            debug_error(
                "persona_phase",
                "Discovery file not found - cannot generate personas",
                discovery_file=str(self.discovery_file),
            )
            return PersonaPhaseResult(
                "generation", False, [], ["Discovery file not found"], 0
            )

        if self.personas_file.exists() and not self.refresh:
            debug("persona_phase", "personas.json already exists, skipping")
            print_status("personas.json already exists", "success")
            return PersonaPhaseResult(
                "generation", True, [str(self.personas_file)], [], 0
            )

        errors = []
        for attempt in range(MAX_RETRIES):
            debug("persona_phase", f"Generation attempt {attempt + 1}/{MAX_RETRIES}")
            print_status(
                f"Running persona generation agent (attempt {attempt + 1})...",
                "progress",
            )

            context = self._build_context()
            success, output = await self.agent_executor.run_agent(
                "persona_generation.md",
                additional_context=context,
            )

            if success and self.personas_file.exists():
                validation_result = self._validate_personas(attempt)
                if validation_result is not None:
                    return validation_result
                errors.append(f"Validation failed on attempt {attempt + 1}")
            else:
                debug_warning(
                    "persona_phase",
                    f"Generation attempt {attempt + 1} failed - file not created",
                )
                errors.append(
                    f"Attempt {attempt + 1}: Agent did not create personas file"
                )

        debug_error(
            "persona_phase", "Generation phase failed after all retries", errors=errors
        )
        return PersonaPhaseResult("generation", False, [], errors, MAX_RETRIES)

    def _build_context(self) -> str:
        """Build context string for the generation agent."""
        context = f"""
**Discovery File**: {self.discovery_file}
**Output Directory**: {self.output_dir}
**Output File**: {self.personas_file}

Based on the discovery data, generate detailed personas.
"""
        # Add research context if available
        if self.research_file.exists():
            context += f"""
**Research File**: {self.research_file}
Use research data to enrich personas with validated pain points and quotes.
"""
        else:
            context += "\n**Research File**: Not available - generate without research enrichment\n"

        context += "\nOutput the complete personas to personas.json.\n"
        return context

    def _validate_personas(self, attempt: int) -> PersonaPhaseResult | None:
        """Validate the personas file.

        Returns PersonaPhaseResult if validation succeeds, None otherwise.
        """
        try:
            with open(self.personas_file) as f:
                data = json.load(f)

            required = ["version", "projectId", "personas", "metadata"]
            missing = [k for k in required if k not in data]

            personas = data.get("personas", [])
            if not personas:
                missing.append("personas (empty)")

            # Validate each persona has required fields
            required_persona_fields = [
                "id",
                "name",
                "type",
                "tagline",
                "demographics",
                "goals",
                "painPoints",
            ]
            for i, persona in enumerate(personas):
                for field in required_persona_fields:
                    if field not in persona:
                        missing.append(f"personas[{i}].{field}")

            if not missing:
                debug_success(
                    "persona_phase",
                    "Created valid personas.json",
                    attempt=attempt + 1,
                    persona_count=len(personas),
                )
                print_status(
                    f"Created valid personas.json with {len(personas)} personas",
                    "success",
                )
                return PersonaPhaseResult(
                    "generation", True, [str(self.personas_file)], [], attempt
                )
            else:
                debug_warning("persona_phase", f"Missing required fields: {missing}")
                return None

        except json.JSONDecodeError as e:
            debug_error("persona_phase", "Invalid JSON in personas file", error=str(e))
            return None
