"""
Unit Tests for AutoPRReviewOrchestrator
========================================

Tests for the AutoPRReviewOrchestrator class covering:
- State transitions and lifecycle management
- Max iterations enforcement
- Cancellation support
- Authorization checks
- Concurrent review semaphore
- Statistics tracking

Run with: pytest tests/test_auto_pr_review_orchestrator.py -v
"""

import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Add the backend directory to the path for imports
backend_path = Path(__file__).parent.parent / "apps" / "backend"
sys.path.insert(0, str(backend_path))

import pytest

from runners.github.services.auto_pr_review_orchestrator import (
    AutoPRReviewOrchestrator,
    OrchestratorCancelledError,
    OrchestratorResult,
    OrchestratorRunResult,
    OrchestratorUnauthorizedError,
    get_auto_pr_review_orchestrator,
    reset_auto_pr_review_orchestrator,
    DEFAULT_MAX_ITERATIONS,
    DEFAULT_MAX_CONCURRENT_REVIEWS,
    DEFAULT_CI_TIMEOUT,
    DEFAULT_BOT_TIMEOUT,
)
from runners.github.models_pkg.pr_review_state import (
    CheckStatus,
    CICheckResult,
    ExternalBotStatus,
    PRReviewOrchestratorState,
    PRReviewStatus,
)
from runners.github.services.pr_check_waiter import (
    WaitForChecksResult,
    WaitResult,
)


class TestOrchestratorInitialization:
    """Tests for AutoPRReviewOrchestrator initialization and configuration."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    # =========================================================================
    # Initialization Tests
    # =========================================================================

    def test_default_initialization(self, temp_dirs: dict) -> None:
        """Test default configuration values."""
        orchestrator = AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )
        assert orchestrator.max_iterations == DEFAULT_MAX_ITERATIONS
        assert orchestrator.max_concurrent_reviews == DEFAULT_MAX_CONCURRENT_REVIEWS
        assert orchestrator.ci_timeout == DEFAULT_CI_TIMEOUT
        assert orchestrator.bot_timeout == DEFAULT_BOT_TIMEOUT

    def test_custom_initialization(self, temp_dirs: dict) -> None:
        """Test custom configuration values."""
        orchestrator = AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            max_iterations=3,
            max_concurrent_reviews=5,
            ci_timeout=600.0,
            bot_timeout=300.0,
            log_enabled=False,
        )
        assert orchestrator.max_iterations == 3
        assert orchestrator.max_concurrent_reviews == 5
        assert orchestrator.ci_timeout == 600.0
        assert orchestrator.bot_timeout == 300.0

    def test_initial_state(self, temp_dirs: dict) -> None:
        """Test initial state values."""
        orchestrator = AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )
        assert orchestrator._active_reviews == {}
        assert orchestrator._cancel_events == {}
        assert orchestrator.get_queue_size() == 0

    def test_statistics_initial(self, temp_dirs: dict) -> None:
        """Test initial statistics."""
        orchestrator = AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )
        stats = orchestrator.get_statistics()
        assert stats["active_reviews"] == 0
        assert stats["max_concurrent_reviews"] == DEFAULT_MAX_CONCURRENT_REVIEWS
        assert stats["max_iterations"] == DEFAULT_MAX_ITERATIONS


class TestAuthorization:
    """Tests for user authorization functionality."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    # =========================================================================
    # Authorization Tests
    # =========================================================================

    def test_no_allowed_users_denies_all(self, temp_dirs: dict) -> None:
        """Test that empty allowlist denies all users."""
        with patch.dict(os.environ, {}, clear=True):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )
            assert orchestrator.is_user_authorized("any_user") is False
            assert orchestrator.is_user_authorized("admin") is False

    def test_wildcard_allows_all(self, temp_dirs: dict) -> None:
        """Test that wildcard allowlist allows all users."""
        with patch.dict(os.environ, {"GITHUB_AUTO_PR_REVIEW_ALLOWED_USERS": "*"}):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )
            assert orchestrator.is_user_authorized("any_user") is True
            assert orchestrator.is_user_authorized("admin") is True

    def test_explicit_user_allowed(self, temp_dirs: dict) -> None:
        """Test that explicitly listed users are allowed."""
        with patch.dict(
            os.environ,
            {"GITHUB_AUTO_PR_REVIEW_ALLOWED_USERS": "user1,user2,user3"},
        ):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )
            assert orchestrator.is_user_authorized("user1") is True
            assert orchestrator.is_user_authorized("user2") is True
            assert orchestrator.is_user_authorized("user3") is True
            assert orchestrator.is_user_authorized("user4") is False

    def test_authorization_case_insensitive(self, temp_dirs: dict) -> None:
        """Test that authorization is case insensitive."""
        with patch.dict(
            os.environ,
            {"GITHUB_AUTO_PR_REVIEW_ALLOWED_USERS": "UserOne,USERTWO"},
        ):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )
            assert orchestrator.is_user_authorized("userone") is True
            assert orchestrator.is_user_authorized("UserOne") is True
            assert orchestrator.is_user_authorized("USERONE") is True
            assert orchestrator.is_user_authorized("usertwo") is True

    def test_require_authorization_raises(self, temp_dirs: dict) -> None:
        """Test that _require_authorization raises for unauthorized users."""
        with patch.dict(os.environ, {}, clear=True):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )
            with pytest.raises(OrchestratorUnauthorizedError) as exc_info:
                orchestrator._require_authorization("unauthorized_user")
            assert "unauthorized_user" in str(exc_info.value)


class TestCancellation:
    """Tests for cancellation functionality."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    @pytest.fixture
    def orchestrator(self, temp_dirs: dict) -> AutoPRReviewOrchestrator:
        """Create an orchestrator for testing."""
        return AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )

    # =========================================================================
    # Cancellation Tests
    # =========================================================================

    def test_cancel_no_active_review(self, orchestrator: AutoPRReviewOrchestrator) -> None:
        """Test cancel returns False when no review is active."""
        result = orchestrator.cancel(123)
        assert result is False

    def test_cancel_sets_event(self, orchestrator: AutoPRReviewOrchestrator) -> None:
        """Test cancel sets the cancellation event."""
        # Simulate an active review by adding a cancel event
        orchestrator._cancel_events[123] = asyncio.Event()

        result = orchestrator.cancel(123)
        assert result is True
        assert orchestrator._cancel_events[123].is_set()

    def test_check_cancelled_raises(self, orchestrator: AutoPRReviewOrchestrator) -> None:
        """Test _check_cancelled raises when cancelled."""
        orchestrator._cancel_events[123] = asyncio.Event()
        orchestrator._cancel_events[123].set()

        with pytest.raises(OrchestratorCancelledError) as exc_info:
            orchestrator._check_cancelled(123)
        assert "123" in str(exc_info.value)

    def test_check_cancelled_no_raise_when_not_cancelled(
        self, orchestrator: AutoPRReviewOrchestrator
    ) -> None:
        """Test _check_cancelled does not raise when not cancelled."""
        orchestrator._cancel_events[123] = asyncio.Event()
        # Event is not set, so should not raise
        orchestrator._check_cancelled(123)  # Should not raise


class TestStateTransitions:
    """Tests for state transitions and PRReviewStatus."""

    # =========================================================================
    # State Transition Tests
    # =========================================================================

    def test_pr_review_status_terminal_states(self) -> None:
        """Test terminal states are correctly identified."""
        terminal = PRReviewStatus.terminal_states()
        assert PRReviewStatus.READY_TO_MERGE in terminal
        assert PRReviewStatus.COMPLETED in terminal
        assert PRReviewStatus.CANCELLED in terminal
        assert PRReviewStatus.FAILED in terminal
        assert PRReviewStatus.MAX_ITERATIONS_REACHED in terminal

    def test_pr_review_status_active_states(self) -> None:
        """Test active states are correctly identified."""
        active = PRReviewStatus.active_states()
        assert PRReviewStatus.PENDING in active
        assert PRReviewStatus.AWAITING_CHECKS in active
        assert PRReviewStatus.REVIEWING in active
        assert PRReviewStatus.FIXING in active

    def test_is_terminal_method(self) -> None:
        """Test is_terminal method on status enum."""
        assert PRReviewStatus.READY_TO_MERGE.is_terminal() is True
        assert PRReviewStatus.PENDING.is_terminal() is False
        assert PRReviewStatus.FIXING.is_terminal() is False

    def test_is_active_method(self) -> None:
        """Test is_active method on status enum."""
        assert PRReviewStatus.PENDING.is_active() is True
        assert PRReviewStatus.AWAITING_CHECKS.is_active() is True
        assert PRReviewStatus.READY_TO_MERGE.is_active() is False

    def test_state_should_continue(self) -> None:
        """Test should_continue logic."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
            max_iterations=5,
        )

        # Initially should continue
        assert state.should_continue() is True

        # After cancellation, should not continue
        state.cancellation_requested = True
        assert state.should_continue() is False

        # Reset and test terminal status
        state.cancellation_requested = False
        state.status = PRReviewStatus.READY_TO_MERGE
        assert state.should_continue() is False

        # Reset and test max iterations
        state.status = PRReviewStatus.PENDING
        state.current_iteration = 5
        assert state.should_continue() is False

    def test_state_start_iteration(self) -> None:
        """Test start_iteration increments counter."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
        )

        assert state.current_iteration == 0
        record = state.start_iteration()
        assert state.current_iteration == 1
        assert record.iteration_number == 1
        assert len(state.iteration_history) == 1

        state.start_iteration()
        assert state.current_iteration == 2
        assert len(state.iteration_history) == 2

    def test_state_mark_completed(self) -> None:
        """Test mark_completed sets status and timestamp."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
        )

        assert state.completed_at is None
        state.mark_completed(PRReviewStatus.READY_TO_MERGE)
        assert state.status == PRReviewStatus.READY_TO_MERGE
        assert state.completed_at is not None


class TestMaxIterations:
    """Tests for max iterations enforcement."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    # =========================================================================
    # Max Iterations Tests
    # =========================================================================

    def test_max_iterations_default(self, temp_dirs: dict) -> None:
        """Test default max iterations value."""
        orchestrator = AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )
        assert orchestrator.max_iterations == 5

    def test_max_iterations_custom(self, temp_dirs: dict) -> None:
        """Test custom max iterations value."""
        orchestrator = AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            max_iterations=3,
            log_enabled=False,
        )
        assert orchestrator.max_iterations == 3

    def test_state_max_iterations_check(self) -> None:
        """Test state max iterations enforcement."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
            max_iterations=3,
        )

        # Iterate up to max
        for i in range(3):
            assert state.should_continue() is True
            state.start_iteration()

        # Should not continue after max reached
        assert state.should_continue() is False


class TestOrchestratorResultTypes:
    """Tests for OrchestratorResult and OrchestratorRunResult."""

    # =========================================================================
    # Result Type Tests
    # =========================================================================

    def test_orchestrator_result_values(self) -> None:
        """Test OrchestratorResult enum values."""
        assert OrchestratorResult.READY_TO_MERGE.value == "ready_to_merge"
        assert OrchestratorResult.NO_FINDINGS.value == "no_findings"
        assert OrchestratorResult.MAX_ITERATIONS.value == "max_iterations"
        assert OrchestratorResult.CI_FAILED.value == "ci_failed"
        assert OrchestratorResult.CANCELLED.value == "cancelled"
        assert OrchestratorResult.UNAUTHORIZED.value == "unauthorized"
        assert OrchestratorResult.PR_CLOSED.value == "pr_closed"
        assert OrchestratorResult.PR_MERGED.value == "pr_merged"
        assert OrchestratorResult.ERROR.value == "error"

    def test_run_result_creation(self) -> None:
        """Test creating an OrchestratorRunResult."""
        result = OrchestratorRunResult(
            result=OrchestratorResult.READY_TO_MERGE,
            pr_number=123,
            repo="owner/repo",
            iterations_completed=2,
            findings_fixed=5,
            ci_all_passed=True,
        )
        assert result.result == OrchestratorResult.READY_TO_MERGE
        assert result.pr_number == 123
        assert result.iterations_completed == 2
        assert result.findings_fixed == 5
        assert result.ci_all_passed is True
        assert result.needs_human_review is True  # Always true

    def test_run_result_to_dict(self) -> None:
        """Test serialization to dictionary."""
        result = OrchestratorRunResult(
            result=OrchestratorResult.CANCELLED,
            pr_number=456,
            repo="test/repo",
            error_message="User cancelled",
            duration_seconds=120.5,
        )
        d = result.to_dict()

        assert d["result"] == "cancelled"
        assert d["pr_number"] == 456
        assert d["repo"] == "test/repo"
        assert d["error_message"] == "User cancelled"
        assert d["duration_seconds"] == 120.5
        assert d["needs_human_review"] is True


class TestExceptions:
    """Tests for exception classes."""

    # =========================================================================
    # Exception Tests
    # =========================================================================

    def test_cancelled_error(self) -> None:
        """Test OrchestratorCancelledError."""
        error = OrchestratorCancelledError("Review was cancelled")
        assert "cancelled" in str(error).lower()

    def test_unauthorized_error(self) -> None:
        """Test OrchestratorUnauthorizedError."""
        error = OrchestratorUnauthorizedError("testuser")
        assert error.username == "testuser"
        assert "testuser" in str(error)
        assert "not authorized" in str(error).lower()


class TestStatePersistence:
    """Tests for state persistence and loading."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    @pytest.fixture
    def orchestrator(self, temp_dirs: dict) -> AutoPRReviewOrchestrator:
        """Create an orchestrator for testing."""
        return AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )

    # =========================================================================
    # State Persistence Tests
    # =========================================================================

    def test_save_and_load_state(
        self, temp_dirs: dict, orchestrator: AutoPRReviewOrchestrator
    ) -> None:
        """Test saving and loading state."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature-branch",
            status=PRReviewStatus.AWAITING_CHECKS,
            current_iteration=2,
        )

        orchestrator._save_state(state)
        loaded = orchestrator._load_state(123)

        assert loaded is not None
        assert loaded.pr_number == 123
        assert loaded.repo == "owner/repo"
        assert loaded.status == PRReviewStatus.AWAITING_CHECKS
        assert loaded.current_iteration == 2

    def test_load_nonexistent_state(
        self, orchestrator: AutoPRReviewOrchestrator
    ) -> None:
        """Test loading state that doesn't exist."""
        loaded = orchestrator._load_state(999)
        assert loaded is None


class TestExpectedBots:
    """Tests for expected bots configuration."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    # =========================================================================
    # Expected Bots Configuration Tests
    # =========================================================================

    def test_load_expected_bots_empty(self, temp_dirs: dict) -> None:
        """Test loading bots when env var is not set."""
        with patch.dict(os.environ, {}, clear=True):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )
            assert orchestrator._expected_bots == []

    def test_load_expected_bots_single(self, temp_dirs: dict) -> None:
        """Test loading single bot from env var."""
        with patch.dict(os.environ, {"GITHUB_EXPECTED_BOTS": "coderabbitai[bot]"}):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )
            assert orchestrator._expected_bots == ["coderabbitai[bot]"]

    def test_load_expected_bots_multiple(self, temp_dirs: dict) -> None:
        """Test loading multiple bots from env var."""
        with patch.dict(
            os.environ,
            {"GITHUB_EXPECTED_BOTS": "coderabbitai[bot],dependabot[bot],codecov[bot]"},
        ):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )
            assert orchestrator._expected_bots == [
                "coderabbitai[bot]",
                "dependabot[bot]",
                "codecov[bot]",
            ]


class TestModuleFunctions:
    """Tests for module-level convenience functions."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    @pytest.fixture(autouse=True)
    def reset_singleton(self) -> None:
        """Reset module state before each test."""
        reset_auto_pr_review_orchestrator()
        yield
        reset_auto_pr_review_orchestrator()

    # =========================================================================
    # Module Function Tests
    # =========================================================================

    def test_get_orchestrator_singleton(self, temp_dirs: dict) -> None:
        """Test that get_auto_pr_review_orchestrator returns same instance."""
        o1 = get_auto_pr_review_orchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )
        o2 = get_auto_pr_review_orchestrator()
        assert o1 is o2

    def test_get_orchestrator_requires_dirs_first_time(self) -> None:
        """Test get_auto_pr_review_orchestrator requires dirs on first call."""
        with pytest.raises(ValueError) as exc_info:
            get_auto_pr_review_orchestrator()
        assert "required for first initialization" in str(exc_info.value)

    def test_reset_orchestrator(self, temp_dirs: dict) -> None:
        """Test reset_auto_pr_review_orchestrator clears singleton."""
        o1 = get_auto_pr_review_orchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )
        reset_auto_pr_review_orchestrator()
        o2 = get_auto_pr_review_orchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )
        assert o1 is not o2


class TestRunAuthorization:
    """Tests for authorization during run method."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    # =========================================================================
    # Run Method Authorization Tests
    # =========================================================================

    @pytest.mark.asyncio
    async def test_run_unauthorized_user(self, temp_dirs: dict) -> None:
        """Test run returns UNAUTHORIZED for unauthorized users."""
        with patch.dict(os.environ, {}, clear=True):
            orchestrator = AutoPRReviewOrchestrator(
                github_dir=temp_dirs["github"],
                project_dir=temp_dirs["project"],
                spec_dir=temp_dirs["spec"],
                log_enabled=False,
            )

            result = await orchestrator.run(
                pr_number=123,
                repo="owner/repo",
                pr_url="https://github.com/owner/repo/pull/123",
                branch_name="feature",
                triggered_by="unauthorized_user",
            )

            assert result.result == OrchestratorResult.UNAUTHORIZED
            assert "unauthorized_user" in result.error_message


class TestConcurrentReviewSemaphore:
    """Tests for concurrent review limiting."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    # =========================================================================
    # Semaphore Tests
    # =========================================================================

    def test_semaphore_initialization(self, temp_dirs: dict) -> None:
        """Test semaphore is initialized with correct limit."""
        orchestrator = AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            max_concurrent_reviews=2,
            log_enabled=False,
        )
        # Semaphore internal value should match max_concurrent_reviews
        assert orchestrator._semaphore._value == 2


class TestActiveReviewsTracking:
    """Tests for active reviews tracking."""

    @pytest.fixture
    def temp_dirs(self):
        """Create temporary directories for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            github_dir = Path(tmpdir) / ".auto-claude" / "github"
            project_dir = Path(tmpdir)
            spec_dir = Path(tmpdir) / ".auto-claude" / "specs" / "001"
            github_dir.mkdir(parents=True)
            spec_dir.mkdir(parents=True)
            yield {"github": github_dir, "project": project_dir, "spec": spec_dir}

    @pytest.fixture
    def orchestrator(self, temp_dirs: dict) -> AutoPRReviewOrchestrator:
        """Create an orchestrator for testing."""
        return AutoPRReviewOrchestrator(
            github_dir=temp_dirs["github"],
            project_dir=temp_dirs["project"],
            spec_dir=temp_dirs["spec"],
            log_enabled=False,
        )

    # =========================================================================
    # Active Reviews Tests
    # =========================================================================

    def test_get_active_reviews_empty(
        self, orchestrator: AutoPRReviewOrchestrator
    ) -> None:
        """Test get_active_reviews returns empty dict initially."""
        reviews = orchestrator.get_active_reviews()
        assert reviews == {}

    def test_get_queue_size_empty(
        self, orchestrator: AutoPRReviewOrchestrator
    ) -> None:
        """Test get_queue_size returns 0 initially."""
        size = orchestrator.get_queue_size()
        assert size == 0


class TestIterationHistory:
    """Tests for iteration history tracking."""

    # =========================================================================
    # Iteration History Tests
    # =========================================================================

    def test_complete_iteration_updates_record(self) -> None:
        """Test complete_iteration updates the current record."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
        )

        state.start_iteration()
        state.complete_iteration(
            findings_count=3,
            fixes_applied=2,
            ci_status="passed",
            status="completed",
            notes="All fixes applied",
        )

        assert len(state.iteration_history) == 1
        record = state.iteration_history[0]
        assert record.findings_count == 3
        assert record.fixes_applied == 2
        assert record.ci_status == "passed"
        assert record.status == "completed"
        assert record.notes == "All fixes applied"
        assert record.completed_at is not None

    def test_multiple_iterations(self) -> None:
        """Test tracking multiple iterations."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
        )

        # First iteration
        state.start_iteration()
        state.complete_iteration(findings_count=5, fixes_applied=3)

        # Second iteration
        state.start_iteration()
        state.complete_iteration(findings_count=2, fixes_applied=1)

        assert len(state.iteration_history) == 2
        assert state.iteration_history[0].iteration_number == 1
        assert state.iteration_history[1].iteration_number == 2
        assert state.current_iteration == 2


class TestErrorTracking:
    """Tests for error tracking in state."""

    # =========================================================================
    # Error Tracking Tests
    # =========================================================================

    def test_record_error(self) -> None:
        """Test record_error increments counters."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
        )

        assert state.error_count == 0
        assert state.consecutive_failures == 0

        state.record_error("First error")
        assert state.error_count == 1
        assert state.consecutive_failures == 1
        assert state.last_error == "First error"

        state.record_error("Second error")
        assert state.error_count == 2
        assert state.consecutive_failures == 2
        assert state.last_error == "Second error"

    def test_clear_consecutive_failures(self) -> None:
        """Test clear_consecutive_failures resets counter."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
        )

        state.record_error("Error 1")
        state.record_error("Error 2")
        assert state.consecutive_failures == 2

        state.clear_consecutive_failures()
        assert state.consecutive_failures == 0
        # Error count should remain
        assert state.error_count == 2


class TestCancellationRequest:
    """Tests for cancellation request tracking."""

    # =========================================================================
    # Cancellation Request Tests
    # =========================================================================

    def test_request_cancellation(self) -> None:
        """Test request_cancellation sets flags."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
        )

        assert state.cancellation_requested is False
        assert state.cancelled_by is None

        state.request_cancellation("testuser")

        assert state.cancellation_requested is True
        assert state.cancelled_by == "testuser"
        assert state.cancelled_at is not None

    def test_cancellation_stops_iteration(self) -> None:
        """Test should_continue returns False after cancellation."""
        state = PRReviewOrchestratorState(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature",
        )

        assert state.should_continue() is True

        state.request_cancellation()

        assert state.should_continue() is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
