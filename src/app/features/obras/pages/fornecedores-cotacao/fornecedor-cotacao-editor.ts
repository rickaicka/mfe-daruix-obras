import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ButtonComponent, CardSquareComponent, DrxSelectComponent,
  InputComponent, type DrxSelectOption, formatPostalCode,
} from '@daruix/hub-ui';
import { finalize } from 'rxjs';
import type { SupplierPortalProfile, SupplierRegistryEntry } from '../../models/fornecedor-cotacao.model';
import { CotacoesService } from '../../services/cotacoes.service';


type SupplierTextField = { [K in keyof SupplierRegistryEntry]-?: SupplierRegistryEntry[K] extends string ? K : never }[keyof SupplierRegistryEntry];
interface AddressFields {
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}
const emptyAddress = (): AddressFields => ({
  postal_code: '', street: '', number: '', complement: '', district: '', city: '', state: '',
});

@Component({
  standalone: true,
  imports: [ButtonComponent, CardSquareComponent, DrxSelectComponent, InputComponent],
  styleUrl: './fornecedor-cotacao-editor.scss',
  templateUrl: './fornecedor-cotacao-editor.html',
})
export class FornecedorCotacaoEditor {
  private readonly cotacoes = inject(CotacoesService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly draft = signal<SupplierRegistryEntry | null>(null);
  readonly address = signal<AddressFields>(emptyAddress());
  readonly addressChanged = signal(false);
  readonly profiles = signal<SupplierPortalProfile[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly loadingCep = signal(false);
  readonly cepLocated = signal(false);
  readonly cepError = signal('');
  profileSearch = '';

  readonly fields: readonly { key: SupplierTextField; label: string }[] = [
    { key: 'name', label: 'Razão social / nome' },
    { key: 'trade_name', label: 'Nome fantasia' },
    { key: 'document', label: 'CNPJ / CPF' },
    { key: 'contact', label: 'Contato' }, { key: 'phone', label: 'Telefone' },
    { key: 'email', label: 'E-mail' }, { key: 'fax', label: 'Fax' },
    { key: 'business_segment', label: 'Ramo empresarial' },
    { key: 'website', label: 'Site' },
    { key: 'payment_terms', label: 'Condições de pagamento' },
    { key: 'delivery_terms', label: 'Prazo de entrega' },
    { key: 'notes', label: 'Observações' },
  ];

  readonly paymentScoreOptions: readonly DrxSelectOption[] = [
    { value: 'none', label: 'Não avaliado' },
    ...Array.from({ length: 6 }, (_, score) => ({ value: String(score), label: `${score} / 5` })),
  ];

  paymentScore(): string {
    const value = this.draft()?.payment_score;
    return typeof value === 'number' ? String(value) : 'none';
  }

  updatePaymentScore(value: string): void {
    this.draft.update(supplier => supplier ? { ...supplier, payment_score: value === 'none' ? null : Number(value) } : supplier);
  }

  supplierStatus(): string {
    const status = (this.draft() as (SupplierRegistryEntry & {status?: string}) | null)?.status;
    return status === 'FORNECEDOR' ? 'Fornecedor' : status === 'PROSPECTADOR' ? 'Prospectador' : 'Não informado';
  }

  readonly situationOptions: readonly DrxSelectOption[] = [
    { value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' },
  ];
  readonly profileOptions = computed(() => {
    const supplier = this.draft();
    const options = [{ value: 'none', label: 'Sem conta vinculada', disabled: false }];
    for (const profile of this.profiles()) {
      options.push({
        value: String(profile.id),
        label: [profile.name, profile.document].filter(Boolean).join(' · '),
        disabled: profile.linked_supplier !== null && profile.linked_supplier !== supplier?.id,
      });
    }
    const current = supplier?.portal_profile;
    if (current && !options.some(option => option.value === String(current))) {
      options.push({ value: String(current), label: `Perfil atual #${current}`, disabled: false });
    }
    return options;
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || id === 'novo') {
      this.draft.set(this.emptySupplier());
      return;
    }
    const supplied = history.state?.supplier as SupplierRegistryEntry | undefined;
    if (supplied && supplied.id === Number(id)) {
      this.draft.set({ ...supplied });
      this.address.set({ ...emptyAddress(), street: supplied.address });
    } else {
      // O serviço fornecido não expõe ainda um GET por ID. Não carregar dados
      // de outra linha por engano após atualizar uma URL de edição.
      this.error.set('Não foi possível restaurar o fornecedor ao abrir esta URL diretamente. Volte à lista e selecione Editar.');
    }
  }

  private emptySupplier(): SupplierRegistryEntry {
    return { name: '', document: '', trade_name: '', business_segment: '', website: '',
      payment_terms: '', delivery_terms: '', contact: '', phone: '', email: '', fax: '',
      address: '', notes: '', active: true, portal_profile: null };
  }

  updateField(key: SupplierTextField, value: string): void {
    this.draft.update(supplier => supplier ? { ...supplier, [key]: value } : supplier);
  }
  updateActive(value: string): void {
    this.draft.update(supplier => supplier ? { ...supplier, active: value === 'active' } : supplier);
  }
  updateAddress(key: keyof AddressFields, value: string): void {
    this.address.update(current => ({ ...current, [key]: value }));
    this.addressChanged.set(true);
    if (key === 'postal_code') { this.cepLocated.set(false); this.cepError.set(''); }
  }

  consultarCep(): void {
    const postalCode = this.address().postal_code.replace(/\D/g, '');
    if (this.loadingCep()) return;
    if (postalCode.length !== 8) {
      this.cepError.set('Informe um CEP válido com 8 dígitos.');
      this.cepLocated.set(false);
      return;
    }
    this.cepError.set('');
    this.cepLocated.set(false);
    this.loadingCep.set(true);
    this.http.get<{ cep?: string; logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean }>(
      `https://viacep.com.br/ws/${postalCode}/json/`,
    ).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loadingCep.set(false)),
    ).subscribe({
      next: found => {
        if (found.erro) {
          this.cepError.set('CEP não encontrado. Confira os números digitados.');
          return;
        }
        // Nunca sobrescrever número e complemento fornecidos manualmente.
        this.address.update(current => ({
          ...current,
          postal_code: found.cep || formatPostalCode(postalCode),
          street: found.logradouro || current.street,
          district: found.bairro || current.district,
          city: found.localidade || current.city,
          state: (found.uf || current.state).toUpperCase(),
        }));
        this.addressChanged.set(true);
        this.cepLocated.set(true);
      },
      error: () => this.cepError.set('Não foi possível localizar este CEP. Preencha o endereço manualmente.'),
    });
  }

  findProfiles(): void {
    this.error.set('');
    this.cotacoes.searchPortalProfiles(this.profileSearch).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: result => this.profiles.set(result.results),
      error: () => this.error.set('Não foi possível buscar contas de fornecedores.'),
    });
  }
  changeProfile(value: string): void {
    this.draft.update(supplier => supplier ? {
      ...supplier, portal_profile: value === 'none' || !value ? null : Number(value),
    } : supplier);
  }

  private composedAddress(): string {
    const value = this.address();
    const first = [value.street.trim(), value.number.trim()].filter(Boolean).join(', ');
    const locality = [value.district.trim(), value.city.trim(), value.state.trim().toUpperCase()]
      .filter(Boolean).join(' - ');
    const cep = value.postal_code.replace(/\D/g, '');
    return [first, value.complement.trim(), locality, cep ? `CEP ${formatPostalCode(cep)}` : '']
      .filter(Boolean).join(' • ');
  }

  save(): void {
    const supplier = this.draft();
    if (!supplier || this.busy() || this.loadingCep() || !supplier.name.trim()) return;
    const payload: SupplierRegistryEntry = {
      ...supplier,
      address: this.addressChanged() ? this.composedAddress() : supplier.address,
    };
    this.busy.set(true);
    this.error.set('');
    this.cotacoes.saveSupplier(payload).pipe(
      finalize(() => this.busy.set(false)), takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => this.cancel(),
      error: response => this.error.set(
        response.error?.portal_profile?.[0] ?? 'Não foi possível salvar o fornecedor.',
      ),
    });
  }
  cancel(): void {
    void this.router.navigate(['../'], { relativeTo: this.route });
  }
}
