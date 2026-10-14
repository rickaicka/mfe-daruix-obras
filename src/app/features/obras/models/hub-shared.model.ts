import { Component } from '@angular/core';
import { HubModulo } from '@daruix/hub-auth';

export type HubModule = HubModulo;
export type HubMenuItem = HubModule & {
  favoritavel?: boolean;
  modulo_nome?: string;
  modulo_slug?: string;
};

export interface FavoriteMenuItem {
  item: HubMenuItem;
  module: HubModule;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type AutocompleteApiResponse<T> = PaginatedResponse<T> | readonly T[];

export interface AutocompletePage<T> {
  items: readonly T[];
  hasMore: boolean;
  total?: number;
}
