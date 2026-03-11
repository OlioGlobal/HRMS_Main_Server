/**
 * Haversine formula — calculates distance (in metres) between two lat/lng points.
 */
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Detect clock-in type based on GPS coordinates and office locations.
 *
 * @param {number}   lat        — employee latitude
 * @param {number}   lng        — employee longitude
 * @param {Object[]} locations  — company locations with geofence data
 * @param {number}   defaultRadius — fallback radius in metres
 * @returns {{ type: 'office'|'remote', locationName: string|null }}
 */
const detectClockType = (lat, lng, locations, defaultRadius = 100) => {
  for (const loc of locations) {
    const gf = loc.geofence;
    if (!gf?.lat || !gf?.lng) continue;

    const radius   = gf.radius || defaultRadius;
    const distance = haversineDistance(lat, lng, gf.lat, gf.lng);

    if (distance <= radius) {
      return { type: 'office', locationName: loc.name };
    }
  }

  return { type: 'remote', locationName: null };
};

module.exports = { haversineDistance, detectClockType };
