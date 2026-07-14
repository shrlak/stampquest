import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { useGeo, type Coords } from '../hooks/useGeolocation';
import { api, ApiError } from '../lib/api';
import { extractGps } from '../lib/exif';
import { Button } from './Button';
import { StampSVG } from '../art/StampSVG';
import type { GeocodedLocation, Place } from '../types';

type CoordinateSource = 'photo' | 'search' | 'saved';

interface CoordinateChoice {
  coords: Coords;
  source: CoordinateSource;
  label: string;
  provider?: GeocodedLocation['source'];
}

const validCoords = (coords: Coords | null) =>
  coords !== null &&
  Number.isFinite(coords.lat) &&
  Number.isFinite(coords.lng) &&
  Math.abs(coords.lat) <= 90 &&
  Math.abs(coords.lng) <= 180;

export function AddPlaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { position } = useGeo();
  const [name, setName] = useState('');
  const [locationHint, setLocationHint] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [choice, setChoice] = useState<CoordinateChoice | null>(null);
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName('');
    setLocationHint('');
    setCountry('');
    setDescription('');
    setChoice(null);
    setManual(false);
    setLat('');
    setLng('');
    setPhotoName('');
    setPhotoMessage(null);
    setPhotoBusy(false);
    setLocationBusy(false);
    setError(null);
    setBusy(false);
    onClose();
  };

  const invalidateSearchChoice = () => {
    if (choice?.source === 'search') setChoice(null);
  };

  const manualCoords =
    manual && lat.trim() !== '' && lng.trim() !== ''
      ? { lat: Number(lat), lng: Number(lng) }
      : null;
  const selectedCoords = manual ? manualCoords : (choice?.coords ?? null);
  const coordsValid = validCoords(selectedCoords);

  const resolveTypedLocation = async (): Promise<CoordinateChoice | null> => {
    if (!name.trim() || !country.trim()) {
      setError('Add a place name and country before finding its location.');
      return null;
    }
    setLocationBusy(true);
    setError(null);
    try {
      const data = await api.post<{ location: GeocodedLocation }>('/api/places/geocode', {
        name: name.trim(),
        location: locationHint.trim(),
        country: country.trim(),
      });
      const next: CoordinateChoice = {
        coords: { lat: data.location.lat, lng: data.location.lng },
        source: 'search',
        label: data.location.label,
        provider: data.location.source,
      };
      setChoice(next);
      setManual(false);
      setPhotoMessage(null);
      return next;
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'LOCATION_NOT_FOUND'
          ? 'We could not find that place. Add a city, region, or address—or enter coordinates manually.'
          : 'Location lookup is unavailable right now. Try a photo with GPS or enter coordinates manually.',
      );
      return null;
    } finally {
      setLocationBusy(false);
    }
  };

  const usePhotoLocation = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setPhotoName(file.name);
    setPhotoMessage('Reading the photo’s location…');
    setPhotoBusy(true);
    setError(null);
    if (choice?.source === 'photo') setChoice(null);
    try {
      const gps = await extractGps(file);
      if (!gps) {
        setPhotoMessage('No GPS data was found in this photo. Try the typed lookup below.');
        return;
      }
      setChoice({
        coords: gps,
        source: 'photo',
        label: `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`,
      });
      setManual(false);
      setPhotoMessage('Photo GPS found. The image stays on your device.');
    } finally {
      setPhotoBusy(false);
      input.value = '';
    }
  };

  const useSavedLocation = () => {
    if (!position) return;
    setChoice({
      coords: position,
      source: 'saved',
      label: `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`,
    });
    setManual(false);
    setPhotoMessage(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (manual && !coordsValid) {
      setError('Enter valid latitude and longitude values.');
      return;
    }

    setBusy(true);
    setError(null);
    let finalCoords = coordsValid ? selectedCoords : null;
    if (!finalCoords) {
      const found = await resolveTypedLocation();
      finalCoords = found?.coords ?? null;
    }
    if (!finalCoords) {
      setBusy(false);
      return;
    }

    try {
      const data = await api.post<{ place: Place }>('/api/places', {
        name: name.trim(),
        country: country.trim(),
        description: description.trim(),
        lat: finalCoords.lat,
        lng: finalCoords.lng,
      });
      close();
      navigate(`/place/${data.place.id}`);
    } catch {
      setError('Could not save the place. Check the fields and try again.');
      setBusy(false);
    }
  };

  const sourceTitle = manual
    ? 'Manual coordinates'
    : choice?.source === 'photo'
      ? 'Photo location found'
      : choice?.source === 'search'
        ? choice.provider === 'catalog'
          ? 'Matched in StampQuest'
          : 'Approximate place match'
        : choice?.source === 'saved'
          ? 'Current GPS selected'
          : 'Choose how to locate it';
  const sourceDetail = manual
    ? lat.trim() && lng.trim()
      ? `${lat}, ${lng}`
      : 'Enter latitude and longitude below'
    : choice?.label ?? 'Use a photo, search the place name, or choose another option.';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            key="sheet"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[91vh] w-full max-w-md overflow-y-auto rounded-t-[34px] bg-[linear-gradient(160deg,#ffffff_0%,#f7f9fc_54%,#fff8eb_100%)] px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-[0_-24px_70px_rgba(18,23,38,0.18)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            data-testid="add-place-modal"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="eyebrow text-teal">Create your own</p>
                <h1 className="mt-1 font-display text-[26px]">Add a place</h1>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-ink-soft active:bg-ink/5"
              >
                ×
              </button>
            </div>

            <motion.div
              className="relative mx-auto mb-6 flex min-h-[178px] w-full items-center justify-center overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#dbeeff,#fff1d6)]"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              <div className="pointer-events-none absolute -right-10 -bottom-12 h-36 w-36 rounded-full border-[24px] border-white/30" />
              <div className="w-32 rotate-2">
                <StampSVG
                  subject={{
                    id: name.trim() || 'preview-stamp',
                    name: name.trim() || 'Your place',
                    country: country.trim() || 'Somewhere',
                  }}
                  locked={false}
                  className="w-full drop-shadow-[0_12px_20px_rgba(24,32,52,0.2)]"
                />
              </div>
            </motion.div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                className="input"
                placeholder="Place name"
                required
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  invalidateSearchChoice();
                }}
                data-testid="place-name"
              />
              <input
                className="input"
                placeholder="City, region, or address"
                maxLength={120}
                value={locationHint}
                onChange={(event) => {
                  setLocationHint(event.target.value);
                  invalidateSearchChoice();
                }}
                data-testid="place-location-hint"
              />
              <input
                className="input"
                placeholder="Country"
                required
                maxLength={60}
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  invalidateSearchChoice();
                }}
                data-testid="place-country"
              />
              <textarea
                className="input py-2.5"
                placeholder="What makes it special? (optional)"
                rows={2}
                maxLength={400}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />

              <section className="rounded-[22px] border border-white/80 bg-white/72 p-3.5 shadow-sm backdrop-blur-xl">
                <div
                  className={`flex items-center gap-3 rounded-[17px] px-3.5 py-3 ${
                    coordsValid ? 'bg-olive/10' : 'bg-black/4'
                  }`}
                  data-testid="location-resolution"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      coordsValid ? 'bg-olive text-white' : 'bg-black/8 text-ink-soft'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" aria-hidden>
                      <path d="M12 2a7 7 0 0 1 7 7c0 4.7-5.3 11-6.4 12.2a.8.8 0 0 1-1.2 0C10.3 20 5 13.7 5 9a7 7 0 0 1 7-7Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{sourceTitle}</span>
                    <span className="block truncate text-xs text-ink-soft">{sourceDetail}</span>
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#fff3e6] px-3 text-center text-xs font-semibold text-ink transition-transform active:scale-[0.98]">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-terracotta" aria-hidden>
                      <path d="M8.2 4 9.5 2.5h5L15.8 4H19a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h3.2ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
                    </svg>
                    {photoBusy ? 'Reading…' : 'Use photo GPS'}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => void usePhotoLocation(event)}
                      disabled={photoBusy || busy}
                      data-testid="place-photo-input"
                    />
                  </label>
                  <button
                    type="button"
                    className="min-h-12 rounded-2xl bg-ink px-3 text-xs font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
                    onClick={() => void resolveTypedLocation()}
                    disabled={locationBusy || busy || !name.trim() || !country.trim()}
                    data-testid="lookup-location"
                  >
                    {locationBusy ? 'Finding…' : 'Find typed place'}
                  </button>
                </div>

                {photoMessage && (
                  <p className="mt-2.5 text-xs leading-relaxed text-ink-soft" data-testid="photo-location-status">
                    {photoName ? `${photoName}: ` : ''}{photoMessage}
                  </p>
                )}

                {position && (
                  <button
                    type="button"
                    className="mt-3 text-xs font-semibold text-teal underline underline-offset-2"
                    onClick={useSavedLocation}
                    data-testid="use-my-location"
                  >
                    Use my current saved GPS
                  </button>
                )}
                <button
                  type="button"
                  className={`${position ? 'ml-4' : 'mt-3'} text-xs text-ink-soft underline underline-offset-2`}
                  onClick={() => {
                    const next = !manual;
                    setManual(next);
                    if (next) setChoice(null);
                    setError(null);
                  }}
                >
                  {manual ? 'Use automatic location instead' : 'Enter coordinates manually'}
                </button>

                {manual && (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="input"
                      placeholder="Latitude"
                      inputMode="decimal"
                      value={lat}
                      onChange={(event) => setLat(event.target.value)}
                      data-testid="manual-lat"
                    />
                    <input
                      className="input"
                      placeholder="Longitude"
                      inputMode="decimal"
                      value={lng}
                      onChange={(event) => setLng(event.target.value)}
                      data-testid="manual-lng"
                    />
                  </div>
                )}

                <p className="mt-3 text-[10px] leading-relaxed text-ink-soft/75">
                  Typed lookup uses approximate search results ©{' '}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    OpenStreetMap contributors
                  </a>
                  . No autocomplete or background searches.
                </p>
              </section>

              {error && (
                <p className="rounded-lg bg-terracotta/10 px-3 py-2 text-sm text-terracotta" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy || photoBusy || locationBusy} data-testid="save-place">
                {busy ? 'Saving…' : 'Create stamp'}
              </Button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
