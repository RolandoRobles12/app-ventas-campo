import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Producto, type Vendedor } from './api';
import { calcularRango, type RangoPreset } from './lib/dateRanges';

interface FiltersState {
  productos: Producto[];
  vendedores: Vendedor[];
  vendedoresFiltrados: Vendedor[];
  // Ids de producto/vendedor elegidos (selección múltiple); [] = "todos".
  fProductos: string[];
  fVendedores: string[];
  setFProductos: (ids: string[]) => void;
  setFVendedores: (ids: string[]) => void;
  fRango: RangoPreset;
  setFRango: (r: RangoPreset) => void;
  fDesdePersonalizado: string | null;
  fHastaPersonalizado: string | null;
  setFDesdePersonalizado: (d: string | null) => void;
  setFHastaPersonalizado: (d: string | null) => void;
  // desde/hasta ya resueltos (YYYY-MM-DD, ambos inclusive) — null si es
  // "personalizado" y todavía no se han elegido las dos fechas.
  fDesde: string | null;
  fHasta: string | null;
  reload: () => void;
}

const FiltersContext = createContext<FiltersState | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [fProductos, setFProductosState] = useState<string[]>([]);
  const [fVendedores, setFVendedoresState] = useState<string[]>([]);
  const [fRango, setFRango] = useState<RangoPreset>('todo');
  const [fDesdePersonalizado, setFDesdePersonalizado] = useState<string | null>(null);
  const [fHastaPersonalizado, setFHastaPersonalizado] = useState<string | null>(null);

  const reload = () => {
    api.productos().then(setProductos).catch(() => {});
    api.vendedores().then(setVendedores).catch(() => {});
  };

  useEffect(reload, []);

  const vendedoresFiltrados = fProductos.length ? vendedores.filter((v) => fProductos.includes(v.productoId)) : vendedores;
  const rango = calcularRango(fRango, fDesdePersonalizado, fHastaPersonalizado);

  // Al cambiar los productos elegidos, se quitan de la selección de
  // vendedores los que ya no pertenezcan a ninguno de esos productos.
  const setFProductos = (ids: string[]) => {
    setFProductosState(ids);
    if (ids.length) {
      setFVendedoresState((prev) => prev.filter((vid) => {
        const v = vendedores.find((x) => x.id === vid);
        return v && ids.includes(v.productoId);
      }));
    }
  };

  return (
    <FiltersContext.Provider value={{
      productos, vendedores, vendedoresFiltrados, fProductos, fVendedores,
      setFProductos,
      setFVendedores: setFVendedoresState,
      fRango, setFRango,
      fDesdePersonalizado, fHastaPersonalizado, setFDesdePersonalizado, setFHastaPersonalizado,
      fDesde: rango?.desde ?? null, fHasta: rango?.hasta ?? null,
      reload,
    }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters(): FiltersState {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters debe usarse dentro de FiltersProvider');
  return ctx;
}
