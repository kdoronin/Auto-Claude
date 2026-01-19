# Phase 1: Core Validation Pipeline - Research

**Researched:** 2026-01-19
**Domain:** PR Review False Positive Prevention
**Confidence:** HIGH

## Summary

This phase adds the finding-validator agent to initial reviews to eliminate false positives before they persist. Currently, finding-validator only runs on follow-up reviews where it validates unresolved findings. By adding it to initial reviews, ALL findings will be validated before being reported.

Research confirms:
- Finding-validator already exists with a well-designed prompt (`pr_finding_validator.md`)
- Follow-up orchestrator (`parallel_followup_reviewer.py`) shows the pattern for integrating finding-validator
- Context gathering has a bug where `ai_reviews` are not included in `ai_bot_comments_since_review`
- Specialist prompts need consistent Read tool instructions to prevent assumptions without reading code
- Evidence validation requires checking the `evidence` field has actual code, not descriptions

**Primary recommendation:** Add finding-validator as a subagent to `parallel_orchestrator_reviewer.py` and invoke it in a validation phase after specialist agents complete.

## Finding-Validator Pattern (from Follow-up Reviews)

### How It Works in Follow-up

The finding-validator is defined in `parallel_followup_reviewer.py` lines 237-250:

```python
"finding-validator": AgentDefinition(
    description=(
        "Finding re-investigation specialist. Re-investigates unresolved findings "
        "to validate they are actually real issues, not false positives. "
        "Actively reads the code at the finding location with fresh eyes. "
        "Can confirm findings as valid OR dismiss them as false positives. "
        "CRITICAL: Invoke for ALL unresolved findings after resolution-verifier runs. "
        "Invoke when: There are findings marked as unresolved that need validation."
    ),
    prompt=validator_prompt or "You validate whether unresolved findings are real issues.",
    tools=["Read", "Grep", "Glob"],
    model="inherit",
)
```

### Validation Flow

From `pr_followup_orchestrator.md`:

1. **Resolution-verifier** runs first, identifies unresolved findings
2. **Finding-validator** runs on ALL unresolved findings
3. For each finding, returns one of:
   - `confirmed_valid` - Issue IS real, keep as finding
   - `dismissed_false_positive` - Original finding was WRONG, remove from findings
   - `needs_human_review` - Cannot determine, flag for human

### Result Processing

From `parallel_followup_reviewer.py` lines 817-845:

```python
# Build a map of finding validations (from finding-validator agent)
validation_map = {}
dismissed_ids = []
for fv in response.finding_validations:
    validation_map[fv.finding_id] = fv
    if fv.validation_status == "dismissed_false_positive":
        dismissed_ids.append(fv.finding_id)

# When processing resolution verifications, skip dismissed findings
for rv in response.resolution_verifications:
    if rv.status in ("unresolved", "partially_resolved", "cant_verify"):
        if rv.finding_id in dismissed_ids:
            # Skip - dismissed as false positive
            resolved_ids.append(rv.finding_id)  # Count as resolved
            continue
```

### What to Reuse for Initial Reviews

| Component | Location | Reuse Strategy |
|-----------|----------|----------------|
| `pr_finding_validator.md` | `prompts/github/` | Use as-is, already has scope/evidence rules |
| `FindingValidationResult` | `pydantic_models.py` | Use exact same Pydantic model |
| Validation processing logic | `parallel_followup_reviewer.py` | Adapt for initial review context |

**Confidence:** HIGH - Code is well-documented and patterns are clear.

## Orchestrator Integration Points

### Current Initial Review Flow

From `parallel_orchestrator_reviewer.py`:

```
Phase 1: Analysis
  - Orchestrator analyzes PR (size, complexity, risk areas)

Phase 2: Delegation
  - Invokes specialist agents (security, quality, logic, codebase-fit, ai-triage)
  - SDK handles parallel execution

Phase 3: Synthesis
  - Aggregates findings from specialists
  - Cross-validates, deduplicates
  - Generates verdict
```

### Where to Add Validation

**Option 1: Add as Phase 2.5 (Post-Synthesis Validation)**

After specialists complete but before final verdict:

1. Specialists return raw findings
2. **Finding-validator validates EACH finding** (new phase)
3. Dismissed findings are removed
4. Remaining findings determine verdict

**Pros:**
- Clean separation of concerns
- Validates ALL specialist findings equally
- Can run in parallel for multiple findings

**Cons:**
- Adds latency (one more agent invocation round)
- Need to modify orchestrator prompt to include validation phase

**Option 2: Modify Prompt to Always Invoke Validator**

Update `pr_parallel_orchestrator.md` to instruct:
- "After synthesizing specialist findings, ALWAYS invoke finding-validator for ALL findings before generating verdict"

**Pros:**
- No code changes to orchestrator Python file
- Prompt-driven behavior

**Cons:**
- AI may not reliably invoke validator
- Less control over flow

**Recommendation:** Option 1 - Add validation phase in code. This guarantees validation happens.

### Code Changes Required

In `parallel_orchestrator_reviewer.py`:

1. **Add finding-validator to `_define_specialist_agents()`** (line ~173):
```python
"finding-validator": AgentDefinition(
    description=(
        "Finding validation specialist. Re-investigates findings to validate "
        "they are actually real issues, not false positives. "
        "Reads the ACTUAL CODE at the finding location with fresh eyes. "
        "CRITICAL: Invoke for ALL findings after specialist agents complete."
    ),
    prompt=validator_prompt,
    tools=["Read", "Grep", "Glob"],
    model="inherit",
)
```

2. **Update orchestrator prompt** to add Phase 3.5:
```
### Phase 3.5: Finding Validation (CRITICAL - Prevent False Positives)

After synthesis but BEFORE generating verdict:
1. Pass ALL findings to finding-validator
2. For each finding, validator returns:
   - confirmed_valid: Keep finding
   - dismissed_false_positive: Remove finding
   - needs_human_review: Flag for human
3. Only VALIDATED findings count toward verdict
```

3. **Add `finding_validations` to `ParallelOrchestratorResponse`** schema

4. **Process validation results** before generating verdict

**Confidence:** HIGH - Clear integration pattern from follow-up reviewer.

## Context Bug Analysis (REQ-002)

### Bug Location

`context_gatherer.py` line 1288:

```python
return FollowupReviewContext(
    ...
    contributor_comments_since_review=contributor_comments + contributor_reviews,
    ai_bot_comments_since_review=ai_comments,  # BUG: Missing + ai_reviews
    pr_reviews_since_review=pr_reviews,
    ...
)
```

### Root Cause

AI reviews (formal review submissions from CodeRabbit, Cursor, etc.) are fetched and separated at lines 1228-1242:

```python
# Separate AI bot reviews from contributor reviews
ai_reviews = []
contributor_reviews = []

for review in pr_reviews:
    author = review["user"].get("login", "").lower()
    is_ai_bot = any(pattern in author for pattern in AI_BOT_PATTERNS.keys())
    if is_ai_bot:
        ai_reviews.append(review)
    else:
        contributor_reviews.append(review)
```

But `ai_reviews` is never added to `ai_bot_comments_since_review`.

### Impact

- AI tool formal reviews (body text with findings) are not included in AI feedback
- Follow-up review misses CodeRabbit/Cursor findings that were submitted as reviews
- Only inline comments from AI tools are captured, not review summaries

### Fix

Change line 1288 from:
```python
ai_bot_comments_since_review=ai_comments,
```
to:
```python
ai_bot_comments_since_review=ai_comments + ai_reviews,
```

**Confidence:** HIGH - Simple fix, clear bug.

## PR Reviews Fetching (REQ-003)

### Current State

`get_reviews_since()` method already exists in `gh_client.py` lines 737-802:

```python
async def get_reviews_since(
    self, pr_number: int, since_timestamp: str
) -> list[dict]:
    """Get all PR reviews (formal review submissions) since a timestamp."""
    reviews_endpoint = f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews"
    # Fetches all reviews, filters client-side by timestamp
```

This method IS being called in `context_gatherer.py` line 1199:
```python
pr_reviews = await self.gh_client.get_reviews_since(
    self.pr_number, self.previous_review.reviewed_at
)
```

**No new fetching code needed.** The bug is that `ai_reviews` aren't included in the output, not that they aren't fetched.

**Confidence:** HIGH - Verified existing code.

## Prompt Pattern Analysis (REQ-004)

### Current State of Specialist Prompts

All specialist prompts already have scope instructions, but they vary in how they instruct tool usage:

| Prompt | Has Read/Grep/Glob tools | Has explicit "verify before reporting" |
|--------|-------------------------|---------------------------------------|
| `pr_security_agent.md` | Implicit (tools list) | Yes - "Verify Before Claiming Missing" section |
| `pr_logic_agent.md` | Implicit | Yes - "Verify Before Claiming Missing" section |
| `pr_quality_agent.md` | Implicit | Yes - "Verify Before Claiming Missing" section |
| `pr_codebase_fit_agent.md` | Implicit | Partial - "Check Before Reporting" |
| `pr_followup_resolution_agent.md` | Implicit | Yes - "NEVER ASSUME - ALWAYS VERIFY" |
| `pr_followup_newcode_agent.md` | Implicit | Yes - "NEVER ASSUME - ALWAYS VERIFY" |

### Recommended Instruction Pattern

From `pr_finding_validator.md` - the most thorough verification guidance:

```markdown
## CRITICAL: Full Context Analysis

Before reporting ANY finding, you MUST:

1. **USE the Read tool** to examine the actual code at the finding location
   - Never report based on diff alone
   - Get +-20 lines of context around the flagged line
   - Verify the line number actually exists in the file

2. **Verify the issue exists** - Not assume it does
   - Is the problematic pattern actually present at this line?
   - Is there validation/sanitization nearby you missed?
   - Does the framework provide automatic protection?

3. **Provide code evidence** - Copy-paste the actual code
   - Your `evidence` field must contain real code from the file
   - Not descriptions like "the code does X" but actual `const query = ...`
   - If you can't provide real code, you haven't verified the issue

4. **Check for mitigations** - Use Grep to search for:
   - Validation functions that might sanitize this input
   - Framework-level protections
   - Comments explaining why code appears unsafe

**Your evidence must prove the issue exists - not just that you suspect it.**
```

### Files to Update

1. `pr_security_agent.md` - Add "CRITICAL: Full Context Analysis" section
2. `pr_logic_agent.md` - Add same section
3. `pr_quality_agent.md` - Add same section
4. `pr_codebase_fit_agent.md` - Add same section
5. `pr_followup_resolution_agent.md` - Enhance existing section
6. `pr_followup_newcode_agent.md` - Enhance existing section

**Confidence:** HIGH - Clear pattern to follow from finding-validator.

## Evidence & Scope Enforcement (REQ-009, REQ-010)

### Evidence Field Validation

The `evidence` field exists in:
- `PRReviewFinding` (models.py line 230): `evidence: str | None = None`
- `BaseFinding` (pydantic_models.py line 49-52):
```python
evidence: str | None = Field(
    None,
    description="Actual code snippet proving the issue exists. Required for validation.",
)
```

### Validation Strategy

**Programmatic Validation (in reviewer code):**
```python
def _validate_finding_evidence(finding: PRReviewFinding) -> bool:
    """Check if finding has actual code evidence, not just descriptions."""
    if not finding.evidence:
        return False

    # Reject generic descriptions
    description_patterns = [
        "the code",
        "this function",
        "it appears",
        "seems to",
        "may be",
        "could be",
        "might be",
        "appears to",
    ]
    evidence_lower = finding.evidence.lower()
    for pattern in description_patterns:
        if evidence_lower.startswith(pattern):
            return False

    # Evidence should look like code (has syntax characters)
    code_chars = ['=', '(', ')', '{', '}', ';', ':', '.', '->', '::']
    has_code_syntax = any(char in finding.evidence for char in code_chars)

    return has_code_syntax
```

**Prompt-Based Enforcement:**
Add to orchestrator prompt:
```markdown
## Evidence Requirements (MANDATORY)

EVERY finding MUST include an `evidence` field with:
- Actual code copy-pasted from the file (not descriptions)
- The specific line numbers examined
- Proof the issue exists in the code

Reject findings that have:
- Empty evidence field
- Descriptions like "the code does X" instead of actual code
- No line numbers or file references

**If you cannot provide actual code as evidence, the finding is not valid.**
```

### Scope Pre-Filter

From `pr_finding_validator.md` lines 9-26:

```markdown
## CRITICAL: Check PR Scope First

**Before investigating any finding, verify it's within THIS PR's scope:**

1. **Check if the file is in the PR's changed files list** - If not, likely out-of-scope
2. **Check if the line number exists** - If finding cites line 710 but file has 600 lines, it's hallucinated
3. **Check for PR references in commit messages** - Commits like `fix: something (#584)` are from OTHER PRs

**Dismiss findings as `dismissed_false_positive` if:**
- The finding references a file NOT in the PR's changed files list AND is not about impact on that file
- The line number doesn't exist in the file (hallucinated)
- The finding is about code from a merged branch commit (not this PR's work)
```

**Programmatic Scope Check:**
```python
def _is_finding_in_scope(finding: PRReviewFinding, context: PRContext) -> bool:
    """Check if finding is within PR scope."""
    # Get list of changed files
    changed_files = [f.path for f in context.changed_files]

    # Finding must be in a changed file (or about impact)
    if finding.file not in changed_files:
        # Check if it's about impact (allowed)
        impact_keywords = ["breaks", "affects", "impact", "caller", "depends"]
        is_impact_finding = any(kw in finding.description.lower() for kw in impact_keywords)
        if not is_impact_finding:
            return False

    # Check line number validity would require file read (do in validation phase)
    return True
```

**Confidence:** HIGH - Clear validation rules from existing prompts.

## Implementation Risks

### Risk 1: Latency Impact

**What could go wrong:** Adding finding-validator adds another agent invocation round, increasing review time.

**Mitigation:**
- Run validation in parallel for multiple findings
- Consider only validating MEDIUM+ severity findings (not LOW suggestions)
- Document expected latency increase for users

### Risk 2: Validator Dismisses Valid Findings

**What could go wrong:** Validator incorrectly dismisses real issues as false positives.

**Mitigation:**
- `needs_human_review` status for uncertain cases
- Log dismissed findings for debugging
- Require strong evidence for dismissal (not just "I don't see it")

### Risk 3: Prompt Changes Cause Regressions

**What could go wrong:** Modifying specialist prompts changes their behavior in unexpected ways.

**Mitigation:**
- Add Read tool instructions as NEW section, don't modify existing sections
- Use consistent language across all prompts
- Test with variety of PRs before deployment

### Risk 4: Schema Changes Break Parsing

**What could go wrong:** Adding `finding_validations` to response schema causes parsing errors.

**Mitigation:**
- Use `default_factory=list` for new fields (optional, empty by default)
- Test with both old and new AI outputs
- Add graceful fallback if validation data is missing

**Confidence:** MEDIUM - These are real risks but mitigations are clear.

## Recommendations

### For Planning

1. **Start with the bug fix (REQ-002)** - Single line change, high impact, no risk
2. **Add finding-validator agent to orchestrator** - Core change, follow existing pattern
3. **Update orchestrator prompt** - Add Phase 3.5: Finding Validation
4. **Add prompt instructions last** - Lower priority, can iterate

### Code Change Priorities

| Change | Files | Priority | Risk |
|--------|-------|----------|------|
| Fix `ai_reviews` bug | `context_gatherer.py:1288` | P0 | Low |
| Add finding-validator agent | `parallel_orchestrator_reviewer.py` | P0 | Medium |
| Update orchestrator prompt | `pr_parallel_orchestrator.md` | P0 | Medium |
| Add evidence validation | `parallel_orchestrator_reviewer.py` | P1 | Low |
| Add scope pre-filter | `parallel_orchestrator_reviewer.py` | P1 | Low |
| Add Read tool instructions | All specialist prompts | P1 | Low |

### Verification Steps

For each change:
1. Run existing tests to ensure no regression
2. Test with real PR review to verify behavior
3. Check that false positive rate decreases
4. Monitor review latency

## Sources

### Primary (HIGH confidence)
- `apps/backend/runners/github/services/parallel_followup_reviewer.py` - Finding-validator integration pattern
- `apps/backend/runners/github/services/parallel_orchestrator_reviewer.py` - Initial review structure
- `apps/backend/prompts/github/pr_finding_validator.md` - Validator prompt with evidence rules
- `apps/backend/prompts/github/pr_parallel_orchestrator.md` - Orchestrator flow
- `apps/backend/runners/github/context_gatherer.py` - Bug location verified
- `apps/backend/runners/github/services/pydantic_models.py` - Schema definitions

### Secondary (MEDIUM confidence)
- `apps/backend/prompts/github/pr_security_agent.md` - Existing verification section pattern
- `apps/backend/prompts/github/pr_logic_agent.md` - Existing verification section pattern
- `apps/backend/prompts/github/pr_quality_agent.md` - Existing verification section pattern

## Metadata

**Confidence breakdown:**
- Finding-validator pattern: HIGH - Verified from working code
- Orchestrator integration: HIGH - Clear patterns exist
- Bug fix: HIGH - Simple, verified line number
- Prompt patterns: HIGH - Consistent existing examples
- Evidence validation: MEDIUM - Logic is sound but not tested

**Research date:** 2026-01-19
**Valid until:** 30 days (code patterns are stable)
