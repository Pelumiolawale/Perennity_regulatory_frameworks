// Default lens registry wiring (Engine v4.0).
//
// Registers the three v4 lenses: EU SFDR 2.0, UK SDR, and the US
// social-license STUB (which throws on evaluate but is discoverable). Kept in
// its own module so importing a single lens doesn't pull in all of them.

import { defaultConfig, type RegulatoryConfig } from "../config/thresholds";
import { EULens } from "./euLens";
import { UKSDRLens } from "./ukSdrLens";
import { USSocialLicenseLens } from "./usSocialLicenseLens";
import { LensRegistry } from "./registry";

export const EU_LENS_ID = "eu_sfdr_2_0";
export const UK_SDR_LENS_ID = "uk_sdr";
export const US_SOCIAL_LICENSE_LENS_ID = "us_social_license";

/** Build a registry with the three v4 lenses, config injected into the scored ones. */
export function createDefaultLensRegistry(
  config: RegulatoryConfig = defaultConfig(),
): LensRegistry {
  return new LensRegistry()
    .register(new EULens(config))
    .register(new UKSDRLens(config))
    .register(new USSocialLicenseLens());
}
