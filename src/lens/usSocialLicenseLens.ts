// ============================================================================
// US Social License Lens — INTERFACE + STUB ONLY (Engine v4.0 — Module 5)
// ============================================================================
//
// This lens is SPECIFIED but deliberately NOT SCORED. There is no settled
// evidence standard for a US data-centre "social license to operate", and a
// scored stub would fake precision that could surface — falsely — in a client
// deliverable. `evaluate()` therefore throws LensNotImplementedError. The lens
// is still registered in the registry so it is discoverable and so
// evaluateAll() reports it as a known-but-unscored lens (failure-isolated).
//
// Evidence dimensions this lens WILL score once a defensible standard exists
// (e.g. as the GADCC — Greening AI Data Centres Coalition, launched 22 Apr 2026
// — publishes credible green-DC benchmarks that include SOCIAL criteria):
//
//   1. Local energy-price impact — does the asset raise local retail/wholesale
//      power prices? (canonical: communityLand.localEnergyPriceImpactAssessment)
//   2. Water draw vs local stress — consumptive water use against the host
//      region's water-stress band. (canonical: water.wue,
//      water.consumptiveSharePercent, water.waterStressBand)
//   3. Grid contribution / modular provision — behind-the-meter or co-located
//      generation the asset brings to the host grid. (canonical:
//      energy.behindTheMeterProvision, energy.onSiteGenerationMw)
//   4. Community agreement status — none / consultation / binding agreement.
//      (canonical: communityLand.hostCommunityEngagement)
//   5. Quality-of-life / permitting posture — noise, land-use, permitting.
//      (canonical: communityLand.noiseLandUsePermittingStatus)
//
// The canonical model already carries every field above (Module 1 kept the
// community/land + grid-modularity fields present precisely so this lens stays
// honest when it is built). NO scoring, NO thresholds, NO config section here.
// ============================================================================

import type { CanonicalAssessment } from "../core/canonical";
import { LensNotImplementedError } from "./errors";
import type { FrameworkLens, LensVerdict } from "./types";

const LENS_ID = "us_social_license";
const LENS_VERSION = "4.0.0-alpha.1-stub";

/** Evidence dimensions this lens will score once a standard is settled. */
export const US_SOCIAL_LICENSE_DIMENSIONS = [
  "local_energy_price_impact",
  "water_draw_vs_local_stress",
  "grid_contribution_modular_provision",
  "community_agreement_status",
  "quality_of_life_permitting_posture",
] as const;

export class USSocialLicenseLens implements FrameworkLens {
  readonly id = LENS_ID;
  readonly version = LENS_VERSION;
  // No config is injected — this lens has no thresholds and no config section.
  readonly configVersion = "n/a";

  evaluate(_a: CanonicalAssessment): LensVerdict {
    throw new LensNotImplementedError(
      LENS_ID,
      "US data-centre social-license scoring is specified but not scored — no settled evidence standard exists (see GADCC, launched 22 Apr 2026). A scored stub would fake precision.",
    );
  }
}
