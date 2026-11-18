export const QUOTATION_STATUS = {
  READY: 'Pronto para cotar',
  DRAFT: 'Em cotação',
  FINAL: 'Finalizado',
  ORDERED: 'Ordens geradas',
  CANCELLED: 'Cancelado',
};

export interface QuotationMapRow {
  id: number;
  code: string;
  pc: string;
  work: string;
  rm: string;
  status: keyof typeof QUOTATION_STATUS;
}

export interface QuotationSupplier {
  id: number;
  name: string;
  document: string;
  contact: string;
  phone: string;
  email: string;
  fax: string;
  payment_terms?: string;
  delivery_terms?: string;
}

export interface QuotationComposition {
  key: string;
  label: string;
}

export interface QuotationItem {
  composition_path?: QuotationComposition[];
  id: number;
  stage: string;
  description: string;
  unit: string;
  quantity: string;
  period: number | null;
  period_unit: string;
  notes: string;
}

export interface QuotationOffer {
  item_id: number;
  unit_price: string | null;
  available_quantity: string | null;
  brand: string;
  notes: string;
  selected: boolean;
  price_source?: 'MANUAL' | 'TENDER' | 'ADJUSTED';
  tender_unit_price?: string | null;
  tender_updated_at?: string | null;
  manual_override?: boolean;
  restore_tender?: boolean;
}

export interface SupplierQuote {
  // Data da proposta individual do fornecedor.
  supplier: QuotationSupplier;
  offers: QuotationOffer[];
  payment: string;
  delivery: string;
  quoted_on: string | null;
  freight: string;
  discount: string;
  notes: string;
  manual_terms_payment?: boolean;
  manual_terms_delivery?: boolean;
}

export interface QuotationOrder {
  id: number;
  code: string;
  supplier_snapshot: QuotationSupplier;
  total: string;
  lines: (QuotationItem & { unit_price: string; total: string })[];
}

export interface QuotationMap extends QuotationMapRow {
  buyer: { id: number; name: string } | null;
  version: number;
  tender_opened_at: string | null;
  tender_closed_at: string | null;
  tender_deadline: string | null;
  notes: string;
  items: QuotationItem[];
  quotes: SupplierQuote[];
  orders: QuotationOrder[];
}


export interface SaveQuotationMap {
  version: number;
  notes: string;
  quotes: (Omit<SupplierQuote, 'supplier'> & {
    supplier_id: number;
    contact: string;
    phone: string;
    email: string;
  })[];
}

export type QuotationMapAction = 'finalize' | 'generate-orders' | 'publish-tender' | 'close-tender';
