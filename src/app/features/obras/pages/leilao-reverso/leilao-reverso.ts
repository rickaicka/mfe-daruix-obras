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
  readonly busy = signal(false);
  readonly error = signal('');

  readonly paymentOptions = [
    'À vista', 'Antecipado', '7 DDL', '14 DDL', '21 DDL', '28 DDL',
    '30 DDL', '35 DDL', '42 DDL', '45 DDL', '60 DDL', '90 DDL',
    '28/35 DDL', '30/60 DDL', '30/60/90 DDL', '28 DFM',
  ] as const;

  private readonly brl = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
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

  /** Atualiza o modelo e formata apenas quando o campo perde o foco. */
  updateOfferMoney(event: FocusEvent, bid: TenderBid, index: number): void {
    const input = event.target as HTMLInputElement;
    const offer = bid.offers[index];
    if (!offer) return;
    const value = this.parseMoneyInput(input.value);
    offer.unit_price = value;
    input.value = this.formatMoney(value);
  }

  updateTermsMoney(event: FocusEvent, bid: TenderBid, field: 'freight' | 'discount'): void {
    const input = event.target as HTMLInputElement;
    const value = this.parseMoneyInput(input.value) ?? '0.00';
    bid[field] = value;
    input.value = this.formatMoney(value);
  }

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
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
    this.run(this.cotacoes.loginInvitation(
      this.invitationUsername(), this.invitationPassword(), this.invitationToken(),
    ), response => {
      this.invitationAccess.set(response.access_token);
      this.supplierName.set(response.supplier_name ?? 'Fornecedor');
      this.supplierEmail.set(response.supplier_email ?? '');
      this.sessionUsername.set(this.invitationUsername());
      this.sessionExpiresAt.set(response.expires_at ?? '');
      this.invitationPassword.set('');
      this.open(response.quotation_id);
    });
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
    this.rows.set([]);
    this.error.set('');
  }

  initials(): string {
    const parts = (this.supplierName() ?? '').trim().split(/\s+/).filter(Boolean);
    return (parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')) : 'F').toUpperCase();
  }

  load(page: number): void {
    this.run(this.cotacoes.invitationTenders(page, this.invitationAccess()), result => {
      this.rows.set(result.results ?? []);
      this.total.set(result.count ?? 0);
      this.page.set(page);
    });
  }

  back(): void {
    this.detail.set(null);
    this.draft.set(null);
    this.load(this.page());
  }

  open(id: number): void {
    this.run(this.cotacoes.invitationTender(id, this.invitationAccess()), result => this.show(result));
  }

  send(id: number, draft: TenderBid): void {
    const decimal = (value: string | null | undefined) => value?.toString().trim().replace(',', '.') || null;
    const body = {
      ...draft, quoted_on: null, // Preenchido exclusivamente pelo BFF na submissão.
      freight: decimal(draft.freight) ?? '0', discount: decimal(draft.discount) ?? '0',
      offers: draft.offers.filter(offer => decimal(offer.unit_price) !== null).map(offer => ({
        item_id: offer.item_id, unit_price: decimal(offer.unit_price),
        available_quantity: null, brand: '', notes: offer.notes,
      })),
    };
    if (!body.offers.length) {
      this.error.set('Informe um preço para pelo menos um item.');
      return;
    }
    this.run(this.cotacoes.submitInvitationBid(id, body, this.invitationAccess()), result => this.show(result));
  }

  private show(result: TenderDetail): void {
    // A consulta já terminou; o formulário carregado não deve permanecer bloqueado.
    this.busy.set(false);
    const own = result.own_offer;
    const offers = new Map((own?.offers ?? []).map(offer => [offer.item_id, offer]));
    this.detail.set(result);
    this.draft.set({
      payment: '', delivery: '', quoted_on: null, freight: '0', discount: '0', notes: '',
      ...own,
      offers: (result.items ?? []).map(item => offers.get(item.id) ?? {
        item_id: item.id, unit_price: null, available_quantity: null, brand: '', notes: '',
      }),
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
        this.error.set(typeof detail === 'string' ? detail : 'Não foi possível concluir a operação. Verifique o convite ou tente novamente.');
      },
    });
  }
}
