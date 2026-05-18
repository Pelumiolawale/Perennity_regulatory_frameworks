# Regulatory Knowledge

This directory holds the framework definitions the engine scores against, plus
the JSON Schema that validates them.

## Note on `activity.schema.json`

Despite the historical filename, `activity.schema.json` validates all three
framework archetypes (`activity_aligned`, `product_label`,
`issuance_framework`). The filename is preserved to keep the
`"$schema": "./activity.schema.json"` reference stable inside
`frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json` — renaming the
schema file would require editing the framework JSON, which the Phase 0
backward-compat constraint forbids. See `src/framework.ts` for the
discriminated-union TypeScript shape and `src/knowledge/load.ts` for the
loader and validator entry points.
