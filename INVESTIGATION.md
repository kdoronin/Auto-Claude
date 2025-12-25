# Investigation: v2.7.1 Release Artifacts Issue

## Investigation Date

2025-12-25

## Summary

The v2.7.1 release has **incorrect files attached**. All artifacts have v2.7.0 in their filenames, indicating the wrong build artifacts were uploaded.

---

## Phase 1: Reproduce and Verify Issue

### Subtask 1-1: Current v2.7.1 Assets

**Command:** `gh release view v2.7.1 --json assets -q '.assets[].name'`

**Release Metadata:**
- Tag Name: v2.7.1
- Release Name: v2.7.1
- Published At: 2025-12-22T13:35:38Z
- Is Draft: false
- Is Prerelease: false

**Files Currently Attached to v2.7.1:**

| File Name | Size (bytes) | Expected Name |
|-----------|-------------|---------------|
| Auto-Claude-2.7.0-darwin-arm64.dmg | 124,187,073 | Auto-Claude-2.7.1-darwin-arm64.dmg |
| Auto-Claude-2.7.0-darwin-arm64.zip | 117,694,085 | Auto-Claude-2.7.1-darwin-arm64.zip |
| Auto-Claude-2.7.0-darwin-x64.dmg | 130,635,398 | Auto-Claude-2.7.1-darwin-x64.dmg |
| Auto-Claude-2.7.0-darwin-x64.zip | 124,176,354 | Auto-Claude-2.7.1-darwin-x64.zip |
| Auto-Claude-2.7.0-linux-amd64.deb | 104,558,694 | Auto-Claude-2.7.1-linux-amd64.deb |
| Auto-Claude-2.7.0-linux-x86_64.AppImage | 145,482,885 | Auto-Claude-2.7.1-linux-x86_64.AppImage |
| Auto-Claude-2.7.0-win32-x64.exe | 101,941,972 | Auto-Claude-2.7.1-win32-x64.exe |
| checksums.sha256 | 718 | checksums.sha256 (with v2.7.1 filenames) |

### Issue Confirmed

**Problem:** All 7 platform artifacts attached to v2.7.1 have "2.7.0" in their filename instead of "2.7.1".

**Impact:**
- Users downloading v2.7.1 are receiving v2.7.0 binaries
- File naming does not match the release version
- Checksums file likely references v2.7.0 filenames
- Auto-update mechanisms may be confused by version mismatch

**Evidence:**
```
Files attached to v2.7.1:
- Auto-Claude-2.7.0-darwin-arm64.dmg   (WRONG - should be 2.7.1)
- Auto-Claude-2.7.0-darwin-arm64.zip   (WRONG - should be 2.7.1)
- Auto-Claude-2.7.0-darwin-x64.dmg     (WRONG - should be 2.7.1)
- Auto-Claude-2.7.0-darwin-x64.zip     (WRONG - should be 2.7.1)
- Auto-Claude-2.7.0-linux-amd64.deb    (WRONG - should be 2.7.1)
- Auto-Claude-2.7.0-linux-x86_64.AppImage (WRONG - should be 2.7.1)
- Auto-Claude-2.7.0-win32-x64.exe      (WRONG - should be 2.7.1)
- checksums.sha256                      (likely references wrong filenames)
```

---

### Subtask 1-2: Comparison with v2.7.0 and Expected Naming

**Command:** `gh release view v2.7.0 --json assets -q '.assets[].name'`

#### v2.7.0 Release Analysis

**Release Metadata:**
- Tag Name: v2.7.0
- Release Name: v2.7.0
- Published At: 2025-12-22T13:19:13Z
- Target Commitish: main
- Is Draft: false
- Is Prerelease: false

**Critical Finding:** v2.7.0 has **NO assets attached** (empty assets array).

#### Release Timeline

| Release | Published At | Assets Count | Status |
|---------|-------------|--------------|--------|
| v2.7.0  | 2025-12-22T13:19:13Z | 0 | No files attached |
| v2.7.1  | 2025-12-22T13:35:38Z | 8 | Wrong version in filenames |
| v2.7.2  | 2025-12-22T13:52:51Z | ? | Draft release |

**Observation:** v2.7.0 was published 16 minutes before v2.7.1, but has no artifacts attached.

#### Checksums File Analysis

The `checksums.sha256` file attached to v2.7.1 contains:
```
0a0094ff3e52609665f6f0d6d54180dbfc592956f91ef2cdd94e43a61b6b24d2  ./Auto-Claude-2.7.0-darwin-arm64.dmg
43b168f3073d60644bb111c8fa548369431dc448e67700ed526cb4cad61034e0  ./Auto-Claude-2.7.0-darwin-arm64.zip
5150cbba934fbeb3d97309a493cc8ef3c035e9ec38b31f01382d628025f5c451  ./Auto-Claude-2.7.0-darwin-x64.dmg
ea9139277290a8189f799d00bc3cd1aaf81a16e890ff90327eca01a4cce73e61  ./Auto-Claude-2.7.0-darwin-x64.zip
078b2ba6a2594bf048932776dc31a45e59cd9cb23b34b2cf2f810f4101f04736  ./Auto-Claude-2.7.0-linux-amd64.deb
1feb6b9be348a5e23238e009dbc1ce8b2788103a262cd856613332b3ab1711e9  ./Auto-Claude-2.7.0-linux-x86_64.AppImage
25383314b3bc032ceaf8a8416d5383879ed351c906f03175b8533047647a612d  ./Auto-Claude-2.7.0-win32-x64.exe
```

**Issue:** Checksums file also references v2.7.0 filenames, confirming the build was run with v2.7.0 version.

#### Expected Naming Pattern (from release.yml)

Based on the release workflow analysis, artifacts follow this naming convention:
```
Auto-Claude-{version}-{platform}-{arch}.{ext}
```

Where version comes from `package.json` in `auto-claude-ui/`.

**Expected v2.7.1 Artifacts:**
| Expected Filename | Actual Filename (Wrong) |
|-------------------|-------------------------|
| Auto-Claude-2.7.1-darwin-arm64.dmg | Auto-Claude-2.7.0-darwin-arm64.dmg |
| Auto-Claude-2.7.1-darwin-arm64.zip | Auto-Claude-2.7.0-darwin-arm64.zip |
| Auto-Claude-2.7.1-darwin-x64.dmg | Auto-Claude-2.7.0-darwin-x64.dmg |
| Auto-Claude-2.7.1-darwin-x64.zip | Auto-Claude-2.7.0-darwin-x64.zip |
| Auto-Claude-2.7.1-linux-amd64.deb | Auto-Claude-2.7.0-linux-amd64.deb |
| Auto-Claude-2.7.1-linux-x86_64.AppImage | Auto-Claude-2.7.0-linux-x86_64.AppImage |
| Auto-Claude-2.7.1-win32-x64.exe | Auto-Claude-2.7.0-win32-x64.exe |
| checksums.sha256 (v2.7.1 refs) | checksums.sha256 (v2.7.0 refs) |

#### Hypothesis

The evidence suggests one of the following scenarios:

1. **Tag/Version Mismatch:** The v2.7.1 tag may point to a commit where `package.json` still had version `2.7.0`
2. **Workflow Re-run:** The v2.7.1 release may have been created by re-running the v2.7.0 workflow artifacts
3. **Manual Upload Error:** Artifacts from v2.7.0 were manually attached to the v2.7.1 release
4. **Artifact Caching:** Old workflow artifacts were incorrectly reused for v2.7.1

**Next step:** Check git tags and package.json versions to determine root cause.

---

### Subtask 1-3: Package.json Version and Git State Analysis

**Commands Used:**
- `git show v2.7.1:auto-claude-ui/package.json | jq -r '.version'`
- `git show v2.7.0:auto-claude-ui/package.json | jq -r '.version'`
- `git log --oneline v2.7.0..v2.7.1`
- `git rev-parse v2.7.1^{commit}`

#### Current Package.json State

| Location | Current Version |
|----------|-----------------|
| `auto-claude-ui/package.json` (HEAD) | 2.7.1 |

**Note:** The subtask referenced `apps/frontend/package.json`, but the actual path is `auto-claude-ui/package.json`.

#### Version at Git Tags

| Tag | Commit | package.json Version | Expected |
|-----|--------|---------------------|----------|
| v2.7.0 | `fe7290a8` | 2.6.5 | 2.7.0 |
| v2.7.1 | `772a5006` | **2.7.0** ❌ | 2.7.1 |

#### Commit Timeline

```
fc2075dd auto-claude: subtask-1-2 - Compare v2.7.1 artifacts...
ff033a8e auto-claude: subtask-1-1 - List all files...
8db71f3d Update version to 2.7.1 in package.json    <-- Version bump (AFTER tag)
772a5006 2.7.1                                      <-- v2.7.1 TAG placed here
d23fcd86 Enhance VirusTotal scan error handling...
...more commits...
fe7290a8 Release v2.7.0...                          <-- v2.7.0 TAG placed here
```

#### Root Cause Identified ✅

**Problem:** The `v2.7.1` tag was placed on commit `772a5006` BEFORE the `package.json` version was updated to `2.7.1`.

**Timeline of error:**
1. Commit `772a5006` created with message "2.7.1" - tag `v2.7.1` placed here
2. At this commit, `package.json` still contained version `2.7.0`
3. The release workflow triggered on tag push, building with version `2.7.0` from `package.json`
4. All artifacts named with `2.7.0` because that's what was in `package.json`
5. Commit `8db71f3d` later updated `package.json` to `2.7.1` (but tag was already pushed)

**This is a "tag before version bump" error.**

The release workflow correctly read the version from `package.json`, but the tag was created before the version was bumped. The naming convention `${productName}-${version}-${platform}-${arch}.${ext}` correctly used version `2.7.0` because that's what was in `package.json` at the tagged commit.

#### Verification of Build Configuration

From `auto-claude-ui/package.json`:
```json
"build": {
  "artifactName": "${productName}-${version}-${platform}-${arch}.${ext}",
  ...
}
```

This confirms the version is sourced from `package.json` during the build process.

#### Git State Summary

| Metric | Value |
|--------|-------|
| Current Branch | `auto-claude/009-latest-release-v2-7-1-has-wrong-files-attached` |
| Working Tree | Clean |
| Current HEAD package.json | 2.7.1 |
| v2.7.1 tag package.json | 2.7.0 ❌ |
| v2.7.0 tag package.json | 2.6.5 ❌ |

**Note:** Both v2.7.0 and v2.7.1 tags have version mismatches in `package.json`, indicating a pattern of tagging before version bumping.

---

## Root Cause Summary

| Factor | Finding |
|--------|---------|
| What happened? | v2.7.1 tag placed before package.json version bump |
| Why? | Incorrect release process: tag first, version bump second |
| Impact | All 7 artifacts have v2.7.0 in filename |
| Evidence | `git show v2.7.1:auto-claude-ui/package.json` shows version 2.7.0 |

---

## Next Steps

1. ~~**Subtask 1-1:** Verify v2.7.1 assets~~ ✅ Complete
2. ~~**Subtask 1-2:** Compare with v2.7.0 release and verify expected naming pattern~~ ✅ Complete
3. ~~**Subtask 1-3:** Check package.json version and git state~~ ✅ Complete - ROOT CAUSE IDENTIFIED
4. **Phase 2:** Investigate root cause (tag pointing to wrong commit, workflow issue, manual error)
5. **Phase 3:** Implement fix (re-upload correct files or publish v2.7.2)
6. **Phase 4:** Add validation to prevent future occurrences

---

## Status: Phase 1 Complete - Root Cause Identified

**Root Cause:** The v2.7.1 tag was created on commit `772a5006` which still had `package.json` version `2.7.0`. The version was only bumped to `2.7.1` in a subsequent commit `8db71f3d`, but by then the release workflow had already run with the old version.

**Recommended Fix:**
1. Delete the v2.7.1 tag
2. Move the tag to a commit where package.json has version 2.7.1
3. Re-trigger the release workflow, OR
4. Mark v2.7.1 as deprecated and release v2.7.2 with correct versioning

**Process Improvement Needed:**
- Version bump should ALWAYS happen BEFORE tagging
- Add CI validation to ensure tag version matches package.json version
