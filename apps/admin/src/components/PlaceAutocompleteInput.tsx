import { useEffect, useRef } from 'react';
import { loadGoogleMaps } from '../lib/googleMaps';

export interface PlaceResult { description: string; lat: number; lng: number }

// Usa la Autocomplete clásica de Places (no la nueva PlaceAutocompleteElement):
// Google la marcó "legacy" en 2025 pero sigue funcionando y su tipado es mucho
// más completo en @types/google.maps — más confiable que integrar el nuevo
// web component a mano dentro de React.
export function PlaceAutocompleteInput({
  value, onChange, onPlaceSelected, placeholder, types,
}: {
  value: string;
  onChange: (v: string) => void;
  onPlaceSelected: (place: PlaceResult) => void;
  placeholder?: string;
  types?: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !inputRef.current || autocompleteRef.current) return;
      const ac = new g.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'mx' },
        fields: ['formatted_address', 'geometry', 'name'],
        types,
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return; // el usuario tecleó/dio Enter sin elegir una sugerencia real
        const description = place.formatted_address || place.name || '';
        onChange(description);
        onPlaceSelected({ description, lat: loc.lat(), lng: loc.lng() });
      });
      autocompleteRef.current = ac;
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', border: '1px solid #d9e1db', background: '#f8faf8', borderRadius: 8, padding: '11px 13px', fontSize: 14, color: '#263238' }}
    />
  );
}
