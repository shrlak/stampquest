export interface User {
  id: number;
  username: string;
  createdAt: string;
  photoUrl: string | null;
}

export interface Stats {
  stampCount: number;
  countryCount: number;
}

export interface Stamp {
  id: string;
  placeId: string;
  collectedAt: string;
  distanceM: number | null;
  /** The user's own photo of the place — the stamp art. Null until they add one. */
  photoUrl: string | null;
}

export type PlaceCategory = 'landmark' | 'city' | 'us-state';

export interface Place {
  id: string;
  name: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
  isCurated: boolean;
  isMine: boolean;
  artKey: string | null;
  category: PlaceCategory;
  createdAt: string;
  stamp: Stamp | null;
}
