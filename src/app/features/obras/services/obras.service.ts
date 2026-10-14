import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin, map, type Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { HubModule, PaginatedResponse } from '../models/hub-shared.model';
import { DrxAutocompletePage } from '@daruix/hub-ui';
import { SupplyAutocomplete } from '../models/insumo-autocomplete.model';
import { GrupoMaterial, TipoInsumo, UnidadeMedida } from '../models/insumo.model';
import {
  CompositionItemType,
  ServiceCompositionAutocomplete,
} from '../models/service-composition.model';

export type CompositionItemCatalogOption =
  | {
      id: number;
      kind: 'SUBCOMPOSITION';
      composition: ServiceCompositionAutocomplete;
      supply: null;
    }
  | {
      id: number;
      kind: 'SUPPLY';
      composition: null;
      supply: SupplyAutocomplete;
    };

export interface ServiceCompositionWriteItem {
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
}

export interface ServiceCompositionWritePayload {
  code: string;
  name: string;
  is_active: boolean;
  unit: string;
  items: ServiceCompositionWriteItem[];
}

@Injectable({ providedIn: 'root' })
export class ObrasService {
  private readonly httpClient = inject(HttpClient);

  listarTodosInsumos(
    term: string,
    page = 1,
    pageSize = 20,
  ): Observable<DrxAutocompletePage<SupplyAutocomplete>> {
    const params = new HttpParams()
      .set('search', term.trim())
      .set('is_active', 'true')
      .set('page', page)
      .set('page_size', pageSize);

    return this.httpClient
      .get<PaginatedResponse<SupplyAutocomplete>>(
        `${environment.apiUrl}/budgeting/supplies/autocomplete/`,
        { params },
      )
      .pipe(map((response) => this.toAutocompletePage(response)));
  }

  buscarInsumoServicoExato(term: string): Observable<SupplyAutocomplete | null> {
    const normalizedTerm = this.normalizeCatalogName(term);
    const params = new HttpParams()
      .set('search', term.trim())
      .set('supply_type', 'SERVICE')
      .set('is_active', 'true')
      .set('page', 1)
      .set('page_size', 50);

    return this.httpClient
      .get<PaginatedResponse<SupplyAutocomplete>>(
        `${environment.apiUrl}/budgeting/supplies/autocomplete/`,
        { params },
      )
      .pipe(
        map(
          (response) =>
            response.results.find(
              (supply) =>
                this.normalizeCatalogName(supply.description) === normalizedTerm ||
                this.normalizeCatalogName(supply.specification ?? '') === normalizedTerm,
            ) ?? null,
        ),
      );
  }

  searchByName(
    term: string,
    page = 1,
    pageSize = 20,
  ): Observable<DrxAutocompletePage<ServiceCompositionAutocomplete>> {
    const params = new HttpParams()
      .set('search', term.trim())
      .set('is_active', 'true')
      .set('page', page)
      .set('page_size', pageSize);

    return this.httpClient
      .get<PaginatedResponse<ServiceCompositionAutocomplete> | ServiceCompositionAutocomplete[]>(
        `${environment.apiUrl}/budgeting/service-compositions/`,
        { params },
      )
      .pipe(map((response) => this.toAutocompletePage(response)));
  }

  searchCompositionItemCatalog(
    term: string,
    page = 1,
    pageSize = 20,
  ): Observable<DrxAutocompletePage<CompositionItemCatalogOption>> {
    const sizePerCatalog = Math.max(1, Math.ceil(pageSize / 2));

    return forkJoin({
      compositions: this.searchByName(term, page, sizePerCatalog),
      supplies: this.listarTodosInsumos(term, page, sizePerCatalog),
    }).pipe(
      map(({ compositions, supplies }) => {
        const compositionOptions: CompositionItemCatalogOption[] = compositions.items.map(
          (composition) => ({
            id: composition.id,
            kind: 'SUBCOMPOSITION',
            composition,
            supply: null,
          }),
        );

        const supplyOptions: CompositionItemCatalogOption[] = supplies.items.map((supply) => ({
          // IDs negativos evitam colisão com os IDs das composições.
          id: -supply.id,
          kind: 'SUPPLY',
          composition: null,
          supply,
        }));

        const items = [...compositionOptions, ...supplyOptions].sort((first, second) => {
          const firstLabel =
            first.kind === 'SUBCOMPOSITION' ? first.composition.name : first.supply.description;
          const secondLabel =
            second.kind === 'SUBCOMPOSITION' ? second.composition.name : second.supply.description;

          return firstLabel.localeCompare(secondLabel, 'pt-BR');
        });

        return {
          items,
          hasMore: compositions.hasMore || supplies.hasMore,
          total:
            (compositions.total ?? compositions.items.length) +
            (supplies.total ?? supplies.items.length),
        };
      }),
    );
  }

  getComposition(compositionId: number): Observable<ServiceCompositionAutocomplete> {
    return this.httpClient.get<ServiceCompositionAutocomplete>(
      `${environment.apiUrl}/budgeting/service-compositions/${compositionId}/`,
    );
  }

  createComposition(
    payload: ServiceCompositionWritePayload,
  ): Observable<ServiceCompositionAutocomplete> {
    return this.httpClient.post<ServiceCompositionAutocomplete>(
      `${environment.apiUrl}/budgeting/service-compositions/`,
      payload,
    );
  }

  updateComposition(
    compositionId: number,
    payload: ServiceCompositionWritePayload,
  ): Observable<ServiceCompositionAutocomplete> {
    return this.httpClient.patch<ServiceCompositionAutocomplete>(
      `${environment.apiUrl}/budgeting/service-compositions/${compositionId}/`,
      payload,
    );
  }

  updateFavorite(menuItemSlug: string, favorito: boolean): Observable<HubModule> {
    return this.httpClient.patch<HubModule>(
      `${environment.apiUrl}/hub/funcionalidades/${menuItemSlug}/favorito/`,
      { favorito },
    );
  }

  listarUnidades(): Observable<UnidadeMedida[]> {
    return this.httpClient.get<UnidadeMedida[]>(
      `${environment.apiUrl}/budgeting/measurement-units/`,
    );
  }

  listarGrupos(): Observable<GrupoMaterial[]> {
    return this.httpClient.get<GrupoMaterial[]>(`${environment.apiUrl}/budgeting/material-groups/`);
  }

  listarTipos(): Observable<TipoInsumo[]> {
    return this.httpClient.get<TipoInsumo[]>(`${environment.apiUrl}/budgeting/supply-types/`);
  }

  private toAutocompletePage<T>(response: PaginatedResponse<T> | T[]): DrxAutocompletePage<T> {
    if (Array.isArray(response)) {
      return { items: response, hasMore: false, total: response.length };
    }

    return {
      items: response.results,
      hasMore: response.next !== null,
      total: response.count,
    };
  }

  private normalizeCatalogName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleUpperCase('pt-BR');
  }
}
