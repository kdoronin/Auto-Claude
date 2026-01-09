"""
Unit Tests for PRCheckWaiter
============================

Tests for the PRCheckWaiter class covering:
- Timeout configuration and enforcement
- Exponential backoff with configurable delays
- Circuit breaker pattern (manual fallback)
- Cancellation support
- PR state changes (closed/merged/force push)
- Statistics tracking

Run with: pytest tests/test_pr_check_waiter.py -v
"""

import asyncio
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Add the backend directory to the path for imports
backend_path = Path(__file__).parent.parent / "apps" / "backend"
sys.path.insert(0, str(backend_path))

import pytest

from runners.github.services.pr_check_waiter import (
    CheckFailure,
    CircuitBreakerOpenError,
    ForcePushError,
    PRCheckWaiter,
    PRClosedError,
    WaitForChecksResult,
    WaitResult,
    get_pr_check_waiter,
    reset_pr_check_waiter,
)
from runners.github.models_pkg.pr_review_state import (
    CheckStatus,
    CICheckResult,
    ExternalBotStatus,
)


class TestPRCheckWaiterInitialization:
    """Tests for PRCheckWaiter initialization and configuration."""

    @pytest.fixture
    def waiter(self) -> PRCheckWaiter:
        """Create a fresh PRCheckWaiter instance for each test."""
        return PRCheckWaiter(log_enabled=False)

    # =========================================================================
    # Initialization Tests
    # =========================================================================

    def test_default_initialization(self, waiter: PRCheckWaiter) -> None:
        """Test default configuration values."""
        assert waiter.ci_timeout == 1800.0  # 30 minutes
        assert waiter.bot_timeout == 900.0  # 15 minutes
        assert waiter.poll_interval == 60.0  # 60 seconds
        assert waiter.base_backoff_delay == 60.0  # 60 seconds
        assert waiter.max_backoff_delay == 300.0  # 5 minutes
        assert waiter.log_enabled is False

    def test_custom_initialization(self) -> None:
        """Test custom configuration values."""
        waiter = PRCheckWaiter(
            ci_timeout=600.0,
            bot_timeout=300.0,
            poll_interval=30.0,
            base_backoff_delay=10.0,
            max_backoff_delay=60.0,
            circuit_breaker_fail_max=5,
            circuit_breaker_reset_timeout=120,
            log_enabled=False,
            correlation_id="test-123",
        )
        assert waiter.ci_timeout == 600.0
        assert waiter.bot_timeout == 300.0
        assert waiter.poll_interval == 30.0
        assert waiter.base_backoff_delay == 10.0
        assert waiter.max_backoff_delay == 60.0
        assert waiter.correlation_id == "test-123"

    def test_initial_state(self, waiter: PRCheckWaiter) -> None:
        """Test initial state values."""
        assert waiter._cancelled is False
        assert waiter._poll_count == 0
        assert waiter._error_count == 0
        assert waiter._consecutive_failures == 0
        assert waiter._circuit_open_time is None


class TestExponentialBackoff:
    """Tests for exponential backoff calculation."""

    @pytest.fixture
    def waiter(self) -> PRCheckWaiter:
        """Create a fresh PRCheckWaiter instance."""
        return PRCheckWaiter(
            base_backoff_delay=10.0,
            max_backoff_delay=100.0,
            log_enabled=False,
        )

    # =========================================================================
    # Backoff Calculation Tests
    # =========================================================================

    def test_backoff_delay_attempt_0(self, waiter: PRCheckWaiter) -> None:
        """Test backoff delay for first attempt."""
        delay = waiter._calculate_backoff_delay(0)
        assert delay == 10.0  # base_delay * (2^0) = 10 * 1 = 10

    def test_backoff_delay_attempt_1(self, waiter: PRCheckWaiter) -> None:
        """Test backoff delay for second attempt."""
        delay = waiter._calculate_backoff_delay(1)
        assert delay == 20.0  # base_delay * (2^1) = 10 * 2 = 20

    def test_backoff_delay_attempt_2(self, waiter: PRCheckWaiter) -> None:
        """Test backoff delay for third attempt."""
        delay = waiter._calculate_backoff_delay(2)
        assert delay == 40.0  # base_delay * (2^2) = 10 * 4 = 40

    def test_backoff_delay_attempt_3(self, waiter: PRCheckWaiter) -> None:
        """Test backoff delay for fourth attempt."""
        delay = waiter._calculate_backoff_delay(3)
        assert delay == 80.0  # base_delay * (2^3) = 10 * 8 = 80

    def test_backoff_delay_capped_at_max(self, waiter: PRCheckWaiter) -> None:
        """Test that backoff delay is capped at max."""
        delay = waiter._calculate_backoff_delay(4)
        assert delay == 100.0  # base_delay * (2^4) = 160, capped to max 100

    def test_backoff_delay_high_attempt(self, waiter: PRCheckWaiter) -> None:
        """Test backoff delay for high attempt numbers."""
        delay = waiter._calculate_backoff_delay(10)
        assert delay == 100.0  # Always capped at max

    def test_backoff_with_default_values(self) -> None:
        """Test backoff with default configuration."""
        waiter = PRCheckWaiter(log_enabled=False)
        # Default: base=60, max=300
        assert waiter._calculate_backoff_delay(0) == 60.0
        assert waiter._calculate_backoff_delay(1) == 120.0
        assert waiter._calculate_backoff_delay(2) == 240.0
        assert waiter._calculate_backoff_delay(3) == 300.0  # Capped


class TestCircuitBreaker:
    """Tests for circuit breaker functionality (manual fallback)."""

    @pytest.fixture
    def waiter(self) -> PRCheckWaiter:
        """Create a fresh PRCheckWaiter instance with short reset timeout."""
        return PRCheckWaiter(
            circuit_breaker_fail_max=3,
            circuit_breaker_reset_timeout=1,  # 1 second for testing
            log_enabled=False,
        )

    # =========================================================================
    # Circuit Breaker State Tests
    # =========================================================================

    def test_circuit_breaker_initial_state(self, waiter: PRCheckWaiter) -> None:
        """Test circuit breaker starts in closed state."""
        # Should not raise when circuit is closed
        waiter._check_circuit_breaker()
        assert waiter._manual_fail_count == 0
        assert waiter._manual_open_since is None

    def test_circuit_breaker_records_failures(self, waiter: PRCheckWaiter) -> None:
        """Test that failures are recorded."""
        waiter._record_failure()
        assert waiter._error_count == 1
        assert waiter._consecutive_failures == 1
        assert waiter._manual_fail_count == 1

    def test_circuit_breaker_opens_after_max_failures(
        self, waiter: PRCheckWaiter
    ) -> None:
        """Test circuit opens after configured failures."""
        for _ in range(3):  # fail_max = 3
            waiter._record_failure()

        assert waiter._manual_fail_count == 3
        assert waiter._manual_open_since is not None

        # Should raise when circuit is open
        with pytest.raises(CircuitBreakerOpenError):
            waiter._check_circuit_breaker()

    def test_circuit_breaker_error_message(self, waiter: PRCheckWaiter) -> None:
        """Test circuit breaker error contains useful info."""
        for _ in range(3):
            waiter._record_failure()

        with pytest.raises(CircuitBreakerOpenError) as exc_info:
            waiter._check_circuit_breaker()

        assert "Circuit breaker open" in str(exc_info.value)
        assert "reset after" in str(exc_info.value)

    def test_circuit_breaker_resets_after_timeout(
        self, waiter: PRCheckWaiter
    ) -> None:
        """Test circuit resets after reset timeout."""
        # Open the circuit
        for _ in range(3):
            waiter._record_failure()

        # Verify circuit is open
        with pytest.raises(CircuitBreakerOpenError):
            waiter._check_circuit_breaker()

        # Wait for reset timeout (1 second)
        time.sleep(1.1)

        # Should not raise after reset
        waiter._check_circuit_breaker()
        assert waiter._manual_fail_count == 0
        assert waiter._manual_open_since is None

    def test_circuit_breaker_success_decrements_failures(
        self, waiter: PRCheckWaiter
    ) -> None:
        """Test that success decrements failure count."""
        waiter._record_failure()
        waiter._record_failure()
        assert waiter._manual_fail_count == 2

        waiter._record_success()
        assert waiter._manual_fail_count == 1
        assert waiter._consecutive_failures == 0

    def test_circuit_breaker_success_clears_consecutive_failures(
        self, waiter: PRCheckWaiter
    ) -> None:
        """Test that success clears consecutive failures."""
        waiter._record_failure()
        waiter._record_failure()
        assert waiter._consecutive_failures == 2

        waiter._record_success()
        assert waiter._consecutive_failures == 0

    def test_circuit_breaker_does_not_go_negative(
        self, waiter: PRCheckWaiter
    ) -> None:
        """Test that failure count doesn't go below zero."""
        waiter._record_success()
        assert waiter._manual_fail_count == 0


class TestCancellation:
    """Tests for cancellation functionality."""

    @pytest.fixture
    def waiter(self) -> PRCheckWaiter:
        """Create a fresh PRCheckWaiter instance."""
        return PRCheckWaiter(log_enabled=False)

    # =========================================================================
    # Cancellation Tests
    # =========================================================================

    def test_initial_not_cancelled(self, waiter: PRCheckWaiter) -> None:
        """Test waiter starts in non-cancelled state."""
        assert waiter._cancelled is False
        assert not waiter._cancel_event.is_set()

    def test_cancel_sets_flag(self, waiter: PRCheckWaiter) -> None:
        """Test cancel() sets cancellation flag."""
        waiter.cancel()
        assert waiter._cancelled is True
        assert waiter._cancel_event.is_set()

    def test_reset_clears_cancellation(self, waiter: PRCheckWaiter) -> None:
        """Test reset() clears cancellation state."""
        waiter.cancel()
        waiter.reset()
        assert waiter._cancelled is False
        assert not waiter._cancel_event.is_set()

    def test_reset_clears_all_state(self, waiter: PRCheckWaiter) -> None:
        """Test reset() clears all state."""
        # Modify state
        waiter._poll_count = 10
        waiter._error_count = 5
        waiter._consecutive_failures = 3
        waiter._circuit_open_time = time.monotonic()
        waiter._manual_fail_count = 2
        waiter.cancel()

        # Reset
        waiter.reset()

        # Verify all cleared
        assert waiter._cancelled is False
        assert waiter._poll_count == 0
        assert waiter._error_count == 0
        assert waiter._consecutive_failures == 0
        assert waiter._circuit_open_time is None
        assert waiter._manual_fail_count == 0


class TestPRStateExceptions:
    """Tests for PR state exception classes."""

    def test_pr_closed_error(self) -> None:
        """Test PRClosedError exception."""
        error = PRClosedError("closed")
        assert error.pr_state == "closed"
        assert "closed" in str(error)

    def test_pr_closed_error_merged(self) -> None:
        """Test PRClosedError for merged PR."""
        error = PRClosedError("merged")
        assert error.pr_state == "merged"
        assert "merged" in str(error)

    def test_force_push_error(self) -> None:
        """Test ForcePushError exception."""
        error = ForcePushError("abc123", "def456")
        assert error.old_sha == "abc123"
        assert error.new_sha == "def456"
        assert "abc123" in str(error)
        assert "def456" in str(error)

    def test_circuit_breaker_open_error(self) -> None:
        """Test CircuitBreakerOpenError exception."""
        error = CircuitBreakerOpenError("Circuit is open", open_since=123.0)
        assert error.open_since == 123.0
        assert "Circuit is open" in str(error)


class TestWaitForChecksResult:
    """Tests for WaitForChecksResult dataclass."""

    def test_result_creation(self) -> None:
        """Test creating a WaitForChecksResult."""
        result = WaitForChecksResult(
            result=WaitResult.SUCCESS,
            all_passed=True,
            elapsed_seconds=120.5,
            poll_count=5,
        )
        assert result.result == WaitResult.SUCCESS
        assert result.all_passed is True
        assert result.elapsed_seconds == 120.5
        assert result.poll_count == 5

    def test_result_with_failures(self) -> None:
        """Test result with failures."""
        failures = [
            CheckFailure(
                name="test-check",
                check_type="ci",
                reason="Build failed",
                status=CheckStatus.FAILED,
            )
        ]
        result = WaitForChecksResult(
            result=WaitResult.CI_FAILED,
            all_passed=False,
            failures=failures,
        )
        assert result.result == WaitResult.CI_FAILED
        assert not result.all_passed
        assert len(result.failures) == 1
        assert result.failures[0].name == "test-check"

    def test_result_to_dict(self) -> None:
        """Test serialization to dictionary."""
        ci_checks = [
            CICheckResult(
                name="build",
                status=CheckStatus.PASSED,
                conclusion="success",
            )
        ]
        bot_statuses = [
            ExternalBotStatus(
                bot_name="coderabbitai[bot]",
                status=CheckStatus.PASSED,
            )
        ]
        result = WaitForChecksResult(
            result=WaitResult.SUCCESS,
            all_passed=True,
            ci_checks=ci_checks,
            bot_statuses=bot_statuses,
            elapsed_seconds=60.0,
            poll_count=3,
            final_head_sha="abc123",
            pr_state="open",
        )
        d = result.to_dict()

        assert d["result"] == "success"
        assert d["all_passed"] is True
        assert len(d["ci_checks"]) == 1
        assert d["ci_checks"][0]["name"] == "build"
        assert len(d["bot_statuses"]) == 1
        assert d["bot_statuses"][0]["bot_name"] == "coderabbitai[bot]"


class TestCheckFailure:
    """Tests for CheckFailure dataclass."""

    def test_check_failure_creation(self) -> None:
        """Test creating a CheckFailure."""
        failure = CheckFailure(
            name="lint",
            check_type="ci",
            reason="Linting errors found",
            status=CheckStatus.FAILED,
            url="https://github.com/check/123",
        )
        assert failure.name == "lint"
        assert failure.check_type == "ci"
        assert failure.reason == "Linting errors found"
        assert failure.status == CheckStatus.FAILED
        assert failure.url == "https://github.com/check/123"
        assert failure.timestamp is not None


class TestWaitResult:
    """Tests for WaitResult enum."""

    def test_wait_result_values(self) -> None:
        """Test WaitResult enum values."""
        assert WaitResult.SUCCESS.value == "success"
        assert WaitResult.CI_FAILED.value == "ci_failed"
        assert WaitResult.CI_TIMEOUT.value == "ci_timeout"
        assert WaitResult.BOT_TIMEOUT.value == "bot_timeout"
        assert WaitResult.PR_CLOSED.value == "pr_closed"
        assert WaitResult.PR_MERGED.value == "pr_merged"
        assert WaitResult.FORCE_PUSH.value == "force_push"
        assert WaitResult.CANCELLED.value == "cancelled"
        assert WaitResult.CIRCUIT_OPEN.value == "circuit_open"
        assert WaitResult.ERROR.value == "error"


class TestCICheckHelpers:
    """Tests for CI check helper methods."""

    @pytest.fixture
    def waiter(self) -> PRCheckWaiter:
        """Create a fresh PRCheckWaiter instance."""
        return PRCheckWaiter(log_enabled=False)

    def test_all_ci_passed_empty(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_passed with no checks."""
        assert waiter._all_ci_passed([]) is True

    def test_all_ci_passed_all_passed(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_passed when all checks pass."""
        checks = [
            CICheckResult(name="build", status=CheckStatus.PASSED),
            CICheckResult(name="test", status=CheckStatus.PASSED),
        ]
        assert waiter._all_ci_passed(checks) is True

    def test_all_ci_passed_with_failure(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_passed when a check fails."""
        checks = [
            CICheckResult(name="build", status=CheckStatus.PASSED),
            CICheckResult(name="test", status=CheckStatus.FAILED),
        ]
        assert waiter._all_ci_passed(checks) is False

    def test_all_ci_passed_with_pending(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_passed when a check is pending."""
        checks = [
            CICheckResult(name="build", status=CheckStatus.PASSED),
            CICheckResult(name="test", status=CheckStatus.PENDING),
        ]
        assert waiter._all_ci_passed(checks) is False

    def test_all_ci_passed_with_running(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_passed when a check is running."""
        checks = [
            CICheckResult(name="build", status=CheckStatus.RUNNING),
        ]
        assert waiter._all_ci_passed(checks) is False

    def test_all_ci_passed_with_skipped(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_passed with skipped checks."""
        checks = [
            CICheckResult(name="build", status=CheckStatus.PASSED),
            CICheckResult(name="optional", status=CheckStatus.SKIPPED),
        ]
        assert waiter._all_ci_passed(checks) is True

    def test_all_ci_completed_empty(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_completed with no checks."""
        assert waiter._all_ci_completed([]) is True

    def test_all_ci_completed_all_done(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_completed when all checks are done."""
        checks = [
            CICheckResult(name="build", status=CheckStatus.PASSED),
            CICheckResult(name="test", status=CheckStatus.FAILED),
        ]
        assert waiter._all_ci_completed(checks) is True

    def test_all_ci_completed_with_pending(self, waiter: PRCheckWaiter) -> None:
        """Test all_ci_completed when a check is pending."""
        checks = [
            CICheckResult(name="build", status=CheckStatus.PASSED),
            CICheckResult(name="test", status=CheckStatus.PENDING),
        ]
        assert waiter._all_ci_completed(checks) is False


class TestBotStatusHelpers:
    """Tests for bot status helper methods."""

    @pytest.fixture
    def waiter(self) -> PRCheckWaiter:
        """Create a fresh PRCheckWaiter instance."""
        return PRCheckWaiter(log_enabled=False)

    def test_all_bots_responded_empty(self, waiter: PRCheckWaiter) -> None:
        """Test all_bots_responded with no bots."""
        assert waiter._all_bots_responded([]) is True

    def test_all_bots_responded_all_done(self, waiter: PRCheckWaiter) -> None:
        """Test all_bots_responded when all bots responded."""
        statuses = [
            ExternalBotStatus(bot_name="bot1", status=CheckStatus.PASSED),
            ExternalBotStatus(bot_name="bot2", status=CheckStatus.PASSED),
        ]
        assert waiter._all_bots_responded(statuses) is True

    def test_all_bots_responded_with_pending(self, waiter: PRCheckWaiter) -> None:
        """Test all_bots_responded when a bot is pending."""
        statuses = [
            ExternalBotStatus(bot_name="bot1", status=CheckStatus.PASSED),
            ExternalBotStatus(bot_name="bot2", status=CheckStatus.PENDING),
        ]
        assert waiter._all_bots_responded(statuses) is False


class TestStatistics:
    """Tests for statistics tracking."""

    @pytest.fixture
    def waiter(self) -> PRCheckWaiter:
        """Create a fresh PRCheckWaiter instance."""
        return PRCheckWaiter(log_enabled=False)

    def test_get_statistics_initial(self, waiter: PRCheckWaiter) -> None:
        """Test initial statistics."""
        stats = waiter.get_statistics()
        assert stats["poll_count"] == 0
        assert stats["error_count"] == 0
        assert stats["consecutive_failures"] == 0
        assert stats["circuit_open"] is False
        assert stats["cancelled"] is False

    def test_get_statistics_after_failures(self, waiter: PRCheckWaiter) -> None:
        """Test statistics after recording failures."""
        waiter._record_failure()
        waiter._record_failure()

        stats = waiter.get_statistics()
        assert stats["error_count"] == 2
        assert stats["consecutive_failures"] == 2

    def test_get_statistics_after_cancel(self, waiter: PRCheckWaiter) -> None:
        """Test statistics after cancellation."""
        waiter.cancel()

        stats = waiter.get_statistics()
        assert stats["cancelled"] is True


class TestEnvironmentConfiguration:
    """Tests for environment-based configuration."""

    def test_load_expected_bots_empty(self) -> None:
        """Test loading bots when env var is not set."""
        with patch.dict("os.environ", {}, clear=True):
            waiter = PRCheckWaiter(log_enabled=False)
            assert waiter._default_expected_bots == []

    def test_load_expected_bots_single(self) -> None:
        """Test loading single bot from env var."""
        with patch.dict("os.environ", {"GITHUB_EXPECTED_BOTS": "coderabbitai[bot]"}):
            waiter = PRCheckWaiter(log_enabled=False)
            assert waiter._default_expected_bots == ["coderabbitai[bot]"]

    def test_load_expected_bots_multiple(self) -> None:
        """Test loading multiple bots from env var."""
        with patch.dict(
            "os.environ",
            {"GITHUB_EXPECTED_BOTS": "coderabbitai[bot],dependabot[bot],codecov[bot]"},
        ):
            waiter = PRCheckWaiter(log_enabled=False)
            assert waiter._default_expected_bots == [
                "coderabbitai[bot]",
                "dependabot[bot]",
                "codecov[bot]",
            ]

    def test_load_expected_bots_with_whitespace(self) -> None:
        """Test loading bots with whitespace in env var."""
        with patch.dict(
            "os.environ",
            {"GITHUB_EXPECTED_BOTS": " bot1 , bot2 , bot3 "},
        ):
            waiter = PRCheckWaiter(log_enabled=False)
            assert waiter._default_expected_bots == ["bot1", "bot2", "bot3"]


class TestModuleFunctions:
    """Tests for module-level convenience functions."""

    @pytest.fixture(autouse=True)
    def setup(self) -> None:
        """Reset module state before each test."""
        reset_pr_check_waiter()
        yield
        reset_pr_check_waiter()

    def test_get_pr_check_waiter_singleton(self) -> None:
        """Test that get_pr_check_waiter returns same instance."""
        w1 = get_pr_check_waiter()
        w2 = get_pr_check_waiter()
        assert w1 is w2

    def test_get_pr_check_waiter_with_correlation_id(self) -> None:
        """Test get_pr_check_waiter with correlation ID."""
        w = get_pr_check_waiter(correlation_id="test-123")
        assert w.correlation_id == "test-123"

    def test_get_pr_check_waiter_updates_correlation_id(self) -> None:
        """Test that subsequent calls update correlation ID."""
        w1 = get_pr_check_waiter(correlation_id="first")
        w2 = get_pr_check_waiter(correlation_id="second")
        assert w1 is w2
        assert w2.correlation_id == "second"

    def test_reset_pr_check_waiter(self) -> None:
        """Test reset_pr_check_waiter clears singleton."""
        w1 = get_pr_check_waiter()
        reset_pr_check_waiter()
        w2 = get_pr_check_waiter()
        assert w1 is not w2


class TestTimeoutBehavior:
    """Tests for timeout behavior in wait_for_all_checks."""

    @pytest.fixture
    def waiter(self) -> PRCheckWaiter:
        """Create a waiter with short timeouts for testing."""
        return PRCheckWaiter(
            ci_timeout=0.1,  # 100ms for testing
            bot_timeout=0.1,
            poll_interval=0.05,
            base_backoff_delay=0.01,
            max_backoff_delay=0.02,
            log_enabled=False,
        )

    @pytest.mark.asyncio
    async def test_ci_timeout_returns_ci_timeout_result(
        self, waiter: PRCheckWaiter
    ) -> None:
        """Test that CI timeout returns appropriate result."""
        # Mock _fetch_ci_checks to return pending checks
        async def mock_fetch_ci_checks(pr_number, repo):
            return (
                [CICheckResult(name="build", status=CheckStatus.PENDING)],
                "sha123",
                "open",
            )

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            result = await waiter.wait_for_all_checks(
                pr_number=123,
                repo="owner/repo",
                expected_bots=[],
                ci_timeout=0.05,  # Very short timeout
            )

        assert result.result == WaitResult.CI_TIMEOUT
        assert result.all_passed is False
        assert len(result.failures) == 1
        assert result.failures[0].check_type == "ci"

    @pytest.mark.asyncio
    async def test_cancellation_during_wait(self, waiter: PRCheckWaiter) -> None:
        """Test cancellation during wait."""
        # Create a task that will cancel the waiter after a short delay
        async def cancel_after_delay():
            await asyncio.sleep(0.05)
            waiter.cancel()

        # Mock _fetch_ci_checks to return pending checks
        async def mock_fetch_ci_checks(pr_number, repo):
            return (
                [CICheckResult(name="build", status=CheckStatus.PENDING)],
                "sha123",
                "open",
            )

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            # Start cancellation in background
            cancel_task = asyncio.create_task(cancel_after_delay())

            result = await waiter.wait_for_all_checks(
                pr_number=123,
                repo="owner/repo",
                expected_bots=[],
                ci_timeout=10.0,  # Long timeout
            )

            await cancel_task

        assert result.result == WaitResult.CANCELLED

    @pytest.mark.asyncio
    async def test_pr_closed_during_wait(self, waiter: PRCheckWaiter) -> None:
        """Test PR closed during wait."""

        async def mock_fetch_ci_checks(pr_number, repo):
            return (
                [CICheckResult(name="build", status=CheckStatus.PASSED)],
                "sha123",
                "closed",  # PR was closed
            )

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            result = await waiter.wait_for_all_checks(
                pr_number=123,
                repo="owner/repo",
                expected_bots=[],
            )

        assert result.result == WaitResult.PR_CLOSED
        assert result.pr_state == "closed"

    @pytest.mark.asyncio
    async def test_pr_merged_during_wait(self, waiter: PRCheckWaiter) -> None:
        """Test PR merged during wait."""

        async def mock_fetch_ci_checks(pr_number, repo):
            return (
                [CICheckResult(name="build", status=CheckStatus.PASSED)],
                "sha123",
                "merged",  # PR was merged
            )

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            result = await waiter.wait_for_all_checks(
                pr_number=123,
                repo="owner/repo",
                expected_bots=[],
            )

        assert result.result == WaitResult.PR_MERGED

    @pytest.mark.asyncio
    async def test_force_push_detected(self, waiter: PRCheckWaiter) -> None:
        """Test force push detection during wait."""

        async def mock_fetch_ci_checks(pr_number, repo):
            return (
                [CICheckResult(name="build", status=CheckStatus.PASSED)],
                "new_sha",  # Different from initial
                "open",
            )

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            result = await waiter.wait_for_all_checks(
                pr_number=123,
                repo="owner/repo",
                expected_bots=[],
                head_sha="old_sha",  # Initial SHA
            )

        assert result.result == WaitResult.FORCE_PUSH
        assert "old_sha" in result.error_message
        assert "new_sha" in result.error_message

    @pytest.mark.asyncio
    async def test_circuit_breaker_opens_during_wait(
        self, waiter: PRCheckWaiter
    ) -> None:
        """Test circuit breaker opens during wait."""
        call_count = 0

        async def mock_fetch_ci_checks(pr_number, repo):
            nonlocal call_count
            call_count += 1
            raise RuntimeError("API error")

        # Configure waiter with short circuit breaker settings
        waiter._manual_fail_max = 2  # Open after 2 failures

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            result = await waiter.wait_for_all_checks(
                pr_number=123,
                repo="owner/repo",
                expected_bots=[],
            )

        assert result.result == WaitResult.CIRCUIT_OPEN

    @pytest.mark.asyncio
    async def test_success_all_checks_pass(self, waiter: PRCheckWaiter) -> None:
        """Test successful completion when all checks pass."""

        async def mock_fetch_ci_checks(pr_number, repo):
            return (
                [CICheckResult(name="build", status=CheckStatus.PASSED)],
                "sha123",
                "open",
            )

        async def mock_fetch_bot_comments(pr_number, repo, bots):
            return [
                ExternalBotStatus(bot_name="bot1", status=CheckStatus.PASSED)
            ]

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            with patch.object(waiter, "_fetch_bot_comments", mock_fetch_bot_comments):
                result = await waiter.wait_for_all_checks(
                    pr_number=123,
                    repo="owner/repo",
                    expected_bots=["bot1"],
                )

        assert result.result == WaitResult.SUCCESS
        assert result.all_passed is True

    @pytest.mark.asyncio
    async def test_ci_failed_result(self, waiter: PRCheckWaiter) -> None:
        """Test CI failed result when checks fail."""

        async def mock_fetch_ci_checks(pr_number, repo):
            return (
                [
                    CICheckResult(
                        name="build",
                        status=CheckStatus.FAILED,
                        conclusion="failure",
                    )
                ],
                "sha123",
                "open",
            )

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            result = await waiter.wait_for_all_checks(
                pr_number=123,
                repo="owner/repo",
                expected_bots=[],
            )

        assert result.result == WaitResult.CI_FAILED
        assert result.all_passed is False
        assert len(result.failures) == 1
        assert result.failures[0].name == "build"

    @pytest.mark.asyncio
    async def test_progress_callback(self, waiter: PRCheckWaiter) -> None:
        """Test progress callback is called."""
        progress_calls = []

        def on_progress(poll_count, ci_checks, bot_statuses):
            progress_calls.append((poll_count, len(ci_checks), len(bot_statuses)))

        async def mock_fetch_ci_checks(pr_number, repo):
            return (
                [CICheckResult(name="build", status=CheckStatus.PASSED)],
                "sha123",
                "open",
            )

        with patch.object(waiter, "_fetch_ci_checks", mock_fetch_ci_checks):
            await waiter.wait_for_all_checks(
                pr_number=123,
                repo="owner/repo",
                expected_bots=[],
                on_progress=on_progress,
            )

        assert len(progress_calls) >= 1
        assert progress_calls[0][1] == 1  # 1 CI check


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
