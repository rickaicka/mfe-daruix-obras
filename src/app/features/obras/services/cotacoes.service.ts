import { HttpBackend, HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { HUB_AUTH_API_URL } from '@daruix/hub-auth';

import type { Page, QuotationListQuery } from '../models/cotacao-api.model';
import type { SupplierPortalProfile, SupplierRegistryEntry } from '../models/fornecedor-cotacao.model';
import type { InvitationLoginResponse, TenderBid, TenderDetail, TenderRow } from '../models/leilao-reverso.model';
import type {
  QuotationMap,
  QuotationMapAction,
  QuotationMapRow,
  QuotationSupplier,
  SaveQuotationMap,
} from '../models/mapa-cotacao.model';

export const QUOTATION_MAP_API = new InjectionToken<string>('Quotation map API', {
  providedIn: 'root',
  factory: () => {
    const apiUrl = inject(HUB_AUTH_API_URL).replace(/\/+$/, '');
    return `${apiUrl}/quotation-maps/`;
  },
});

@Injectable({ providedIn: 'root' })
export class CotacoesService {
  private readonly http = inject(HttpClient);
  // Somente as requisições do portal externo ignoram o interceptor JWT do Hub.
  // O Authorization do fornecedor precisa chegar ao Django sem modificações.
  private readonly invitationHttp = new HttpClient(inject(HttpBackend));
  private readonly baseUrl = inject(QUOTATION_MAP_API).replace(/\/+$/, '') + '/';
  private readonly registryUrl = this.baseUrl + 'supplier-registry/';
  private readonly tenderUrl = this.baseUrl + 'tenders/';

  listMaps(query: QuotationListQuery) {
    let params = new HttpParams().set('page', query.page).set('page_size', query.pageSize);
    if (query.search) params = params.set('search', query.search);
    for (const [key, value] of Object.entries(query.filters)) {
      if (typeof value === 'string' && value) params = params.set(key, value);
    }
    return this.http.get<Page<QuotationMapRow>>(this.baseUrl, { params });
  }

  getMap(id: number) {
    return this.http.get<QuotationMap>(`${this.baseUrl}${id}/`);
  }

  saveMap(id: number, body: SaveQuotationMap) {
    return this.http.patch<QuotationMap>(`${this.baseUrl}${id}/`, body);
  }

  changeMapState(id: number, action: QuotationMapAction, version: number, deadline?: string) {
    const body = deadline === undefined ? { version } : { version, deadline };
    return this.http.post<QuotationMap>(`${this.baseUrl}${id}/${action}/`, body);
  }

  searchSuppliers(search: string) {
    return this.http.get<Page<QuotationSupplier>>(this.baseUrl + 'suppliers/', {
      params: { search, page_size: 20 },
    });
  }

  listSupplierRegistry(search: string, page: number) {
    return this.http.get<Page<SupplierRegistryEntry>>(this.registryUrl, { params: { search, page } });
  }

  searchPortalProfiles(search: string) {
    return this.http.get<Page<SupplierPortalProfile>>(this.registryUrl + 'portal-profiles/', {
      params: { search },
    });
  }

  saveSupplier({ id, ...body }: SupplierRegistryEntry) {
    return id === undefined
      ? this.http.post<SupplierRegistryEntry>(this.registryUrl, body)
      : this.http.patch<SupplierRegistryEntry>(`${this.registryUrl}${id}/`, body);
  }

  resendInvitation(mapId: number, version: number, supplierId: number) {
    return this.http.post<{ detail: string }>(`${this.baseUrl}${mapId}/resend-invitation/`, {
      version, supplier_id: supplierId,
    });
  }

  loginInvitation(username: string, password: string, invitationToken: string) {
    return this.invitationHttp.post<InvitationLoginResponse>(this.baseUrl + 'invitation-login/', {
      username, password, invitation_token: invitationToken,
    });
  }

  invitationTenders(page: number, token: string) {
    return this.invitationHttp.get<Page<TenderRow>>(this.tenderUrl, { headers: { Authorization: `Invitation ${token}` }, params: { page } });
  }

  invitationTender(id: number, token: string) {
    return this.invitationHttp.get<TenderDetail>(`${this.tenderUrl}${id}/`, { headers: { Authorization: `Invitation ${token}` } });
  }

  submitInvitationBid(id: number, bid: TenderBid, token: string) {
    return this.invitationHttp.put<TenderDetail>(`${this.tenderUrl}${id}/bid/`, bid, { headers: { Authorization: `Invitation ${token}` } });
  }

  listTenders(page: number) {
    return this.http.get<Page<TenderRow>>(this.tenderUrl, { params: { page } });
  }

  getTender(id: number) {
    return this.http.get<TenderDetail>(`${this.tenderUrl}${id}/`);
  }

  participate(id: number) {
    return this.http.post<TenderDetail>(`${this.tenderUrl}${id}/participate/`, {});
  }

  sendBid(id: number, body: TenderBid) {
    return this.http.put<TenderDetail>(`${this.tenderUrl}${id}/bid/`, body);
  }
}
