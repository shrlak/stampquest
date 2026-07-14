import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { useGeo } from '../hooks/useGeolocation';
import { api } from '../lib/api';
import { Button } from './Button';
import { StampSVG } from '../art/StampSVG';
import type { Place } from '../types';

export function AddPlaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { position, error: geoError, loading: locating, request } = useGeo();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName('');
    setCountry('');
    setDescription('');
    setManual(false);
    setLat('');
    setLng('');
    setError(null);
    setBusy(false);
    onClose();
  };

  const coords = manual
    ? { lat: Number(lat), lng: Number(lng) }
    : position
      ? { lat: position.lat, lng: position.lng }
      : null;
  const coordsValid =
    coords !== null &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    (!manual || (lat.trim() !== '' && lng.trim() !== '')) &&
    Math.abs(coords.lat) <= 90 &&
    Math.abs(coords.lng) <= 180;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!coordsValid) {
      setError('Set a location first — use your current position or enter coordinates.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ place: Place }>('/api/places', {
        name: name.trim(),
        country: country.trim(),
        description: description.trim(),
        lat: coords.lat,
        lng: coords.lng,
      });
      close();
      navigate(`/place/${data.place.id}`);
    } catch {
      setError('Could not save the place. Check the fields and try again.');
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            key="sheet"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            data-testid="add-place-modal"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15" />
            <div className="mb-4 flex items-center justify-between">
              <h1 className="font-display text-2xl">Add a place</h1>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-ink-soft active:bg-ink/5"
              >
                ×
              </button>
            </div>

            {/* live preview: hashed on the name pre-save, so the final stamp's
                palette (hashed on the real id) may differ — that's fine */}
            <motion.div
              className="mx-auto mb-6 w-32 rotate-2"
              initial={{ opacity: 0, scale: 0.85, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 2 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              <StampSVG
                subject={{
                  id: name.trim() || 'preview-stamp',
                  name: name.trim() || 'Your place',
                  country: country.trim() || 'Somewhere',
                }}
                className="w-full drop-shadow-[0_3px_6px_rgba(47,42,36,0.2)]"
              />
            </motion.div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                className="input"
                placeholder="Place name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="place-name"
              />
              <input
                className="input"
                placeholder="Country"
                required
                maxLength={60}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                data-testid="place-country"
              />
              <textarea
                className="input py-2.5"
                placeholder="What makes it special? (optional)"
                rows={2}
                maxLength={400}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <div className="rounded-xl border border-ink/10 bg-paper-light p-3">
                {!manual ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={request}
                      disabled={locating}
                      data-testid="use-my-location"
                    >
                      {locating
                        ? 'Locating…'
                        : position
                          ? `Using your location (${position.lat.toFixed(4)}, ${position.lng.toFixed(4)})`
                          : 'Use my current location'}
                    </Button>
                    {geoError && <p className="mt-2 text-sm text-terracotta">{geoError}</p>}
                  </>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className="input"
                      placeholder="Latitude"
                      inputMode="decimal"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      data-testid="manual-lat"
                    />
                    <input
                      className="input"
                      placeholder="Longitude"
                      inputMode="decimal"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      data-testid="manual-lng"
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="mt-2 text-xs text-ink-soft underline underline-offset-2"
                  onClick={() => setManual(!manual)}
                >
                  {manual ? 'Use my current location instead' : 'Enter coordinates manually'}
                </button>
              </div>

              {error && (
                <p className="rounded-lg bg-terracotta/10 px-3 py-2 text-sm text-terracotta" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy} data-testid="save-place">
                {busy ? 'Saving…' : 'Create stamp'}
              </Button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
