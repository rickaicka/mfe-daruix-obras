export interface InvitationLoginResponse {
  access_token: string;
  token_type: 'Invitation';
  quotation_id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_email: string;
  expires_at: string;
}
export interface TenderRow {
  id: number;
  code: string;
  pc: string;
  reference_date: string;
  delivery_date: string | null;
  deadline: string;
  open: boolean;
}
export interface TenderItem {
  id: number;
  description: string;
  quantity: string;
  unit: string;
  period: number | null;
  period_unit: string;
  complementary_observation?: string | null;
}
export interface TenderOffer { item_id: number; unit_price: string | null; available_quantity: string | null; brand: string; notes: string }
export interface TenderBid {
  offers: TenderOffer[];
  payment: string;
  delivery: string;
  quoted_on: string | null;
  freight: string;
  discount: string;
  notes: string;
}
export interface TenderDetail extends TenderRow { items: TenderItem[]; participating: boolean; own_offer: TenderBid | null }
