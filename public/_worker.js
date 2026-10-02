/**
 * Cloudflare Pages Advanced Mode worker for the Direct Upload deployment.
 *
 * The browser build expects same-origin /api routes. Dashboard drag/drop cannot
 * compile a /functions directory, but Cloudflare Pages does execute a root
 * _worker.js, so this file supplies the two aircraft snapshot routes required by
 * the First Launch "LIVE CONTACTS" mission and delegates everything else to the
 * static asset binding.
 *
 * Civilian snapshots deliberately use the public adsb.lol regional endpoint
 * rather than OpenSky. This keeps the Direct Upload deployment keyless and
 * avoids turning a static demo into an operational OpenSky API client.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=8',
};

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function adsbLolToOpenSky(payload) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const states = Array.isArray(payload?.ac)
    ? payload.ac.flatMap((row) => {
        const hex = String(row?.hex || '').trim().toLowerCase();
        const lat = finite(row?.lat);
        const lon = finite(row?.lon);
        if (!hex || lat == null || lon == null) return [];
        const seen = Math.max(0, finite(row?.seen) ?? 0);
        const seenPos = Math.max(0, finite(row?.seen_pos) ?? seen);
        const altBaroFt = finite(row?.alt_baro);
        const altGeomFt = finite(row?.alt_geom);
        const gsKnots = finite(row?.gs);
        const track = finite(row?.track);
        const baroRateFtMin = finite(row?.baro_rate);
        const onGround =
          String(row?.alt_baro || '').toLowerCase() === 'ground' ||
          row?.airground === 'G+';
        return [[
          hex,
          String(row?.flight || '').trim() || null,
          null,
          nowSeconds - seenPos,
          nowSeconds - seen,
          lon,
          lat,
          altBaroFt == null ? null : altBaroFt * 0.3048,
          onGround,
          gsKnots == null ? null : gsKnots * 0.514444,
          track,
          baroRateFtMin == null ? null : baroRateFtMin * 0.00508,
          null,
          altGeomFt == null ? null : altGeomFt * 0.3048,
          null,
          null,
          null,
          null,
        ]];
      })
    : [];
  return { time: nowSeconds, states };
}

async function upstreamJson(url, request, cacheTtl = 10) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'gods-eye-view-cloudflare-pages/1.0',
    },
    cf: { cacheTtl, cacheEverything: true },
    signal: request.signal,
  });
  const text = await response.text();
  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: 'Aircraft source unavailable', upstreamStatus: response.status }),
      { status: response.status, headers: JSON_HEADERS },
    );
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed aircraft source response' }), {
      status: 502,
      headers: JSON_HEADERS,
    });
  }
  return payload;
}

async function civilianSnapshot(request) {
  const incoming = new URL(request.url);
  const lat = finite(incoming.searchParams.get('lat'));
  const lon = finite(incoming.searchParams.get('lon'));
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response(JSON.stringify({ error: 'Valid lat/lon required' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }
  const radiusNm = 250;
  const upstream =
    'https://api.adsb.lol/v2/lat/' +
    encodeURIComponent(clamp(lat, -90, 90).toFixed(4)) +
    '/lon/' +
    encodeURIComponent(clamp(lon, -180, 180).toFixed(4)) +
    '/dist/' +
    radiusNm;
  const payload = await upstreamJson(upstream, request, 10);
  if (payload instanceof Response) return payload;
  return new Response(JSON.stringify(adsbLolToOpenSky(payload)), {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      'x-flight-source': 'adsb.lol',
      'x-flight-coverage': radiusNm + 'nm regional snapshot',
    },
  });
}

async function militarySnapshot(request) {
  const payload = await upstreamJson('https://api.adsb.lol/v2/mil', request, 12);
  if (payload instanceof Response) return payload;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...JSON_HEADERS, 'x-ads-b-cache': 'CLOUDFLARE' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/api/opensky')
        return await civilianSnapshot(request);
      if (request.method === 'GET' && url.pathname === '/api/adsblol/mil')
        return await militarySnapshot(request);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (request.signal?.aborted) return new Response(null, { status: 499 });
      return new Response(
        JSON.stringify({ error: 'Aircraft proxy unavailable' }),
        { status: 502, headers: JSON_HEADERS },
      );
    }
  },
};
