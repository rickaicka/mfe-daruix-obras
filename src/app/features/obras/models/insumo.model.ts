export interface UnidadeMedida {
  id: number;
  legacy_id: number;
  nome: string;
  sigla: string;
}

export interface GrupoMaterial {
  id: number;
  legacy_id: number;
  nome: string;
}

export type TipoInsumoValue = 'MATERIAL' | 'SERVICE' | 'LABOR' | 'EQUIPMENT' | 'OTHER';

export interface TipoInsumo {
  value: TipoInsumoValue;
  label: string;
}

export interface Insumo {
  description: string;
  full_description: string;
  supply_type: string;
  unit: string;
  unit_measure: number;
  material_group: number;
  specification: string;
  is_active: boolean;
}
