# Fork notes

This fork tracks the upstream `bilawalsidhu/gods-eye-view` project while keeping a small browser/Cloudflare compatibility layer.

## Upstream baseline

- Baseline synced to upstream v0.2.0.
- MCP/tool-catalog and in-conversation globe support come from upstream.

## Fork-specific changes

1. `.github/workflows/build-cloudflare-upload.yml`
   - Builds a browser-ready `dist/` artifact for Cloudflare Pages direct upload.

2. `public/_worker.js`
   - Supplies same-origin aircraft snapshot routes on Cloudflare Pages.
   - Uses public adsb.lol data for civilian and military aircraft snapshots.

3. `src/layers/installations/source.js`
   - Treats missing/static-host API responses as an unavailable server capability.
   - Falls back to browser-safe map tiles instead of retrying an unavailable Overpass API.

4. `src/services/requests.js`
   - Treats static-host 404/405/HTML capability probes as unavailable rather than retryable API failures.

## Intentionally excluded

- The former Foz do Iguaçu / Damascus CCTV experiment remains removed.
- No private-camera access, credential scraping, or person-tracking layer is part of this fork.

## Fieldwatch / local RF direction

Fieldwatch is being evaluated only as a separate local-sensor bridge. The intended boundary is:

Android sensor -> local BLE/Wi-Fi/Remote-ID observations -> normalized local feed -> God's Eye View visualization.

Any implementation should stay on a feature branch until it is isolated, documented, and green in CI.
