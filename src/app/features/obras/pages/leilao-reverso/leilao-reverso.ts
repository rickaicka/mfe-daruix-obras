import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonComponent, InputComponent, CardSquareComponent } from '@daruix/hub-ui';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { CotacoesService } from '../../services/cotacoes.service';
import type { TenderBid, TenderDetail, TenderRow } from '../../models/leilao-reverso.model';

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonComponent, InputComponent, CardSquareComponent],
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

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('mapa');
      const token = params.get('convite') ?? '';
      this.invitationToken.set(token);
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
      this.supplierName.set(response.supplier_name);
      this.supplierEmail.set(response.supplier_email);
      this.sessionUsername.set(this.invitationUsername());
      this.sessionExpiresAt.set(response.expires_at);
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
    const parts = this.supplierName().trim().split(/\s+/).filter(Boolean);
    return (parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')) : 'F').toUpperCase();
  }

  load(page: number): void {
    this.run(this.cotacoes.invitationTenders(page, this.invitationAccess()), result => {
      this.rows.set(result.results);
      this.total.set(result.count);
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
    const decimal = (value: string | null) => value?.trim().replace(',', '.') || null;
    const body = {
      ...draft, quoted_on: draft.quoted_on || null,
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
    const offers = new Map(own?.offers.map(offer => [offer.item_id, offer]));
    this.detail.set(result);
    this.draft.set({
      payment: '', delivery: '', quoted_on: null, freight: '0', discount: '0', notes: '',
      ...own,
      offers: result.items.map(item => offers.get(item.id) ?? {
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
        this.error.set(response.error?.detail ?? 'Convite expirado, credenciais inválidas ou campos incorretos.');
      },
    });
  }
}
