---
phase: 03-cross-validation
plan: 01
subsystem: api
tags: [pr-review, confidence-routing, findings-validation]

# Dependency graph
requires:
  - phase: 02-context-enrichment
    provides: Extended import detection and related file discovery
provides:
  - Confidence threshold routing for PR review findings
  - PRReviewFinding model with confidence, source_agents, cross_validated fields
  - ConfidenceTier class with HIGH/MEDIUM/LOW constants
  - Confidence routing integration in review pipeline
affects: [03-cross-validation-02, 04-integration-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Confidence tier routing (HIGH >= 0.8, MEDIUM 0.5-0.8, LOW < 0.5)"
    - "[Potential] prefix for medium-confidence findings"
    - "Low-confidence findings logged but excluded from output"

key-files:
  created: []
  modified:
    - apps/backend/runners/github/models.py
    - apps/backend/runners/github/services/parallel_orchestrator_reviewer.py
    - apps/backend/runners/github/output_validator.py
    - apps/backend/prompts/github/pr_parallel_orchestrator.md

key-decisions:
  - "Default confidence is 0.5 (medium confidence)"
  - "Low-confidence findings (<0.5) are logged but excluded from output"
  - "Medium-confidence findings get [Potential] prefix in title"
  - "output_validator treats confidence=0.5 as 'not explicitly set' for backwards compatibility"

patterns-established:
  - "Pattern 1: Confidence tier class with constants and static get_tier() method"
  - "Pattern 2: Confidence routing after evidence/scope validation, before verdict"
  - "Pattern 3: _normalize_confidence() used to ensure 0.0-1.0 range"

# Metrics
duration: 8min
completed: 2026-01-19
---

# Phase 3 Plan 1: Confidence Threshold Routing Summary

**Confidence routing for PR findings: HIGH (>=0.8) included as-is, MEDIUM (0.5-0.8) prefixed with [Potential], LOW (<0.5) logged and excluded**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-19T22:09:00Z
- **Completed:** 2026-01-19T22:17:14Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- PRReviewFinding model extended with confidence, source_agents, and cross_validated fields
- ConfidenceTier class added with HIGH/MEDIUM/LOW constants and thresholds
- Confidence routing function integrated into review pipeline after validation
- Orchestrator prompt updated with confidence tier documentation and guidelines

## Task Commits

Each task was committed atomically:

1. **Task 0: Add cross-validation fields to PRReviewFinding model** - `f4988dcb3` (feat)
2. **Task 1: Add confidence routing function** - `822221168` (feat)
3. **Task 2: Wire confidence routing into review pipeline** - `3ff5b3d97` (feat)
4. **Task 3: Update orchestrator prompt with confidence tier guidance** - `6b2c9edb3` (docs)

## Files Created/Modified

- `apps/backend/runners/github/models.py` - Added confidence, source_agents, cross_validated fields to PRReviewFinding
- `apps/backend/runners/github/services/parallel_orchestrator_reviewer.py` - Added ConfidenceTier class and _apply_confidence_routing() method
- `apps/backend/runners/github/output_validator.py` - Fixed confidence threshold check to treat 0.5 as default
- `apps/backend/prompts/github/pr_parallel_orchestrator.md` - Added Confidence Tiers documentation section

## Decisions Made

1. **Default confidence is 0.5** - Medium confidence as baseline when not explicitly set
2. **output_validator compatibility fix** - Treat confidence=0.5 as "not explicitly set" to maintain backwards compatibility with existing validator logic
3. **Simple class over enum** - Used ConfidenceTier with string constants to match existing codebase style
4. **Routing happens after validation** - Confidence routing occurs after evidence/scope validation but before verdict generation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed output_validator confidence threshold logic**
- **Found during:** Task 0 (PRReviewFinding model extension)
- **Issue:** Existing validator checked `if hasattr(finding, "confidence") and finding.confidence:` which treated 0.5 as truthy, breaking existing tests
- **Fix:** Changed to `if hasattr(finding, "confidence") and finding.confidence > 0.5:` to treat 0.5 as default (not explicitly set)
- **Files modified:** apps/backend/runners/github/output_validator.py
- **Verification:** All tests pass
- **Committed in:** f4988dcb3 (part of Task 0 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for test compatibility. No scope creep.

## Issues Encountered

None - plan executed as specified after the blocking issue was resolved.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Confidence routing infrastructure complete and integrated
- Ready for Phase 3 Plan 2 (if any) or Phase 4 Integration Testing
- All findings now include confidence field for future multi-agent cross-validation

---
*Phase: 03-cross-validation*
*Completed: 2026-01-19*
