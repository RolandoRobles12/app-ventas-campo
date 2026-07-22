import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Producto, type Vendedor } from './api';
import { calcularRango, type RangoPreset } from './lib/dateRanges';

export const TODOS_PRODUCTOS = 'Todos los productos';
export const TODOS_VENDEDORES = 'Todos los vendedores';

interface FiltersState {
  productos: Producto[];
  vendedores: Vendedor[];
  vendedoresFiltrados: Vendedor[];
  fProducto: string;
  fVendedor: string;
  setFProducto: (p: string) => void;
  setFVendedor: (v: string) => void;
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
  const [fProducto, setFProducto] = useState(TODOS_PRODUCTOS);
  const [fVendedor, setFVendedor] = useState(TODOS_VENDEDORES);
  const [fRango, setFRango] = useState<RangoPreset>('todo');
  const [fDesdePersonalizado, setFDesdePersonalizado] = useState<string | null>(null);
  const [fHastaPersonalizado, setFHastaPersonalizado] = useState<string | null>(null);

  const reload = () => {
    api.productos().then(setProductos).catch(() => {});
    api.vendedores().then(setVendedores).catch(() => {});
  };

  useEffect(reload, []);

  const vendedoresFiltrados = fProducto === TODOS_PRODUCTOS ? vendedores : vendedores.filter((v) => v.producto === fProducto);
  const rango = calcularRango(fRango, fDesdePersonalizado, fHastaPersonalizado);

  return (
    <FiltersContext.Provider value={{
      productos, vendedores, vendedoresFiltrados, fProducto, fVendedor,
      setFProducto: (p) => { setFProducto(p); setFVendedor(TODOS_VENDEDORES); },
      setFVendedor,
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
