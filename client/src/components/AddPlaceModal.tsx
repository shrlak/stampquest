import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import type { Coords } from '../hooks/useGeolocation';
import { api, ApiError } from '../lib/api';
import { extractGps } from '../lib/exif';
import { photoMatchesTypedPlace } from '../lib/placeLocation';
import { Button } from './Button';
import { StampSVG } from '../art/StampSVG';
import type { GeocodedLocation, Place } from '../types';

export function AddPlaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [locationHint, setLocationHint] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [photoGps, setPhotoGps] = useState<Coords | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName('');
    setLocationHint('');
    setCountry('');
    setDescription('');
    setPhotoGps(null);
    setPhotoName('');
    setPhotoMessage(null);
    setPhotoBusy(false);
    setError(null);
    setBusy(false);
    onClose();
  };

  const readPhotoLocation = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setPhotoName(file.name);
    setPhotoGps(null);
    setPhotoMessage('Reading the photo’s location…');
    setPhotoBusy(true);
    setError(null);
    try {
      const gps = await extractGps(file);
      setPhotoGps(gps);
      setPhotoMessage(
        gps
          ? 'GPS found. We’ll confirm it against the typed place when you create.'
          : 'No embedded GPS found. The typed place will set the coordinates instead.',
      );
    } finally {
      setPhotoBusy(false);
      input.value = '';
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (photoBusy) return;
    setBusy(true);
    setError(null);

    try {
      // Typed resolution always runs. It confirms photo GPS when present,
      // supplies the fallback coordinates, and determines the category.
      const resolved = await api.post<{ location: GeocodedLocation }>('/api/places/geocode', {
        name: name.trim(),
        location: locationHint.trim(),
        country: country.trim(),
        hasPhotoGps: Boolean(photoGps),
      });
      if (photoGps && !photoMatchesTypedPlace(photoGps, resolved.location)) {
        setError(
          'This photo’s GPS does not match the typed place. Check the photo, city or address, and country.',
        );
        setBusy(false);
        return;
      }

      const coordinates = photoGps ?? {
        lat: resolved.location.lat,
        lng: resolved.location.lng,
      };
      const data = await api.post<{ place: Place }>('/api/places', {
        name: name.trim(),
        country: country.trim(),
        description: description.trim(),
        lat: coordinates.lat,
        lng: coordinates.lng,
        category: resolved.location.category,
        state: resolved.location.stateName,
      });
      close();
      navigate(`/place/${data.place.id}`);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'LOCATION_NOT_FOUND'
          ? 'We could not confirm that typed place. Add a clearer city, region, or address and try again.'
          : 'We could not confirm and save this place. Check the details and try again.',
      );
      setBusy(false);
    }
  };

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
                  locked
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
                onChange={(event) => setName(event.target.value)}
                data-testid="place-name"
              />
              <input
                className="input"
                placeholder="City, region, or address"
                required
                maxLength={120}
                value={locationHint}
                onChange={(event) => setLocationHint(event.target.value)}
                data-testid="place-location-hint"
              />
              <input
                className="input"
                placeholder="Country"
                required
                maxLength={60}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
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

              <section
                className="rounded-[22px] border border-white/80 bg-white/72 p-3.5 shadow-sm backdrop-blur-xl"
                data-testid="automatic-location"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-ink text-white">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                      <path d="M12 2a7 7 0 0 1 7 7c0 4.7-5.3 11-6.4 12.2a.8.8 0 0 1-1.2 0C10.3 20 5 13.7 5 9a7 7 0 0 1 7-7Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Automatic location</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                      Photo GPS is used first, then the typed place confirms it and assigns the stamp to Landmarks, Cities, or States.
                    </p>
                  </div>
                </div>

                <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-between rounded-2xl bg-[#fff3e6] px-3.5 text-xs font-semibold text-ink transition-transform active:scale-[0.99]">
                  <span className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-terracotta" aria-hidden>
                      <path d="M8.2 4 9.5 2.5h5L15.8 4H19a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h3.2ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
                    </svg>
                    {photoName || 'Add a visit photo'}
                  </span>
                  <span className="text-terracotta">{photoName ? 'Replace' : 'Choose'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => void readPhotoLocation(event)}
                    disabled={photoBusy || busy}
                    data-testid="place-photo-input"
                  />
                </label>

                <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-black/4 px-3.5 py-3">
                  <div>
                    <p className="text-xs font-semibold">
                      {photoBusy
                        ? 'Reading photo GPS…'
                        : photoGps
                          ? 'Photo GPS ready'
                          : photoName
                            ? 'Typed place fallback ready'
                            : 'Photo optional'}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-ink-soft" data-testid="photo-location-status">
                      {photoMessage ?? 'If no photo is added, the typed place supplies the coordinates.'}
                    </p>
                  </div>
                  <span
                    className={`h-3 w-3 rounded-full ${
                      photoBusy ? 'bg-mustard' : photoGps ? 'bg-olive' : 'bg-ink/18'
                    }`}
                    aria-hidden
                  />
                </div>

                <div className="mt-3 flex items-center justify-between rounded-2xl border border-black/5 px-3.5 py-3">
                  <div>
                    <p className="text-xs font-semibold">Typed confirmation + category</p>
                    <p className="mt-0.5 text-[10px] text-ink-soft">Runs automatically when you create the stamp.</p>
                  </div>
                  <span className="rounded-full bg-teal/9 px-2.5 py-1 text-[9px] font-bold text-teal uppercase">
                    Automatic
                  </span>
                </div>

                <p className="mt-3 text-[10px] leading-relaxed text-ink-soft/75">
                  Photo GPS is read locally. Typed confirmation uses approximate results ©{' '}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    OpenStreetMap contributors
                  </a>
                  .
                </p>
              </section>

              {error && (
                <p
                  className="rounded-lg bg-terracotta/10 px-3 py-2 text-sm text-terracotta"
                  role="alert"
                  data-testid="add-place-error"
                >
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy || photoBusy} data-testid="save-place">
                {busy ? 'Confirming and creating…' : 'Create stamp'}
              </Button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
