export type SupplierCommercialStatus = 'FORNECEDOR' | 'PROSPECTADOR';
export interface SupplierEvaluation {
  score: number | null;
  score_coverage: number;
  [key: string]: unknown;
}
export interface SupplierRegistryEntry {
  status?: SupplierCommercialStatus;
  evaluation?: SupplierEvaluation | null;
  payment_score?: number | null;
  id?: number;
  name: string;
  document: string;
  trade_name: string;
  business_segment: string;
  website: string;
  payment_terms: string;
  delivery_terms: string;
  contact: string;
  phone: string;
  email: string;
  fax: string;
  address: string;
  notes: string;
  active: boolean;
  portal_profile: number | null;
}

export interface SupplierPortalProfile { id: number; name: string; document: string | null; linked_supplier: number | null }
