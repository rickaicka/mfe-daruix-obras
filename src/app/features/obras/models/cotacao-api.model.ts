export interface Page<T> {
  count: number;
  results: T[];
}

export interface QuotationListQuery {
  page: number;
  pageSize: number;
  search: string;
  filters: Readonly<Record<string, string>>;
}
