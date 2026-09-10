import { useEffect, useRef, useState, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, MapPin, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { FieldError, Input } from '../ui/input';
import { friendlyError } from '../../utils/errors';
import type { PinnedLocation } from '../../types/app.types';

// Metro Manila default (product home turf); the user can search or pan anywhere.
const HOME: [number, number] = [14.5995, 120.9842];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© OpenStreetMap contributors';

interface Props {
  initial?: PinnedLocation | null;
  onConfirm: (loc: PinnedLocation) => void;
  onClose: () => void;
}

function shortenPlaceName(displayName: string): string {
  const parts = displayName
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 3).join(', ') || displayName;
}

function nameFromAddress(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null;
  const a = address as Record<string, string | undefined>;
  const bits = [
    a.amenity ?? a.leisure ?? a.shop ?? a.road,
    a.neighbourhood ?? a.suburb ?? a.village ?? a.town ?? a.city,
    a.city ?? a.town ?? a.municipality ?? a.state,
  ].filter((b): b is string => Boolean(b));
  const unique = [...new Set(bits)];
  return unique.length > 0 ? unique.slice(0, 3).join(', ') : null;
}

async function searchPlaces(query: string): Promise<PinnedLocation[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error('Search failed. Check your connection and try again.');
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows
    .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
    .map((r) => ({ name: shortenPlaceName(r.display_name), lat: Number(r.lat), lng: Number(r.lon) }));
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
  );
  if (!res.ok) throw new Error('Reverse lookup failed.');
  const row = (await res.json()) as { address?: unknown; display_name?: string };
  return (
    nameFromAddress(row.address) ??
    (row.display_name ? shortenPlaceName(row.display_name) : null) ??
    'Pinned location'
  );
}

function placePin(map: L.Map, prev: L.CircleMarker | null, lat: number, lng: number): L.CircleMarker {
  if (prev) prev.remove();
  return L.circleMarker([lat, lng], {
    radius: 9,
    color: '#181817',
    weight: 3,
    fillColor: '#B6D83B',
    fillOpacity: 1,
  }).addTo(map);
}

export function LocationPicker({ initial, onConfirm, onClose }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinRef = useRef<L.CircleMarker | null>(null);
  const [draft, setDraft] = useState<PinnedLocation | null>(initial ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PinnedLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true }).setView(
      initial ? [initial.lat, initial.lng] : HOME,
      initial ? 15 : 12,
    );
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    if (initial) pinRef.current = placePin(map, null, initial.lat, initial.lng);

    const onClick = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      pinRef.current = placePin(map, pinRef.current, lat, lng);
      setLocating(true);
      setError(null);
      try {
        const name = await reverseGeocode(lat, lng);
        setDraft({ name, lat, lng });
      } catch {
        // Offline reverse lookup: keep the pin with a generic name so saving
        // still works; the user can rename it in the text field.
        setDraft({ name: 'Pinned location', lat, lng });
      } finally {
        setLocating(false);
      }
    };
    map.on('click', onClick);
    // Settle tiles after the sheet mounts.
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      map.off('click', onClick);
      map.remove();
      mapRef.current = null;
    };
    // Mount-once map lifecycle; callbacks use refs + functional setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError(null);
    try {
      const found = await searchPlaces(q);
      setResults(found);
      if (found.length === 0) setError('No places found — try another search, or tap the map.');
    } catch (err) {
      setError(friendlyError(err, 'Search failed. Try again.'));
    } finally {
      setSearching(false);
    }
  };

  const pickResult = (loc: PinnedLocation) => {
    const map = mapRef.current;
    if (map) {
      map.setView([loc.lat, loc.lng], 15);
      pinRef.current = placePin(map, pinRef.current, loc.lat, loc.lng);
    }
    setDraft(loc);
    setResults([]);
    setQuery('');
  };

  return (
    <div className="pick-overlay" role="dialog" aria-modal="true" aria-label="Pick a location">
      <div className="pick-panel">
        <button className="backlink" onClick={onClose} style={{ marginBottom: 12 }}>
          <ArrowLeft size={16} /> PICK A LOCATION
        </button>
        <form onSubmit={onSearch} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Input
            placeholder="Search for a place..."
            aria-label="Search for a place"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" variant="dark" size="sm" disabled={searching} aria-label="Search">
            <Search size={16} />
          </Button>
        </form>
        <FieldError message={error} />
        {results.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {results.map((r) => (
              <button
                key={`${r.lat},${r.lng}`}
                type="button"
                className="pick-result"
                onClick={() => pickResult(r)}
              >
                <MapPin size={15} style={{ flexShrink: 0, color: 'var(--muted)' }} />
                {r.name}
              </button>
            ))}
          </div>
        )}
        <div ref={mapEl} className="pick-map" />
        <p className="small muted" style={{ margin: '10px 2px 0' }}>
          {locating ? 'Locating…' : draft ? draft.name : 'Tap the map to drop a pin.'}
        </p>
        <div style={{ marginTop: 12 }}>
          <Button
            variant="green"
            size="block"
            disabled={!draft || locating}
            onClick={() => {
              if (draft) onConfirm(draft);
            }}
          >
            Confirm location
          </Button>
        </div>
      </div>
    </div>
  );
}
