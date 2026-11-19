import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ButtonComponent,
  CardSquareComponent,
  DrxBadgeComponent,
  DrxCalendarComponent,
  DrxDataTableComponent,
  InputComponent,
  TextareaComponent,
  type DrxBadgeTone,
  type DrxTableAction,
  type DrxTableColumn,
  type DrxTableQuery,
  type DrxTableRowAction,
  HubIconComponent,
} from '@daruix/hub-ui';
import { Subject, catchError, finalize, of, startWith, switchMap } from 'rxjs';
import Swal from 'sweetalert2';

import {
  QUOTATION_STATUS,
  type QuotationItem,
  type QuotationMap,
  type QuotationMapAction,
  type QuotationMapRow,
  type QuotationOffer,
  type QuotationSupplier,
} from '../../models/mapa-cotacao.model';
import { CotacoesService } from '../../services/cotacoes.service';
import { buildComparisonTree, visibleComparisonRows } from './mapa-composicoes';

const quantityFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });
const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

@Component({
  selector: 'app-mapas-cotacao',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonComponent,
    CardSquareComponent,
    DrxBadgeComponent,
    DrxCalendarComponent,
    DrxDataTableComponent,
    InputComponent,
    TextareaComponent,
    HubIconComponent,
  ],
  templateUrl: './mapas-cotacao.html',
  styleUrl: './mapas-cotacao.scss',
})
export class MapasCotacao {
  displayMapCode(value: string): string {
    return value.replace(/-00$/, '');
  }

  displayRmNumber(value: string): string {
    return value.replace(/^RM-PC(?=\d{5}-\d{3}$)/i, 'RM');
  }

  private readonly cotacoes = inject(CotacoesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh = new Subject<void>();
  private readonly openMap = new Subject<number | null>();
  private readonly supplierSearch = new Subject<string>();

  resendInvitation(supplierId: number): void {
    const map = this.map();
    if (!map || this.busy() || !map.tender_opened_at || map.tender_closed_at) return;
    this.error.set('');
    this.busy.set(true);
    this.cotacoes.resendInvitation(map.id, map.version, supplierId).pipe(finalize(() => this.busy.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.showSuccess('Reenvio solicitado', 'Confira o status do e-mail no sistema.'),
        error: (e: HttpErrorResponse) => this.report(e),
      });
  }

  readonly expandedCompositions = signal<ReadonlySet<string>>(new Set());
  private readonly comparisonTree = computed(() => buildComparisonTree(this.map()?.items ?? []));
  readonly comparisonRows = computed(() =>
    visibleComparisonRows(this.comparisonTree(), this.expandedCompositions()),
  );

  readonly rows = signal<QuotationMapRow[]>([]);
  readonly total = signal(0);
  readonly query = signal<DrxTableQuery | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly dirty = signal(false);
  // Texto livre enquanto o input está focado; modelo mantém decimal sem símbolo de moeda.
  readonly moneyEditing = signal<Record<string, string>>({});
  readonly error = signal('');
  readonly map = signal<QuotationMap | null>(null);
  readonly matches = signal<QuotationSupplier[]>([]);
  readonly supplierTerm = signal('');
  readonly supplierCount = signal(0);
  readonly tenderPending = computed(
    () => !!this.map()?.tender_opened_at && !this.map()?.tender_closed_at,
  );
  readonly tenderDate = signal('');
  readonly tenderTime = signal('');
  readonly tenderDeadline = computed(() => {
    const date = this.tenderDate();
    const time = this.tenderTime().trim();
    return date && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? `${date}T${time}` : '';
  });
  readonly writable = computed(
    () =>
      (this.map()?.status === 'READY' || this.map()?.status === 'DRAFT'),
  );
  readonly status = QUOTATION_STATUS;
  readonly statusTones: Record<QuotationMapRow['status'], DrxBadgeTone> = {
    READY: 'info',
    DRAFT: 'warning',
    FINAL: 'success',
    ORDERED: 'success',
    CANCELLED: 'neutral',
  };

  readonly columns: readonly DrxTableColumn<QuotationMapRow>[] = [
    {
      key: 'code',
      label: 'Mapa',
      value: (row) => this.displayMapCode(row.code),
      filterable: true,
      filter: { type: 'text' },
    },
    { key: 'pc', label: 'PC', value: (row) => row.pc, filterable: true, filter: { type: 'text' } },
    { key: 'rm', label: 'RM', value: (row) => this.displayRmNumber(row.rm), filterable: true, filter: { type: 'text' } },
    {
      key: 'work',
      label: 'Obra',
      value: (row) => row.work,
      filterable: true,
      filter: { type: 'text' },
    },
    {
      key: 'status',
      label: 'Status',
      value: (row) => row.status,
      display: (row) => QUOTATION_STATUS[row.status],
      badge: (row) => ({ label: QUOTATION_STATUS[row.status], tone: this.statusTones[row.status] }),
      filterable: true,
      filter: {
        type: 'select',
        options: Object.entries(QUOTATION_STATUS).map(([value, label]) => ({ value, label })),
      },
    },
  ];

  readonly actions: readonly DrxTableAction<QuotationMapRow>[] = [
    {
      id: 'quote',
      label: 'Montar cotação',
      icon: 'pencil',
      hidden: (row) => row.status !== 'READY',
    },
    { id: 'open', label: 'Abrir mapa', icon: 'eye', hidden: (row) => row.status === 'READY' },
  ];

  constructor() {
    this.refresh
      .pipe(
        startWith(undefined),
        switchMap(() => {
          this.loading.set(true);
          const query = this.query();
          return this.cotacoes
            .listMaps({
              page: query?.page ?? 1,
              pageSize: query?.pageSize ?? 20,
              search: query?.search ?? '',
              filters: query?.filters ?? {},
            })
            .pipe(
              catchError((error) => {
                this.report(error);
                return of(null);
              }),
              finalize(() => this.loading.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        if (!page) return;
        this.rows.set(page.results);
        this.total.set(page.count);
      });

    this.openMap
      .pipe(
        switchMap((id) => {
          this.map.set(null);
          if (id === null) return of(null);
          return this.cotacoes.getMap(id).pipe(
            catchError((error) => {
              this.report(error);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((map) => this.map.set(map ? this.fillOffers(map) : null));

    this.supplierSearch
      .pipe(
        switchMap((search) =>
          this.cotacoes.searchSuppliers(search).pipe(
            catchError((error) => {
              this.report(error);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.matches.set(page?.results ?? []);
        this.supplierCount.set(page?.count ?? 0);
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('mapa');
      this.open(id && /^\d+$/.test(id) ? Number(id) : null);
    });
  }

  updateQuery(query: DrxTableQuery): void {
    this.query.set(query);
    this.refresh.next();
  }

  rowAction(event: DrxTableRowAction<QuotationMapRow>): void {
    this.navigate(event.row.id);
  }

  navigate(id: number | null): void {
    if (this.busy()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mapa: id },
      queryParamsHandling: 'merge',
    });
  }

  toggleComposition(key: string): void {
    this.expandedCompositions.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  private open(id: number | null): void {
    if (this.busy()) return;
    this.error.set('');
    this.matches.set([]);
    this.supplierCount.set(0);
    this.supplierTerm.set('');
    this.dirty.set(false);
    this.moneyEditing.set({});
    this.tenderDate.set('');
    this.tenderTime.set('');
    this.expandedCompositions.set(new Set());
    this.openMap.next(id);
  }

  refreshComparison(): void {
    const current = this.map();
    if (!current || this.busy() || this.dirty()) return;
    this.openMap.next(current.id);
  }

  searchSuppliers(): void {
    this.supplierSearch.next(this.supplierTerm().trim());
  }

  addSupplier(supplier: QuotationSupplier): void {
    const map = this.map();
    if (
      !map ||
      this.tenderPending() ||
      map.quotes.length >= 6 ||
      map.quotes.some((quote) => quote.supplier.id === supplier.id)
    )
      return;
    this.dirty.set(true);
    map.quotes.push({
      supplier: { ...supplier },
      offers: map.items.map((item) => this.emptyOffer(item.id)),
      payment: (supplier.payment_terms ?? '').slice(0, 255),
      delivery: (supplier.delivery_terms ?? '').slice(0, 255),
      quoted_on: null,
      freight: '0',
      discount: '0',
      notes: '',
    });
  }

  applySupplierTerms(quote: QuotationMap['quotes'][number]): void {
    if (!this.writable() || this.busy()) return;
    // Reaplicar é uma escolha explícita: não sobrescreve automaticamente
    // negociações já realizadas no mapa.
    quote.payment = (quote.supplier.payment_terms ?? '').slice(0, 255);
    quote.delivery = (quote.supplier.delivery_terms ?? '').slice(0, 255);
    this.dirty.set(true);
  }

  restoreTenderPrice(offer: QuotationOffer): void {
    if (!offer.tender_unit_price || !this.writable()) return;
    offer.unit_price = offer.tender_unit_price;
    offer.restore_tender = true;
    offer.manual_override = false;
    offer.price_source = 'TENDER';
    this.dirty.set(true);
  }

  editOfferPrice(offer: QuotationOffer, value: string): void {
    offer.unit_price = value;
    offer.restore_tender = false;
    offer.manual_override = !!offer.tender_unit_price;
    offer.price_source = offer.manual_override ? 'ADJUSTED' : 'MANUAL';
    this.dirty.set(true);
  }

  /** Aceita reais digitados sem centavos implícitos: 5 => 5.00, 5,5 => 5.50. */
  private parseMoney(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).replace(/\s|R\$/gi, '').trim();
    if (!raw) return null;
    // vírgula: pt-BR (1.500,25); ponto: decimal ou agrupamento de milhar.
    let normalized: string;
    if (raw.includes(',')) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      normalized = raw.replace(/\./g, '');
    } else {
      normalized = raw;
    }
    if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null;
  }

  moneyFieldValue(key: string, stored: string | null | undefined): string {
    const editing = this.moneyEditing();
    if (Object.prototype.hasOwnProperty.call(editing, key)) return editing[key];
    const decimal = this.parseMoney(stored);
    return decimal === null ? '' : brlFormatter.format(Number(decimal));
  }

  beginMoneyEdit(key: string, stored: string | null | undefined): void {
    if (!this.writable() || this.busy()) return;
    const raw = stored === null || stored === undefined ? '' : String(stored);
    this.moneyEditing.update(current => ({ ...current, [key]: raw }));
  }

  private storeTyping(key: string, typed: string): string | null {
    this.moneyEditing.update(current => ({ ...current, [key]: typed }));
    return this.parseMoney(typed);
  }

  private endMoneyEdit(key: string): void {
    this.moneyEditing.update(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  updateOfferMoney(key: string, offer: QuotationOffer, typed: string): void {
    const decimal = this.storeTyping(key, typed);
    this.editOfferPrice(offer, decimal ?? '');
  }

  blurOfferMoney(key: string, offer: QuotationOffer): void {
    const typed = this.moneyEditing()[key];
    if (typed !== undefined) {
      const decimal = this.parseMoney(typed);
      if (decimal !== this.parseMoney(offer.unit_price)) this.editOfferPrice(offer, decimal ?? '');
    }
    this.endMoneyEdit(key);
  }

  updateQuoteMoney(key: string, quote: QuotationMap['quotes'][number], field: 'freight' | 'discount', typed: string): void {
    const decimal = this.storeTyping(key, typed);
    quote[field] = decimal ?? '';
    this.dirty.set(true);
  }

  blurQuoteMoney(key: string, quote: QuotationMap['quotes'][number], field: 'freight' | 'discount'): void {
    const typed = this.moneyEditing()[key];
    if (typed !== undefined) {
      quote[field] = this.parseMoney(typed) ?? '0.00';
      this.dirty.set(true);
    }
    this.endMoneyEdit(key);
  }

  choose(offer: QuotationOffer): void {
    this.dirty.set(true);
    for (const quote of this.map()?.quotes ?? []) {
      for (const candidate of quote.offers) {
        if (candidate.item_id === offer.item_id) candidate.selected = candidate === offer;
      }
    }
  }

  lowest(itemIndex: number): number | null {
    const prices = (this.map()?.quotes ?? [])
      .map((quote) => quote.offers[itemIndex]?.unit_price)
      .filter((price) => price != null && price !== '')
      .map((price) => Number(price?.replace(',', '.')))
      .filter(Number.isFinite);
    return prices.length ? Math.min(...prices) : null;
  }

  confirmCloseTender(): void {
    const map = this.map();
    if (!map || !this.tenderPending() || this.busy()) return;
    const deadline = map.tender_deadline ? new Date(map.tender_deadline) : null;
    const early = deadline !== null && deadline.getTime() > Date.now();
    const message = early
      ? 'Encerrar o leilão antes do prazo informado aos fornecedores? As propostas já recebidas serão atualizadas e nenhum fornecedor poderá alterar ou enviar novas ofertas. Esta ação não pode ser desfeita.'
      : 'Encerrar e atualizar as propostas recebidas? O envio de novas ofertas será bloqueado.';
    void Swal.fire({
      title: early ? 'Encerrar leilão antecipadamente?' : 'Encerrar leilão reverso?',
      text: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Encerrar leilão',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#c00d0e',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    }).then((result) => {
      if (result.isConfirmed && !this.busy() && this.tenderPending()) {
        this.mutate('close-tender');
      }
    });
  }

  mutate(action: 'save' | QuotationMapAction): void {
    const map = this.map();
    if (!map || this.busy() || (action === 'finalize' && this.dirty())) return;
    const deadline = new Date(this.tenderDeadline());
    if (action === 'publish-tender') {
      if (map.quotes.length < 4 || map.quotes.length > 6) {
        this.showWarning('Fornecedores insuficientes', 'Selecione de 4 a 6 fornecedores antes de publicar o leilão.');
        return;
      }
      const withoutEmail = map.quotes
        .filter(({ supplier }) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email?.trim() ?? ''))
        .map(({ supplier }) => supplier.name);
      if (withoutEmail.length) {
        this.showWarning('E-mail inválido', `Informe um e-mail válido para: ${withoutEmail.join(', ')}.`);
        return;
      }
    }
    if (
      action === 'publish-tender' &&
      (this.dirty() || !Number.isFinite(deadline.getTime()) || deadline <= new Date())
    ) {
      this.showWarning('Prazo inválido', 'Salve as alterações e informe um prazo futuro para publicar.');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    const response =
      action === 'save'
        ? this.cotacoes.saveMap(map.id, {
            version: map.version,
            notes: map.notes,
            quotes: map.quotes.map(({ supplier, ...quote }) => ({
              ...quote,
              supplier_id: supplier.id,
              contact: supplier.contact,
              phone: supplier.phone,
              email: supplier.email,
              quoted_on: quote.quoted_on || null,
              freight: this.decimal(quote.freight) ?? '0',
              discount: this.decimal(quote.discount) ?? '0',
              offers: quote.offers.map((offer) => ({
                ...offer,
                unit_price: this.decimal(offer.unit_price),
                available_quantity: this.decimal(offer.available_quantity),
              })),
            })),
          })
        : this.cotacoes.changeMapState(
            map.id,
            action,
            map.version,
            action === 'publish-tender' ? deadline.toISOString() : undefined,
          );
    response
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.dirty.set(false);
          this.map.set(this.fillOffers(updated));
          this.refresh.next();
          const messages: Record<'save' | QuotationMapAction, string> = {
            save: 'Cotação salva com sucesso.',
            'publish-tender': 'Leilão publicado e convites solicitados.',
            'close-tender': 'Leilão encerrado. Propostas atualizadas.',
            finalize: 'Mapa finalizado com sucesso.',
            'generate-orders': 'Ordens de compra geradas. Confira os resultados.',
          };
          this.showSuccess('Operação concluída', messages[action]);
        },
        error: (error) => this.report(error),
      });
  }

  formatQuantity(value: string): string {
    const amount = Number(value);
    return Number.isFinite(amount) ? quantityFormatter.format(amount) : value;
  }

  formatBrl(value: number | string | null): string {
    if (value === null || value === '') return '—';
    const amount = Number(value);
    return Number.isFinite(amount) ? brlFormatter.format(amount) : '—';
  }

  lineTotal(item: QuotationItem, offer: QuotationOffer): number | null {
    const price = this.decimal(offer.unit_price);
    return price === null ? null : Number(price) * Number(item.quantity) * (item.period ?? 1);
  }

  /** Total individual do fornecedor: itens cotados + frete - desconto.
   * Considera todos os itens, não apenas os selecionados para gerar OC.
   */
  quoteTotal(quote: QuotationMap['quotes'][number]): number {
    const items = this.map()?.items ?? [];
    const subtotal = items.reduce((sum, item, index) => {
      const offer = quote.offers[index];
      if (!offer) return sum;
      return sum + (this.lineTotal(item, offer) ?? 0);
    }, 0);
    const freight = Number(this.parseMoney(quote.freight) ?? 0);
    const discount = Number(this.parseMoney(quote.discount) ?? 0);
    return Math.round((subtotal + freight - discount + Number.EPSILON) * 100) / 100;
  }

  private decimal(value: string | null): string | null {
    return value?.trim().replace(',', '.') || null;
  }

  private fillOffers(map: QuotationMap): QuotationMap {
    for (const quote of map.quotes) {
      const existing = new Map(quote.offers.map((offer) => [offer.item_id, offer]));
      quote.offers = map.items.map((item) => existing.get(item.id) ?? this.emptyOffer(item.id));
    }
    return map;
  }

  private emptyOffer(item_id: number): QuotationOffer {
    return {
      item_id,
      unit_price: null,
      available_quantity: null,
      brand: '',
      notes: '',
      selected: false,
    };
  }

  /** Alertas críticos não dependem mais da posição/rolagem do cabeçalho da tela. */
  private showWarning(title: string, message: string): void {
    this.error.set(message);
    void Swal.fire({
      icon: 'warning', title, text: message,
      confirmButtonText: 'Entendi', confirmButtonColor: '#c00d0e',
    });
  }

  private showSuccess(title: string, message: string): void {
    this.error.set('');
    void Swal.fire({
      toast: true, position: 'top-end', icon: 'success',
      title, text: message, showConfirmButton: false,
      timer: 4200, timerProgressBar: true,
    });
  }

  private showError(message: string): void {
    this.error.set(message);
    void Swal.fire({
      icon: 'error', title: 'Não foi possível concluir a operação', text: message,
      confirmButtonText: 'Fechar', confirmButtonColor: '#c00d0e',
    });
  }

  private report(error: HttpErrorResponse): void {
    const response: unknown = error.error;
    const rawText =
      typeof response === 'string'
        ? response
        : response && typeof response === 'object' && 'text' in response
          ? response.text
          : null;
    if (
      error.headers?.get('content-type')?.includes('text/html') ||
      (typeof rawText === 'string' && /^\s*<(?:!doctype\s+html|html[\s>])/i.test(rawText))
    ) {
      this.showError('A API de cotações retornou uma página HTML. Confira o endereço do BFF ou o proxy do Shell.');
      return;
    }

    const flatten = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (value && typeof value === 'object') return Object.values(value).flatMap(flatten);
      return [];
    };
    const message = (typeof response === 'object' && response !== null && flatten(response).join(' ')) ||
      (typeof response === 'string' && !/^\s*</.test(response) ? response : '') ||
      'Não foi possível concluir a operação.';
    this.showError(message);
  }
}
