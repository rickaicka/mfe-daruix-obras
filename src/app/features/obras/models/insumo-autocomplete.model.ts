export interface SupplyAutocomplete {
  id: number;
  origin: 'LEGACY' | 'HUB';
  description: string;
  full_description: string | null;
  specification: string | null;
  supply_type: string;
  unit: string;
  unit_measure: number | null;
  unit_measure_name: string | null;
  unit_measure_abbreviation: string | null;
  material_group: number | null;
  material_group_name: string | null;
}
