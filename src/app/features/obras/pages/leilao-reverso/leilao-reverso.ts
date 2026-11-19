import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonComponent, InputComponent } from '@daruix/hub-ui';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { CotacoesService } from '../../services/cotacoes.service';
import type { TenderBid, TenderDetail, TenderRow } from '../../models/leilao-reverso.model';

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonComponent, InputComponent],
  styleUrl: './leilao-reverso.scss',
  templateUrl: './leilao-reverso.html',
})
export class LeilaoReverso {
  private readonly cotacoes = inject(CotacoesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  readonly invitationUsername = signal('');
  readonly invitationPassword = signal('');
  readonly invitationToken = signal('');
  readonly invitationAccess = signal('');
  readonly supplierName = signal('');
  readonly supplierEmail = signal('');
  readonly sessionUsername = signal('');
  readonly sessionExpiresAt = signal('');
  readonly showPassword = signal(false);
  readonly rows = signal<TenderRow[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly detail = signal<TenderDetail | null>(null);
  readonly draft = signal<TenderBid | null>(null);
  // Entradas ainda em edição para atualizar o resumo antes do blur.
  readonly moneyPreview = signal<Record<string, string>>({});
  readonly busy = signal(false);
  readonly error = signal('');

  // O prazo é contado a partir da CRIAÇÃO da OC, nunca da proposta.
  readonly deliveryDays = signal('');
  readonly deliveryDayType = signal<'BUSINESS' | 'CALENDAR'>('CALENDAR');

  private restoreDelivery(value: string | null | undefined): void {
    const match = /^(\d+)\s+dias?\s+(úteis|uteis|corridos)$/i.exec((value ?? '').trim());
    this.deliveryDays.set(match ? match[1] : '');
    this.deliveryDayType.set(
      match?.[2].toLowerCase().startsWith('ú') || match?.[2].toLowerCase().startsWith('u')
        ? 'BUSINESS'
        : 'CALENDAR',
    );
  }

  readonly paymentOptions = [
    'À vista',
    'Antecipado',
    '7 DDL',
    '14 DDL',
    '21 DDL',
    '28 DDL',
    '30 DDL',
    '35 DDL',
    '42 DDL',
    '45 DDL',
    '60 DDL',
    '90 DDL',
    '28/35 DDL',
    '30/60 DDL',
    '30/60/90 DDL',
    '28 DFM',
  ] as readonly string[];

  private readonly quantityFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });

  /** Quantidade decimal da API sem zeros finais; unidade permanece inalterada. */
  formatQuantity(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const amount = Number(String(value).trim().replace(',', '.'));
    return Number.isFinite(amount) ? this.quantityFormatter.format(amount) : String(value);
  }

  private readonly brl = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /** Valor decimal da API -> texto em reais; não altera os dados enviados ao servidor. */
  formatMoney(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const normalized = String(value).replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0 ? this.brl.format(number) : '';
  }

  /** Ao focar, mostra reais editáveis, sem deslocamento automático de centavos. */
  beginMoneyEdit(event: FocusEvent, value: string | number | null | undefined): void {
    const input = event.target as HTMLInputElement;
    if (value === null || value === undefined || value === '') {
      input.value = '';
    } else {
      const number = Number(String(value).replace(',', '.'));
      input.value = Number.isFinite(number) ? String(number).replace('.', ',') : '';
    }
    input.select();
  }

  /** Aceita 5, 50, 5,50, 1500,25, 1.500,25 e valores decimais da API. */
  private parseMoneyInput(raw: string): string | null {
    let text = raw.replace(/\s|R\$/gi, '').trim();
    if (!text) return null;
    if (!/^[0-9.,]+$/.test(text)) return null;
    const comma = text.lastIndexOf(',');
    const dot = text.lastIndexOf('.');
    if (comma >= 0) {
      // Pontos anteriores à vírgula representam milhares (padrão brasileiro).
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (dot >= 0) {
      const parts = text.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        // 1.500 -> 1500; 1.500.000 -> 1500000
        text = text.replace(/\./g, '');
      }
    }
    if (!/^\d+(?:\.\d{0,2})?$/.test(text)) return null;
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0 || amount > 999999999999.99) return null;
    return amount.toFixed(2);
  }

  /** Mantém a máscara de blur e recalcula o total durante a digitação. */
  onMoneyInput(event: Event, key: string): void {
    const raw = (event.target as HTMLInputElement).value;
    this.moneyPreview.update((current) => ({ ...current, [key]: raw }));
  }

  private clearMoneyPreview(key: string): void {
    this.moneyPreview.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** Converte tanto valores numéricos da API quanto texto em edição. */
  private moneyNumber(value: string | number | null | undefined, key: string): number {
    const preview = this.moneyPreview();
    if (Object.prototype.hasOwnProperty.call(preview, key)) {
      return Number(this.parseMoneyInput(preview[key]) ?? 0);
    }
    if (value === null || value === undefined || value === '') return 0;
    const number = Number(String(value).trim().replace(',', '.'));
    return Number.isFinite(number) ? number : 0;
  }

  /** Soma os itens cotados (quantidade × preço unitário × período, quando houver). */
  quotationSubtotal(bid: TenderBid, tender: TenderDetail): number {
    return tender.items.reduce((total, item) => {
      const offer = bid.offers.find((row) => row.item_id === item.id);
      if (!offer) return total;
      const quantity = Number(String(item.quantity).replace(',', '.'));
      const period = item.period ?? 1;
      const unitPrice = this.moneyNumber(offer.unit_price, 'offer:' + item.id);
      return total + (Number.isFinite(quantity) ? quantity : 0) * period * unitPrice;
    }, 0);
  }

  quotationFreight(bid: TenderBid): number {
    return this.moneyNumber(bid.freight, 'freight');
  }

  quotationDiscount(bid: TenderBid): number {
    return this.moneyNumber(bid.discount, 'discount');
  }

  quotationTotal(bid: TenderBid, tender: TenderDetail): number {
    return (
      this.quotationSubtotal(bid, tender) + this.quotationFreight(bid) - this.quotationDiscount(bid)
    );
  }

  /** Permite exibir inclusive resultados negativos sem ocultar a moeda. */
  formatTotal(value: number): string {
    return this.brl.format(value);
  }

  /** Atualiza o modelo e formata apenas quando o campo perde o foco. */
  updateOfferMoney(event: FocusEvent, bid: TenderBid, index: number): void {
    const input = event.target as HTMLInputElement;
    const offer = bid.offers[index];
    if (!offer) return;
    const value = this.parseMoneyInput(input.value);
    offer.unit_price = value;
    this.clearMoneyPreview('offer:' + offer.item_id);
    input.value = this.formatMoney(value);
  }

  updateTermsMoney(event: FocusEvent, bid: TenderBid, field: 'freight' | 'discount'): void {
    const input = event.target as HTMLInputElement;
    const value = this.parseMoneyInput(input.value) ?? '0.00';
    bid[field] = value;
    this.clearMoneyPreview(field);
    input.value = this.formatMoney(value);
  }

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('mapa');
      const token = params.get('convite') ?? '';
      if (token !== this.invitationToken()) {
        // Um convite reenviado invalida a sessão anterior. Nunca reutilizar seu token.
        if (this.invitationAccess()) this.logout();
        this.invitationToken.set(token);
      }
      if (this.invitationAccess()) {
        if (id && /^\d+$/.test(id)) this.open(Number(id));
        else this.load(1);
      }
    });
  }

  loginInvitation(): void {
    this.run(
      this.cotacoes.loginInvitation(
        this.invitationUsername(),
        this.invitationPassword(),
        this.invitationToken(),
      ),
      (response) => {
        this.invitationAccess.set(response.access_token);
        this.supplierName.set(response.supplier_name ?? 'Fornecedor');
        this.supplierEmail.set(response.supplier_email ?? '');
        this.sessionUsername.set(this.invitationUsername());
        this.sessionExpiresAt.set(response.expires_at ?? '');
        this.invitationPassword.set('');
        this.open(response.quotation_id);
      },
    );
  }

  logout(): void {
    this.invitationAccess.set('');
    this.invitationPassword.set('');
    this.sessionUsername.set('');
    this.supplierName.set('');
    this.supplierEmail.set('');
    this.sessionExpiresAt.set('');
    this.detail.set(null);
    this.draft.set(null);
    this.moneyPreview.set({});
    this.deliveryDays.set('');
    this.deliveryDayType.set('CALENDAR');
    this.rows.set([]);
    this.error.set('');
  }

  initials(): string {
    const parts = (this.supplierName() ?? '').trim().split(/\s+/).filter(Boolean);
    return (
      parts.length ? parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '') : 'F'
    ).toUpperCase();
  }

  load(page: number): void {
    this.run(this.cotacoes.invitationTenders(page, this.invitationAccess()), (result) => {
      this.rows.set(result.results ?? []);
      this.total.set(result.count ?? 0);
      this.page.set(page);
    });
  }

  back(): void {
    this.detail.set(null);
    this.draft.set(null);
    this.moneyPreview.set({});
    this.deliveryDays.set('');
    this.load(this.page());
  }

  open(id: number): void {
    this.run(this.cotacoes.invitationTender(id, this.invitationAccess()), (result) =>
      this.show(result),
    );
  }

  send(id: number, draft: TenderBid): void {
    const days = this.deliveryDays().trim();
    if (!/^[1-9]\d{0,3}$/.test(days)) {
      this.error.set('Informe um prazo de entrega válido, de 1 a 9999 dias.');
      return;
    }
    const delivery = `${Number(days)} dias ${this.deliveryDayType() === 'BUSINESS' ? 'úteis' : 'corridos'}`;
    const decimal = (value: string | null | undefined) =>
      value?.toString().trim().replace(',', '.') || null;
    const body = {
      ...draft,
      delivery,
      quoted_on: null, // Preenchido exclusivamente pelo BFF na submissão.
      freight: decimal(draft.freight) ?? '0',
      discount: decimal(draft.discount) ?? '0',
      offers: draft.offers
        .filter((offer) => decimal(offer.unit_price) !== null)
        .map((offer) => ({
          item_id: offer.item_id,
          unit_price: decimal(offer.unit_price),
          available_quantity: null,
          brand: '',
          notes: offer.notes,
        })),
    };
    if (!body.offers.length) {
      this.error.set('Informe um preço para pelo menos um item.');
      return;
    }
    this.run(this.cotacoes.submitInvitationBid(id, body, this.invitationAccess()), (result) =>
      this.show(result),
    );
  }

  private show(result: TenderDetail): void {
    // A consulta já terminou; o formulário carregado não deve permanecer bloqueado.
    this.busy.set(false);
    this.moneyPreview.set({});
    const own = result.own_offer;
    this.restoreDelivery(own?.delivery);
    const offers = new Map((own?.offers ?? []).map((offer) => [offer.item_id, offer]));
    this.detail.set(result);
    this.draft.set({
      payment: '',
      delivery: '',
      quoted_on: null,
      freight: '0',
      discount: '0',
      notes: '',
      ...own,
      offers: (result.items ?? []).map(
        (item) =>
          offers.get(item.id) ?? {
            item_id: item.id,
            unit_price: null,
            available_quantity: null,
            brand: '',
            notes: '',
          },
      ),
    });
  }

  private run<T>(request: Observable<T>, success: (result: T) => void): void {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        // Libera a próxima requisição ANTES do callback. No login, o callback chama
        // open(quotation_id), que também utiliza run() e precisa iniciar imediatamente.
        this.busy.set(false);
        success(result);
      },
      error: (response: HttpErrorResponse) => {
        this.busy.set(false);
        if (response.status === 401 && this.invitationAccess()) this.logout();
        const detail = response.error?.detail;
        this.error.set(
          typeof detail === 'string'
            ? detail
            : 'Não foi possível concluir a operação. Verifique o convite ou tente novamente.',
        );
      },
    });
  }

  updateDeliveryDays(value: string | number | null | undefined): void {
    this.deliveryDays.set(value == null ? '' : String(value));
  }
}
