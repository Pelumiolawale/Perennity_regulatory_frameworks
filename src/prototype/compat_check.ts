// ============================================================================
// Phase 0 archetype prototype — backward-compat type assertion
// ============================================================================
//
// Asserts via the type system that the existing BUNDLED_ACTIVITIES entries
// (currently just EU Taxonomy 8.1) satisfy the new activity_aligned arm of
// the FrameworkArchetype union WITHOUT MODIFICATION.
//
// If this file fails to type-check, the refactor is NOT backward-compatible
// and the spike has failed: the existing Activity / JSON values would have
// to change shape to fit the new types, which is a no-go signal.
//
// We import BUNDLED_ACTIVITIES (the typed in-memory export from src/index.ts)
// rather than the JSON directly. BUNDLED_ACTIVITIES is typed as Activity[]
// in index.ts via a single typed cast applied at module load — downstream
// type-checking still flows through the Activity type, so the assertion
// below is meaningful.
// ============================================================================

import { BUNDLED_ACTIVITIES } from "../index";
import type {
  ActivityAlignedFramework,
  AnyFramework,
} from "./archetype";

// Assertion 1: every existing BUNDLED_ACTIVITIES entry is assignable to
// ActivityAlignedFramework. This holds because ActivityAlignedFramework
// extends Activity with only an OPTIONAL `archetype` discriminator, so any
// existing Activity value satisfies the new interface unchanged.
const _aligned: ActivityAlignedFramework[] = BUNDLED_ACTIVITIES;

// Assertion 2: every existing BUNDLED_ACTIVITIES entry is assignable to the
// discriminated union AnyFramework. Each value narrows to the
// activity_aligned arm because (a) archetype is undefined or
// "activity_aligned", and (b) the product_label and issuance_framework arms
// require fields that legacy Activity values do not have.
const _anyFramework: AnyFramework[] = BUNDLED_ACTIVITIES;

// Touch the locals so they aren't dead in any tooling that reports
// unused-locals. tsconfig does not currently set noUnusedLocals, but this
// keeps the assertion robust if that changes.
void _aligned;
void _anyFramework;
