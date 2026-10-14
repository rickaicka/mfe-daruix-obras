export type CompositionItemType = 'SUPPLY' | 'SUBCOMPOSITION' | 'FREE_TEXT';

export type CompositionStatus = 'DRAFT' | 'PUBLISHED' | 'HISTORICAL' | 'ARCHIVED';

export type DataOrigin = 'LEGACY' | 'HUB';

export interface ServiceCompositionApiItem {
  id: number;
  item_type: CompositionItemType;
  supply: number | null;
  subcomposition: number | null;
  description_snapshot: string;
  unit_snapshot: string;
  coefficient: string;
  material_unit_price: string;
  labor_unit_price: string;
  equipment_unit_price: string;
  position: number;
  subtotal: string;
}

export interface ServiceCompositionApiVersion {
  id: number;
  number: number;
  status: CompositionStatus;
  origin: DataOrigin;
  unit: string;
  material_total: string;
  labor_total: string;
  equipment_total: string;
  total: string;
  imported_at: string | null;
  published_at: string | null;
  items: ServiceCompositionApiItem[];
}

export interface ServiceCompositionAutocomplete {
  id: number;
  origin: DataOrigin;
  legacy_id: number | null;
  code: string;
  name: string;
  is_active: boolean;
  latest_version: ServiceCompositionApiVersion | null;
  created_at: string;
  updated_at: string;
}
