import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DrxDataTableComponent, type DrxTableAction, type DrxTableColumn,
  type DrxTableQuery, type DrxTableRowAction,
} from '@daruix/hub-ui';
import { finalize } from 'rxjs';
import type { SupplierRegistryEntry } from '../../models/fornecedor-cotacao.model';
import { CotacoesService } from '../../services/cotacoes.service';

@Component({
  standalone: true,
  imports: [DrxDataTableComponent],
  templateUrl: './fornecedores-cotacao.html',
  styleUrl: './fornecedores-cotacao.scss',
})
export class FornecedoresCotacao {
  private readonly cotacoes = inject(CotacoesService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly rows = signal<SupplierRegistryEntry[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly search = signal('');

  readonly columns: readonly DrxTableColumn<SupplierRegistryEntry>[] = [
    { key: 'name', label: 'Fornecedor', value: row => row.name },
    { key: 'document', label: 'Documento', value: row => row.document },
    { key: 'contact', label: 'Contato', value: row => row.contact },
    { key: 'commercial_status', label: 'Classificação', value: row => this.commercialStatus(row),
      badge: row => ({ label: this.commercialStatus(row), tone: this.commercialStatus(row) === 'Fornecedor' ? 'success' : 'warning' }) },
    { key: 'evaluation', label: 'Pontuação', value: row => this.scoreLabel(row) },
    { key: 'active', label: 'Status', value: row => row.active ? 'Ativo' : 'Inativo',
      badge: row => ({ label: row.active ? 'Ativo' : 'Inativo', tone: row.active ? 'success' : 'neutral' }) },
  ];
  commercialStatus(row: SupplierRegistryEntry): string {
    const status = (row as SupplierRegistryEntry & {status?: string}).status;
    return status === 'FORNECEDOR' ? 'Fornecedor' : status === 'PROSPECTADOR' ? 'Prospectador' : 'Não informado';
  }

  scoreLabel(row: SupplierRegistryEntry): string {
    const evaluation = (row as SupplierRegistryEntry & {evaluation?: Record<string, unknown>}).evaluation;
    if (!evaluation) return 'Sem avaliação';
    const score = evaluation['score'];
    const coverage = evaluation['score_coverage'];
    return typeof score === 'number' ? `${score.toFixed(1)} / 100${typeof coverage === 'number' ? ` (cobertura ${coverage}%)` : ''}` : 'Sem dados';
  }

  readonly actions: readonly DrxTableAction<SupplierRegistryEntry>[] = [
    { id: 'edit', label: 'Editar', icon: 'pencil', disabled: () => this.busy() },
  ];

  constructor() { this.load(1); }

  load(page: number): void {
    this.busy.set(true);
    this.error.set('');
    this.cotacoes.listSupplierRegistry(this.search(), page).pipe(
      finalize(() => this.busy.set(false)), takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: result => { this.rows.set(result.results); this.total.set(result.count); this.page.set(page); },
      error: () => this.error.set('Não foi possível carregar os fornecedores.'),
    });
  }

  newSupplier(): void {
    void this.router.navigate(['fornecedores-cotacao', 'novo'], { relativeTo: this.relativeRoot() });
  }

  edit(supplier: SupplierRegistryEntry): void {
    void this.router.navigate(['fornecedores-cotacao', supplier.id], {
      relativeTo: this.relativeRoot(), state: { supplier },
    });
  }

  // Navegação relativa à rota de Obras (pai da listagem).
  private relativeRoot() { return this.route.parent!; }
  private readonly route = inject(ActivatedRoute);

  updateQuery(query: DrxTableQuery): void {
    this.search.set(query.search);
    this.load(query.page);
  }
  rowAction(event: DrxTableRowAction<SupplierRegistryEntry>): void {
    if (event.action.id === 'edit') this.edit(event.row);
  }
}
