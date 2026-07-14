import type { Coords } from '../hooks/useGeolocation';
import type { GeocodedLocation, PlaceCategory } from '../types';
import { haversineMeters } from './geo';

const CONFIRMATION_RADIUS_M: Record<PlaceCategory, number> = {
  landmark: 25_000,
  city: 100_000,
  'us-state': 1_500_000,
};

/** Confirms that photo GPS is compatible with the place resolved from text. */
export function photoMatchesTypedPlace(photo: Coords, typed: GeocodedLocation): boolean {
  if (typed.bounds) {
    // A small margin handles photos taken just outside a mapped boundary.
    const margin = 0.08;
    const inLatitude =
      photo.lat >= typed.bounds.south - margin && photo.lat <= typed.bounds.north + margin;
    const inLongitude =
      typed.bounds.west <= typed.bounds.east
        ? photo.lng >= typed.bounds.west - margin && photo.lng <= typed.bounds.east + margin
        : photo.lng >= typed.bounds.west - margin || photo.lng <= typed.bounds.east + margin;
    return inLatitude && inLongitude;
  }

  return (
    haversineMeters(photo.lat, photo.lng, typed.lat, typed.lng) <=
    CONFIRMATION_RADIUS_M[typed.category]
  );
}
