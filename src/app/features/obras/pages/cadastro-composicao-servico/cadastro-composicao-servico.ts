import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { disabled, form, required } from '@angular/forms/signals';

import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import {
  ButtonComponent,
  InputComponent,
  DrxSelectComponent,
  CardSquareComponent,
  DrxAutocompleteComponent,
  type DrxAutocompleteSearch,
  DrxEditableCommitOnEnterDirective,
  DrxEditableEditorDefDirective,
  DrxEditableCellDefDirective,
  DrxEditableTreeCellDefDirective,
  DrxEditableNextOnEnterDirective,
  DrxEditableTableComponent,
  DrxSidenavComponent,
  type DrxEditableTreeNode,
  type DrxEditableTableKey,
  type DrxEditableRowExpansion,
  type DrxEditableTreeExpansion,
  type DrxEditableTableColumn,
  type DrxEditableValidationErrors,
  HubIconComponent,
} from '@daruix/hub-ui';
import { finalize, firstValueFrom, map } from 'rxjs';

import { HubSessionService } from '@daruix/hub-auth';

import { type CompositionItemCatalogOption, ObrasService } from '../../services/obras.service';

import { SupplyAutocomplete } from '../../models/insumo-autocomplete.model';

import {
  CompositionItemType,
  ServiceCompositionApiItem,
  ServiceCompositionAutocomplete,
  ServiceCompositionGroup,
  ServiceCompositionGroupNode,
} from '../../models/service-composition.model';

import { BrlCurrencyPipe } from '../../../../shared/pipes/brl-currency.pipe';

type ComposicaoDadosForm = {
  id: string;
};

type CompositionActionMode = 'EDIT_EXISTING' | 'CREATE_NEW';

type ItemChangeType = 'unchanged' | 'inserted' | 'updated';

const NEW_COMPOSITION_OPTION_ID = -1;

interface CompositionItemDraft {
  supply: SupplyAutocomplete | null;
  subcomposition: ServiceCompositionAutocomplete | null;
  quantity: number | null;
  unitValue: number | null;
  materialUnitPrice: number | null;
  laborUnitPrice: number | null;
  equipmentUnitPrice: number;
}

interface CompositionItem {
  clientId: string;
  id: number | null;
  itemType: CompositionItemType;
  supply: SupplyAutocomplete | null;
  subcomposition: ServiceCompositionAutocomplete | null;
  subcompositionId: number | null;
  description: string;
  unit: string;
  quantity: number;
  unitValue: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  equipmentUnitPrice: number;
  total: number;
  changeType: ItemChangeType;
}

@Component({
  selector: 'app-cadastro-composicao-servico',

  imports: [
    ButtonComponent,
    InputComponent,
    DrxSelectComponent,
    CardSquareComponent,
    DrxAutocompleteComponent,
    DrxEditableCommitOnEnterDirective,
    DrxEditableEditorDefDirective,
    DrxEditableCellDefDirective,
    DrxEditableTreeCellDefDirective,
    DrxEditableNextOnEnterDirective,
    DrxEditableTableComponent,
    DrxSidenavComponent,
    HubIconComponent,
    BrlCurrencyPipe,
  ],

  templateUrl: './cadastro-composicao-servico.html',

  styleUrl: './cadastro-composicao-servico.scss',
})
export class CadastroComposicaoServico {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authStore = inject(HubSessionService);

  private readonly obrasService = inject(ObrasService);

  private readonly router = inject(Router);

  private readonly activatedRoute = inject(ActivatedRoute);

  readonly compositionGroups = signal<ServiceCompositionGroup[]>([]);
  readonly compositionGroupTree = signal<ServiceCompositionGroupNode[]>([]);
  readonly selectedGroupId = signal<number | null>(null);
  readonly groupsLoading = signal(false);
  readonly groupsBusy = signal(false);
  readonly expandedGroupIds = signal<ReadonlySet<number>>(new Set());

  readonly compositionGroupRows = computed(() => {
    const rows: { node: ServiceCompositionGroupNode; depth: number }[] = [];
    const visit = (nodes: ServiceCompositionGroupNode[], depth: number) => {
      for (const node of nodes) {
        rows.push({ node, depth });
        if (this.expandedGroupIds().has(node.id)) visit(node.children, depth + 1);
      }
    };
    visit(this.compositionGroupTree(), 0);
    return rows;
  });

  readonly groupPanelOpen = signal(false);
  readonly groupEditorOpen = signal(false);
  readonly editingGroupId = signal<number | null>(null);
  readonly groupFormCode = signal('');
  readonly groupFormName = signal('');
  readonly groupFormParentId = signal<number | null>(null);
  readonly groupSelectOptions = computed(() => this.compositionGroups().map(group => ({
    value: String(group.id), label: `${group.code} — ${group.name}`,
  })));
  readonly groupParentOptions = computed(() => {
    const forbidden = new Set<number>();
    const gather = (nodes: ServiceCompositionGroupNode[], blocked = false) => {
      for (const node of nodes) {
        const nowBlocked = blocked || node.id === this.editingGroupId();
        if (nowBlocked) forbidden.add(node.id);
        gather(node.children, nowBlocked);
      }
    };
    gather(this.compositionGroupTree());
    return this.compositionGroups().filter(item => !forbidden.has(item.id)).map(group => ({
      value: String(group.id), label: `${group.code} — ${group.name}`,
    }));
  });

  readonly selectedGroupLabel = computed(() => {
    const group = this.compositionGroups().find((item) => item.id === this.selectedGroupId());
    return group ? `${group.code} — ${group.name}` : 'Sem grupo';
  });

  toggleGroup(id: number): void {
    this.expandedGroupIds.update((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  private refreshCompositionGroups(): void {
    this.groupsLoading.set(true);
    this.obrasService.getCompositionGroupTree()
      .pipe(finalize(() => this.groupsLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tree) => {
          this.compositionGroupTree.set(tree);
          const flat: ServiceCompositionGroup[] = [];
          const walk = (nodes: ServiceCompositionGroupNode[]) => {
            for (const node of nodes) {
              flat.push({ ...node, is_active: true });
              walk(node.children);
            }
          };
          walk(tree);
          this.compositionGroups.set(flat);
          // Expandir os nós de primeiro nível ao carregar pela primeira vez.
          if (this.expandedGroupIds().size === 0) {
            this.expandedGroupIds.set(new Set(tree.map((item) => item.id)));
          }
        },
        error: () => void Swal.fire('Erro', 'Não foi possível carregar os grupos de composição.', 'error'),
      });
  }

  async changeCompositionGroup(group: number | null): Promise<void> {
    if (this.groupsBusy()) return;
    const previous = this.selectedGroupId();
    if (previous === group) return;
    const composition = this.selectedSupply();
    if (!composition || this.isCreatingNewComposition()) {
      this.selectedGroupId.set(group);
      return;
    }
    this.groupsBusy.set(true);
    try {
      const updated = await firstValueFrom(this.obrasService.classifyComposition(composition.id, group));
      if (this.destroyRef.destroyed) return;
      this.selectedSupply.set(updated);
      this.selectedGroupId.set(updated.group ?? null);
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        this.selectedGroupId.set(previous);
        await Swal.fire('Erro ao classificar', this.describeGroupError(error), 'error');
      }
    } finally {
      this.groupsBusy.set(false);
    }
  }

  private describeGroupError(error: unknown): string {
    if (error instanceof HttpErrorResponse) return this.getApiErrorMessage(error);
    return 'Não foi possível concluir a operação.';
  }

  openGroupPanel(): void {
    this.groupPanelOpen.set(true);
  }

  closeGroupPanel(): void {
    if (this.groupsBusy()) return;
    this.closeGroupEditor();
    this.groupPanelOpen.set(false);
  }

  manageCompositionGroup(group?: ServiceCompositionGroupNode, parent?: number | null): void {
    if (this.groupsBusy()) return;
    this.groupPanelOpen.set(true);
    this.editingGroupId.set(group?.id ?? null);
    this.groupFormCode.set(group?.code ?? '');
    this.groupFormName.set(group?.name ?? '');
    this.groupFormParentId.set(group?.parent ?? parent ?? null);
    this.groupEditorOpen.set(true);
  }

  closeGroupEditor(): void {
    this.groupEditorOpen.set(false);
    this.editingGroupId.set(null);
  }

  async saveCompositionGroup(): Promise<void> {
    if (this.groupsBusy()) return;
    const code = this.groupFormCode().trim();
    const name = this.groupFormName().trim();
    if (!code || !name) return;
    const payload = { code, name, parent: this.groupFormParentId() };
    this.groupsBusy.set(true);
    try {
      const id = this.editingGroupId();
      if (id !== null) await firstValueFrom(this.obrasService.updateCompositionGroup(id, payload));
      else await firstValueFrom(this.obrasService.createCompositionGroup(payload));
      if (this.destroyRef.destroyed) return;
      this.closeGroupEditor();
      this.refreshCompositionGroups();
    } catch (error) {
      if (!this.destroyRef.destroyed)
        await Swal.fire('Erro ao salvar grupo', this.describeGroupError(error), 'error');
    } finally {
      this.groupsBusy.set(false);
    }
  }

  async deactivateGroup(group: ServiceCompositionGroupNode): Promise<void> {
    const answer = await Swal.fire({
      title: `Desativar grupo ${group.code}?`,
      text: 'Grupos com subgrupos ou composições ativas precisam ser esvaziados antes.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Desativar', cancelButtonText: 'Cancelar',
    });
    if (!answer.isConfirmed || this.groupsBusy()) return;
    this.groupsBusy.set(true);
    try {
      await firstValueFrom(this.obrasService.deactivateCompositionGroup(group.id));
      if (this.selectedGroupId() === group.id) this.selectedGroupId.set(null);
      this.refreshCompositionGroups();
    } catch (error) {
      await Swal.fire('Não foi possível desativar', this.describeGroupError(error), 'error');
    } finally { this.groupsBusy.set(false); }
  }

  readonly saving = signal(false);

  readonly creatingFromSearch = signal(false);

  readonly loadingComposition = signal(false);

  readonly moduleColor =
    this.router.currentNavigation()?.extras.state?.['moduleColor'] ??
    history.state?.['moduleColor'] ??
    null;

  readonly moduleIcone =
    this.router.currentNavigation()?.extras.state?.['moduleIcone'] ??
    history.state?.['moduleIcone'] ??
    null;

  readonly moduleName =
    this.router.currentNavigation()?.extras.state?.['moduleName'] ??
    history.state?.['moduleName'] ??
    null;

  readonly selectedSupply = signal<ServiceCompositionAutocomplete | null>(null);

  readonly selectedUnitMeasure = computed<string | null>(
    () => this.selectedSupply()?.latest_version?.unit ?? null,
  );

  readonly selectedUnitMeasureName = computed(
    () => this.selectedSupply()?.latest_version?.unit ?? '',
  );

  readonly selectedUnitMeasureAbbreviation = computed(
    () => this.selectedSupply()?.latest_version?.unit ?? '',
  );

  readonly selectedUnitMeasureLabel = computed(
    () => this.selectedSupply()?.latest_version?.unit ?? '',
  );

  readonly compositionActionMode = signal<CompositionActionMode | null>(null);

  readonly isCreatingNewComposition = computed(() => this.compositionActionMode() === 'CREATE_NEW');

  readonly isUsingExistingComposition = computed(
    () => this.compositionActionMode() === 'EDIT_EXISTING',
  );

  readonly canEditCompositionItems = computed(() => {
    const composition = this.selectedSupply();

    if (!composition) {
      return false;
    }

    if (this.compositionActionMode() === 'CREATE_NEW') {
      return true;
    }

    return composition.origin === 'HUB' && composition.latest_version?.status === 'DRAFT';
  });

  private readonly initialComposicaoFormModel: ComposicaoDadosForm = {
    id: '',
  };

  readonly composicaoModel = signal<ComposicaoDadosForm>({
    ...this.initialComposicaoFormModel,
  });

  readonly isEditing = computed(
    () =>
      this.compositionActionMode() === 'EDIT_EXISTING' &&
      this.selectedSupply()?.origin === 'HUB' &&
      this.selectedSupply()?.latest_version?.status === 'DRAFT',
  );

  readonly insumoForm = form(this.composicaoModel, (path) => {
    disabled(path.id, () => this.isEditing());

    required(path.id, {
      message: 'A composição de serviço é obrigatória.',
    });
  });

  private readonly initialItemDraft: CompositionItemDraft = {
    supply: null,
    subcomposition: null,
    quantity: null,
    unitValue: null,
    materialUnitPrice: 0,
    laborUnitPrice: 0,
    equipmentUnitPrice: 0,
  };

  readonly compositionItems = signal<CompositionItem[]>([]);

  readonly expandedCompositionKeys = signal<readonly DrxEditableTableKey[]>([]);
  readonly compositionDetailsCache = signal<ReadonlyMap<number, ServiceCompositionApiItem[]>>(
    new Map(),
  );
  readonly loadingCompositionIds = signal<ReadonlySet<number>>(new Set());
  readonly compositionDetailsErrors = signal<ReadonlySet<number>>(new Set());

  readonly canExpandComposition = (row: CompositionItem): boolean =>
    row.itemType === 'SUBCOMPOSITION' && row.subcompositionId !== null;
  readonly compositionTreeLabel = (row: CompositionItem): string => row.description;
  readonly compositionTreeStatus = (row: CompositionItem): string =>
    this.compositionDetailsStatus(row.subcompositionId);

  readonly compositionTreeNodes = computed(() => {
    const result = new Map<string, readonly DrxEditableTreeNode[]>();
    const selectedId = this.selectedSupply()?.id;
    for (const root of this.compositionItems()) {
      result.set(
        root.clientId,
        root.subcompositionId === null
          ? []
          : this.buildCompositionTree(
              root.subcompositionId,
              root.quantity,
              selectedId === undefined ? [] : [selectedId],
            ),
      );
    }
    return result;
  });
  readonly compositionTreeChildren = (row: CompositionItem): readonly DrxEditableTreeNode[] =>
    this.compositionTreeNodes().get(row.clientId) ?? [];

  private buildCompositionTree(
    id: number,
    quantity: number,
    ancestors: readonly number[],
  ): DrxEditableTreeNode[] {
    if (ancestors.includes(id)) return [];
    const nextAncestors = [...ancestors, id];
    return [...(this.compositionDetailsCache().get(id) ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((item, index) => {
        const effectiveQuantity = quantity * this.parseApiNumber(item.coefficient);
        const unitValue =
          this.parseApiNumber(item.material_unit_price) +
          this.parseApiNumber(item.labor_unit_price) +
          this.parseApiNumber(item.equipment_unit_price);
        const subcomposition = item.item_type === 'SUBCOMPOSITION' ? item.subcomposition : null;
        const cyclic = subcomposition !== null && nextAncestors.includes(subcomposition);
        return {
          key: `${item.id}:${index}`,
          label: item.description_snapshot,
          data: { subcomposition, cyclic },
          state: subcomposition !== null ? 'group' : null,
          expandable: subcomposition !== null && !cyclic,
          status: subcomposition !== null ? this.compositionDetailsStatus(subcomposition) : '',
          children:
            subcomposition !== null && !cyclic
              ? this.buildCompositionTree(subcomposition, effectiveQuantity, nextAncestors)
              : [],
          cells: {
            item: item.description_snapshot,
            unit: item.unit_snapshot || '—',
            quantity: this.formatQuantity(effectiveQuantity),
            materialUnitPrice: this.formatCurrency(this.parseApiNumber(item.material_unit_price)),
            laborUnitPrice: this.formatCurrency(this.parseApiNumber(item.labor_unit_price)),
            unitValue: this.formatCurrency(unitValue),
            total: this.formatCurrency(this.roundMoney(effectiveQuantity * unitValue)),
          },
        };
      });
  }

  compositionDetailsStatus(id: number | null): string {
    if (id === null) return 'Subcomposição indisponível.';
    if (id === this.selectedSupply()?.id) return 'Referência circular: expansão interrompida.';
    if (this.loadingCompositionIds().has(id)) return 'Carregando componentes...';
    if (this.compositionDetailsErrors().has(id))
      return 'Não foi possível carregar. Recolha e expanda para tentar novamente.';
    if (this.compositionDetailsCache().get(id)?.length === 0)
      return 'Esta subcomposição não possui componentes.';
    return '';
  }

  onCompositionExpansion(event: DrxEditableRowExpansion<CompositionItem>): void {
    if (event.expanded) void this.loadCompositionDetails(event.row.subcompositionId);
  }

  onCompositionTreeExpansion(event: DrxEditableTreeExpansion<CompositionItem>): void {
    const data = event.node.data as { subcomposition: number | null; cyclic: boolean };
    if (event.expanded && !data.cyclic) void this.loadCompositionDetails(data.subcomposition);
  }

  private async loadCompositionDetails(id: number | null): Promise<void> {
    if (
      id === null ||
      id === this.selectedSupply()?.id ||
      this.compositionDetailsCache().has(id) ||
      this.loadingCompositionIds().has(id)
    )
      return;
    this.loadingCompositionIds.update((ids) => new Set([...ids, id]));
    this.compositionDetailsErrors.update(
      (ids) => new Set([...ids].filter((value) => value !== id)),
    );
    try {
      const composition = await firstValueFrom(
        this.obrasService.getComposition(id).pipe(takeUntilDestroyed(this.destroyRef)),
      );
      this.compositionDetailsCache.update((cache) =>
        new Map(cache).set(id, composition.latest_version?.items ?? []),
      );
    } catch {
      if (!this.destroyRef.destroyed)
        this.compositionDetailsErrors.update((ids) => new Set([...ids, id]));
    } finally {
      this.loadingCompositionIds.update((ids) => new Set([...ids].filter((value) => value !== id)));
    }
  }

  readonly removedExistingItemIds = signal<number[]>([]);

  readonly itemDraft = signal<CompositionItemDraft>({
    ...this.initialItemDraft,
  });

  readonly editingClientId = signal<string | null>(null);

  readonly selectedCatalogItem = signal<CompositionItemCatalogOption | null>(null);

  readonly selectedItemUnitAbbreviation = computed(() => {
    const option = this.selectedCatalogItem();

    if (!option) {
      return '';
    }

    return option.kind === 'SUBCOMPOSITION'
      ? (option.composition.latest_version?.unit ?? '')
      : (option.supply.unit_measure_abbreviation ?? option.supply.unit ?? '');
  });

  readonly isSubcompositionDraft = computed(
    () => this.selectedCatalogItem()?.kind === 'SUBCOMPOSITION',
  );

  readonly itemDraftTotal = computed<string>(() => {
    const { quantity } = this.itemDraft();
    const unitValue = this.draftUnitCost(this.itemDraft());

    if (quantity === null || unitValue === null) {
      return '';
    }

    return this.roundMoney(quantity * unitValue).toFixed(2);
  });

  readonly canAddCompositionItem = computed(() => {
    const { supply, subcomposition, quantity } = this.itemDraft();
    const unitValue = this.draftUnitCost(this.itemDraft());

    return (
      (supply !== null || subcomposition !== null) &&
      quantity !== null &&
      quantity > 0 &&
      unitValue !== null &&
      unitValue >= 0
    );
  });

  readonly itemTableColumns: readonly DrxEditableTableColumn<
    CompositionItem,
    CompositionItemDraft
  >[] = [
    {
      key: 'item',
      label: 'Item',
      value: (item) => item.description,
      editor: 'text',
      width: '32%',
      align: 'left',
    },
    {
      key: 'unit',
      label: 'Unidade de Medida',
      value: (item) => item.unit || '—',
      editor: 'readonly',
      width: '150px',
      align: 'center',
    },
    {
      key: 'quantity',
      label: 'Quantidade',
      value: (item) => item.quantity,
      display: (item) => this.formatQuantity(item.quantity),
      editor: 'number',
      draftField: 'quantity',
      width: '135px',
      align: 'right',
    },
    {
      key: 'materialUnitPrice',
      label: 'Material / un.',
      value: (item) => item.materialUnitPrice,
      display: (item) => this.formatCurrency(item.materialUnitPrice),
      editor: 'number',
      draftField: 'materialUnitPrice',
      width: '150px',
      align: 'right',
    },
    {
      key: 'laborUnitPrice',
      label: 'Mão de obra / un.',
      value: (item) => item.laborUnitPrice,
      display: (item) => this.formatCurrency(item.laborUnitPrice),
      editor: 'number',
      draftField: 'laborUnitPrice',
      width: '150px',
      align: 'right',
    },
    {
      key: 'unitValue',
      label: 'Total / un.',
      value: (item) => item.unitValue,
      display: (item) =>
        this.formatCurrency(item.unitValue) +
        (item.equipmentUnitPrice > 0
          ? ` (equip.: ${this.formatCurrency(item.equipmentUnitPrice)})`
          : ''),
      editor: 'readonly',
      draftValue: (draft) => this.formatCurrency(this.draftUnitCost(draft)),
      width: '160px',
      align: 'right',
    },
    {
      key: 'total',
      label: 'Custo total',
      value: (item) => item.total,
      display: (item) => this.formatCurrency(item.total),
      editor: 'readonly',
      draftValue: (draft) => this.itemDraftTotalFrom(draft),
      width: '160px',
      align: 'right',
    },
  ];

  readonly itemRowKey = (item: CompositionItem): string => item.clientId;

  readonly createItemDraft = (): CompositionItemDraft => ({
    ...this.initialItemDraft,
  });

  readonly itemToDraft = (item: CompositionItem): CompositionItemDraft => ({
    supply: item.itemType === 'SUPPLY' ? item.supply : null,

    subcomposition: item.itemType === 'SUBCOMPOSITION' ? item.subcomposition : null,

    quantity: item.quantity,
    unitValue: item.unitValue,
    materialUnitPrice: item.materialUnitPrice,
    laborUnitPrice: item.laborUnitPrice,
    equipmentUnitPrice: item.equipmentUnitPrice,
  });

  parseItemNumber(value: string): number | null {
    return this.parseNullableNumber(value);
  }

  draftUnitCost(draft: CompositionItemDraft): number {
    const version = draft.subcomposition?.latest_version;
    if (version) {
      return (
        this.parseApiNumber(version.material_total) +
        this.parseApiNumber(version.labor_total) +
        this.parseApiNumber(version.equipment_total)
      );
    }
    return (
      (draft.materialUnitPrice ?? 0) + (draft.laborUnitPrice ?? 0) + (draft.equipmentUnitPrice ?? 0)
    );
  }

  onCompositionRowsChange(rows: readonly CompositionItem[]): void {
    this.compositionItems.set([...rows]);
  }

  onCompositionItemEditStarted(item: CompositionItem): void {
    this.editingClientId.set(item.clientId);

    if (item.itemType === 'SUBCOMPOSITION' && item.subcomposition) {
      this.selectedCatalogItem.set({
        id: item.subcomposition.id,
        kind: 'SUBCOMPOSITION',
        composition: item.subcomposition,
        supply: null,
      });

      return;
    }

    if (item.itemType === 'SUPPLY' && item.supply) {
      this.selectedCatalogItem.set({
        id: -item.supply.id,
        kind: 'SUPPLY',
        composition: null,
        supply: item.supply,
      });

      return;
    }

    this.selectedCatalogItem.set(null);
  }

  onCompositionItemEditCancelled(): void {
    this.editingClientId.set(null);
    this.selectedCatalogItem.set(null);
  }

  onCompositionItemCommitted(): void {
    this.editingClientId.set(null);
    this.selectedCatalogItem.set(null);
  }

  onCompositionItemRemoved(item: CompositionItem): void {
    if (item.id !== null && item.id !== undefined) {
      this.removedExistingItemIds.update((ids) =>
        ids.includes(item.id!) ? ids : [...ids, item.id!],
      );
    }

    if (this.editingClientId() === item.clientId) {
      this.editingClientId.set(null);
      this.selectedCatalogItem.set(null);
    }
  }

  private buildCompositionItem(
    currentItem: CompositionItem | null,
    draft: CompositionItemDraft,
  ): CompositionItem {
    const quantity = draft.quantity ?? 0;

    const changeType: ItemChangeType =
      currentItem?.changeType === 'inserted' ? 'inserted' : currentItem ? 'updated' : 'inserted';

    if (draft.subcomposition?.latest_version) {
      const subcomposition = draft.subcomposition;

      const version = subcomposition.latest_version;

      const materialUnitPrice = this.parseApiNumber(version?.material_total);

      const laborUnitPrice = this.parseApiNumber(version?.labor_total);

      const equipmentUnitPrice = this.parseApiNumber(version?.equipment_total);

      const unitValue = materialUnitPrice + laborUnitPrice + equipmentUnitPrice;

      return {
        clientId: currentItem?.clientId ?? this.generateClientId(),

        id: currentItem?.id ?? null,

        itemType: 'SUBCOMPOSITION',

        supply: null,

        subcomposition,

        subcompositionId: subcomposition.id,

        description: subcomposition.name,

        unit: version?.unit ?? '',

        quantity,

        unitValue,

        materialUnitPrice,
        laborUnitPrice,
        equipmentUnitPrice,

        total: this.roundMoney(quantity * unitValue),

        changeType,
      };
    }

    const supply = draft.supply;

    const unitValue = this.draftUnitCost(draft);

    if (!supply) {
      return {
        clientId: currentItem?.clientId ?? this.generateClientId(),

        id: currentItem?.id ?? null,

        itemType: currentItem?.itemType ?? 'FREE_TEXT',

        supply: currentItem?.supply ?? null,

        subcomposition: currentItem?.subcomposition ?? null,

        subcompositionId: currentItem?.subcompositionId ?? null,

        description: currentItem?.description ?? '',

        unit: currentItem?.unit ?? '',

        quantity,

        unitValue,

        materialUnitPrice: currentItem?.materialUnitPrice ?? 0,

        laborUnitPrice: currentItem?.laborUnitPrice ?? 0,

        equipmentUnitPrice: currentItem?.equipmentUnitPrice ?? 0,

        total: this.roundMoney(quantity * unitValue),

        changeType,
      };
    }

    return {
      clientId: currentItem?.clientId ?? this.generateClientId(),

      id: currentItem?.id ?? null,

      itemType: 'SUPPLY',

      supply,

      subcomposition: null,

      subcompositionId: null,

      description: supply.description,

      unit: supply.unit_measure_abbreviation ?? supply.unit ?? '',

      quantity,

      unitValue,

      materialUnitPrice: draft.materialUnitPrice ?? 0,
      laborUnitPrice: draft.laborUnitPrice ?? 0,
      equipmentUnitPrice: draft.equipmentUnitPrice ?? 0,

      total: this.roundMoney(quantity * unitValue),

      changeType,
    };
  }

  private itemDraftTotalFrom(draft: CompositionItemDraft): string {
    const quantity = draft.quantity;

    const unitValue = this.draftUnitCost(draft);

    if (quantity === null || unitValue === null) {
      return '';
    }

    return this.formatCurrency(this.roundMoney(quantity * unitValue));
  }

  private resetItemDraft(): void {
    this.selectedCatalogItem.set(null);

    this.itemDraft.set({
      ...this.initialItemDraft,
    });

    this.editingClientId.set(null);
  }

  readonly createItemRow = (draft: CompositionItemDraft): CompositionItem =>
    this.buildCompositionItem(null, draft);

  readonly updateItemRow = (item: CompositionItem, draft: CompositionItemDraft): CompositionItem =>
    this.buildCompositionItem(item, draft);

  readonly validateItemDraft = (draft: CompositionItemDraft): DrxEditableValidationErrors => {
    const errors: Record<string, string> = {};

    if (!draft.supply && !draft.subcomposition) {
      errors['item'] = 'Selecione um insumo ou uma composição.';
    }

    if (draft.quantity === null || draft.quantity <= 0) {
      errors['quantity'] = 'A quantidade deve ser maior que zero.';
    }

    for (const field of ['materialUnitPrice', 'laborUnitPrice', 'equipmentUnitPrice'] as const) {
      const value = draft[field];
      if (value === null || !Number.isFinite(value) || value < 0) {
        errors[field] = 'Informe um custo maior ou igual a zero.';
      }
    }

    return errors;
  };

  readonly findDuplicateItem = (
    rows: readonly CompositionItem[],
    draft: CompositionItemDraft,
  ): CompositionItem | undefined => {
    if (draft.supply) {
      return rows.find(
        (item) => item.itemType === 'SUPPLY' && item.supply?.id === draft.supply?.id,
      );
    }

    if (draft.subcomposition) {
      return rows.find(
        (item) =>
          item.itemType === 'SUBCOMPOSITION' && item.subcompositionId === draft.subcomposition?.id,
      );
    }

    return undefined;
  };

  readonly canEditCompositionItem = (item: CompositionItem): boolean =>
    item.itemType !== 'FREE_TEXT';

  readonly itemRowState = (item: CompositionItem): string | null =>
    item.changeType === 'unchanged'
      ? item.itemType === 'SUBCOMPOSITION'
        ? 'group'
        : null
      : item.changeType;

  readonly isItemDraftEmpty = (draft: CompositionItemDraft): boolean =>
    !draft.supply && !draft.subcomposition && draft.quantity === null && draft.unitValue === null;

  readonly insertedItems = computed(() =>
    this.compositionItems().filter((item) => item.changeType === 'inserted'),
  );

  readonly updatedItems = computed(() =>
    this.compositionItems().filter((item) => item.changeType === 'updated'),
  );

  readonly compositionTotal = computed(() =>
    this.roundMoney(this.compositionItems().reduce((total, item) => total + item.total, 0)),
  );

  readonly hasCompositionChanges = computed(
    () =>
      this.compositionItems().some((item) => item.changeType !== 'unchanged') ||
      this.removedExistingItemIds().length > 0,
  );

  readonly canCreateSupply = computed(() =>
    this.authStore.userPermissions().includes('supplies.create'),
  );

  readonly canEditSupply = computed(() =>
    this.authStore.userPermissions().includes('supplies.edit'),
  );

  readonly hasWritePermission = computed(() =>
    this.isEditing() ? this.canEditSupply() : this.canCreateSupply(),
  );

  readonly canShowCompositionItems = computed(() => {
    const composition = this.selectedSupply();

    return (
      composition !== null &&
      this.compositionActionMode() !== null &&
      this.composicaoModel().id.trim().length > 0 &&
      this.insumoForm().valid()
    );
  });

  readonly canSubmit = computed(() => {
    return (
      this.hasWritePermission() &&
      this.canShowCompositionItems() &&
      this.compositionItems().length > 0 &&
      this.canEditCompositionItems() &&
      (this.isCreatingNewComposition() || this.hasCompositionChanges()) &&
      !this.insumoForm().pending() &&
      !this.saving()
    );
  });

  readonly searchSupplies: DrxAutocompleteSearch<ServiceCompositionAutocomplete> = (
    term,
    page,
    pageSize,
  ) =>
    this.obrasService.searchByName(term, page, pageSize).pipe(
      map((result) => {
        const normalizedTerm = term.trim();
        const hasExactComposition = result.items.some(
          (composition) =>
            this.normalizeCatalogName(composition.name) ===
            this.normalizeCatalogName(normalizedTerm),
        );

        if (page === 1 && !hasExactComposition && normalizedTerm.length >= 3) {
          return {
            items: [...result.items, this.createNewCompositionOption(normalizedTerm)],
            hasMore: result.hasMore,
            total: (result.total ?? result.items.length) + 1,
          };
        }

        return result;
      }),
    );

  readonly searchCompositionItemCatalog: DrxAutocompleteSearch<CompositionItemCatalogOption> = (
    term,
    page,
    pageSize,
  ) =>
    this.obrasService.searchCompositionItemCatalog(term, page, pageSize).pipe(
      map((result) => {
        const currentCompositionId = this.isUsingExistingComposition()
          ? this.selectedSupply()?.id
          : null;

        return {
          ...result,
          items: result.items.filter(
            (option) =>
              option.kind !== 'SUBCOMPOSITION' ||
              (option.composition.id !== currentCompositionId &&
                Boolean(option.composition.latest_version)),
          ),
        };
      }),
    );

  constructor() {
    this.refreshCompositionGroups();
    const compositionId = Number(this.activatedRoute.snapshot.queryParamMap.get('compositionId'));

    if (Number.isInteger(compositionId) && compositionId > 0) {
      this.loadCompositionForEditing(compositionId);
    }
  }

  readonly displaySupply = (composition: ServiceCompositionAutocomplete): string =>
    this.isNewCompositionOption(composition) ? composition.name : composition.name;

  readonly identifySupply = (composition: ServiceCompositionAutocomplete): number => composition.id;

  readonly supplyDetails = (composition: ServiceCompositionAutocomplete): string =>
    this.isNewCompositionOption(composition)
      ? 'Nenhuma composição encontrada • criar a partir do insumo de serviço cadastrado'
      : [
          composition.code,
          composition.latest_version?.unit,
          composition.origin === 'LEGACY' ? 'Legado' : 'Hub',
        ]
          .filter((value): value is string => Boolean(value))
          .join(' • ');

  readonly displayCompositionItem = (option: CompositionItemCatalogOption): string =>
    option.kind === 'SUBCOMPOSITION'
      ? [option.composition.code, option.composition.name].filter(Boolean).join(' — ')
      : option.supply.description;

  readonly identifyCompositionItem = (option: CompositionItemCatalogOption): number => option.id;

  readonly compositionItemDetails = (option: CompositionItemCatalogOption): string => {
    if (option.kind === 'SUBCOMPOSITION') {
      const version = option.composition.latest_version;

      return [
        'Composição',
        version?.unit ? `Un.: ${version.unit}` : null,
        version
          ? `Custo base: ${this.formatCurrency(this.parseApiNumber(version.total))}`
          : 'Sem versão disponível',
      ]
        .filter((value): value is string => Boolean(value))
        .join(' • ');
    }

    return [
      'Insumo',
      option.supply.material_group_name,
      option.supply.unit_measure_abbreviation ?? option.supply.unit,
      this.getSupplyTypeLabel(option.supply.supply_type),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' • ');
  };

  async onSupplySelected(composition: ServiceCompositionAutocomplete): Promise<void> {
    if (this.isNewCompositionOption(composition)) {
      await this.startNewCompositionFromSupply(composition.name);
      return;
    }

    const hasItems = (composition.latest_version?.items ?? []).length > 0;

    const existingButtonText =
      composition.origin === 'HUB' && composition.latest_version?.status === 'DRAFT'
        ? 'Editar composição existente'
        : 'Usar composição existente';

    const result = await Swal.fire({
      icon: 'question',
      title: 'Como deseja continuar?',
      html: `
      <div style="text-align: left">
        <p>
          <strong>${composition.name}</strong>
        </p>

        <p>
          ${
            hasItems
              ? `A composição possui ${
                  composition.latest_version?.items.length ?? 0
                } item(ns) cadastrado(s).`
              : 'A composição ainda não possui itens cadastrados.'
          }
        </p>

        ${
          composition.origin === 'LEGACY'
            ? `
              <p>
                A composição é legada e não pode ser alterada diretamente.
              </p>
            `
            : ''
        }
      </div>
    `,
      showConfirmButton: true,
      confirmButtonText: existingButtonText,
      confirmButtonColor: this.moduleColor || '#5F07F6',
      showDenyButton: true,
      denyButtonText: 'Criar nova composição',
      denyButtonColor: '#0dcea8',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      allowOutsideClick: false,
      allowEscapeKey: true,
    });

    if (result.isDismissed) {
      this.resetForm();

      return;
    }

    this.selectedSupply.set(composition);
    this.selectedGroupId.set(composition.group ?? null);

    this.insumoForm().reset({
      id: composition.id.toString(),
    });

    this.resetItemDraft();

    if (result.isConfirmed) {
      this.compositionActionMode.set('EDIT_EXISTING');

      this.loadCompositionItemsFromApi(composition.latest_version?.items ?? []);

      return;
    }

    if (result.isDenied) {
      this.compositionActionMode.set('CREATE_NEW');

      this.compositionItems.set([]);
      this.removedExistingItemIds.set([]);
    }
  }

  onSupplyCleared(): void {
    this.resetForm();
  }

  onCompositionItemSelected(option: CompositionItemCatalogOption): void {
    this.selectedCatalogItem.set(option);

    if (option.kind === 'SUPPLY') {
      this.itemDraft.update((currentDraft) => ({
        ...currentDraft,
        supply: option.supply,
        subcomposition: null,
        unitValue: null,
        materialUnitPrice: 0,
        laborUnitPrice: 0,
        equipmentUnitPrice: 0,
      }));

      return;
    }

    const version = option.composition.latest_version;
    const unitValue = version
      ? this.roundMoney(
          this.parseApiNumber(version.material_total) +
            this.parseApiNumber(version.labor_total) +
            this.parseApiNumber(version.equipment_total),
        )
      : null;

    this.itemDraft.update((currentDraft) => ({
      ...currentDraft,
      supply: null,
      subcomposition: option.composition,
      unitValue,
      materialUnitPrice: this.parseApiNumber(version?.material_total),
      laborUnitPrice: this.parseApiNumber(version?.labor_total),
      equipmentUnitPrice: this.parseApiNumber(version?.equipment_total),
    }));
  }

  onCompositionItemCleared(): void {
    this.selectedCatalogItem.set(null);

    this.itemDraft.update((currentDraft) => ({
      ...currentDraft,
      supply: null,
      subcomposition: null,
      unitValue: null,
      materialUnitPrice: 0,
      laborUnitPrice: 0,
      equipmentUnitPrice: 0,
    }));
  }

  private loadCompositionItemsFromApi(items: ServiceCompositionApiItem[]): void {
    this.expandedCompositionKeys.set([]);
    this.compositionDetailsCache.set(new Map());
    this.removedExistingItemIds.set([]);
    this.compositionItems.set(
      [...items]
        .sort((firstItem, secondItem) => firstItem.position - secondItem.position)
        .map((item) => this.mapApiItemToCompositionItem(item)),
    );
  }

  private mapApiItemToCompositionItem(item: ServiceCompositionApiItem): CompositionItem {
    const quantity = this.parseApiNumber(item.coefficient);

    const materialUnitPrice = this.parseApiNumber(item.material_unit_price);

    const laborUnitPrice = this.parseApiNumber(item.labor_unit_price);

    const equipmentUnitPrice = this.parseApiNumber(item.equipment_unit_price);

    const unitValue = materialUnitPrice + laborUnitPrice + equipmentUnitPrice;

    const supply: SupplyAutocomplete | null =
      item.supply !== null
        ? {
            id: item.supply,
            origin: this.selectedSupply()?.origin ?? 'HUB',
            description: item.description_snapshot,
            full_description: item.description_snapshot,
            specification: null,
            supply_type: 'OTHER',
            unit: item.unit_snapshot,
            unit_measure: null,
            unit_measure_name: item.unit_snapshot,
            unit_measure_abbreviation: item.unit_snapshot,
            material_group: null,
            material_group_name: null,
          }
        : null;

    const subcomposition =
      item.item_type === 'SUBCOMPOSITION' && item.subcomposition !== null
        ? this.createSubcompositionSnapshot(item, {
            materialUnitPrice,
            laborUnitPrice,
            equipmentUnitPrice,
          })
        : null;

    const subtotal = this.parseApiNumber(item.subtotal);

    return {
      clientId: this.generateClientId(),
      id: item.id,
      itemType: item.item_type,
      supply,
      subcomposition,
      subcompositionId: item.subcomposition,
      description: item.description_snapshot,
      unit: item.unit_snapshot,
      quantity,
      unitValue,
      materialUnitPrice,
      laborUnitPrice,
      equipmentUnitPrice,
      total: subtotal || this.roundMoney(quantity * unitValue),
      changeType: 'unchanged',
    };
  }

  private createSubcompositionSnapshot(
    item: ServiceCompositionApiItem,
    prices: {
      materialUnitPrice: number;
      laborUnitPrice: number;
      equipmentUnitPrice: number;
    },
  ): ServiceCompositionAutocomplete {
    const total = this.roundMoney(
      prices.materialUnitPrice + prices.laborUnitPrice + prices.equipmentUnitPrice,
    );

    return {
      id: item.subcomposition!,
      origin: 'HUB',
      code: '',
      name: item.description_snapshot,
      is_active: true,
      latest_version: {
        id: 0,
        number: 0,
        status: 'DRAFT',
        origin: 'HUB',
        unit: item.unit_snapshot,
        material_total: this.decimalPayload(prices.materialUnitPrice, 8),
        labor_total: this.decimalPayload(prices.laborUnitPrice, 8),
        equipment_total: this.decimalPayload(prices.equipmentUnitPrice, 8),
        total: this.decimalPayload(total, 8),
        items: [],
      },
    } as unknown as ServiceCompositionAutocomplete;
  }

  private buildCompositionPayload() {
    const composition = this.selectedSupply();

    if (!composition) {
      return null;
    }

    return {
      code: composition.code,
      name: composition.name,
      is_active: true,
      group: this.selectedGroupId(),
      unit: composition.latest_version?.unit ?? '',
      items: this.compositionItems().map((item, position) => ({
        item_type: item.itemType,
        supply: item.itemType === 'SUPPLY' ? (item.supply?.id ?? null) : null,
        subcomposition: item.itemType === 'SUBCOMPOSITION' ? item.subcompositionId : null,
        description_snapshot: item.description,
        unit_snapshot: item.unit,
        // Não reduza a precisão do cálculo ao salvar. O backend aceita 6 casas
        // para quantidade e 8 casas para custos unitários; a exibição continua em 2 casas.
        coefficient: this.decimalPayload(item.quantity, 6),
        material_unit_price: this.decimalPayload(item.materialUnitPrice, 8),
        labor_unit_price: this.decimalPayload(item.laborUnitPrice, 8),
        equipment_unit_price: this.decimalPayload(item.equipmentUnitPrice, 8),
        position,
      })),
    };
  }

  onSubmit(continueAfterSave: boolean): void {
    if (this.saving()) {
      return;
    }

    if (!this.canSubmit()) {
      void Swal.fire({
        icon: 'warning',
        title: 'Revise a composição',
        text: 'Selecione uma composição e informe pelo menos um item válido.',
        confirmButtonText: 'Entendi',
        confirmButtonColor: this.moduleColor ?? undefined,
      });
      return;
    }

    const composition = this.selectedSupply();
    const payload = this.buildCompositionPayload();

    if (!composition || !payload) {
      return;
    }

    const creating = this.isCreatingNewComposition();
    const request$ = creating
      ? this.obrasService.createComposition(payload)
      : this.obrasService.updateComposition(composition.id, payload);

    this.saving.set(true);

    request$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (savedComposition) => {
          void Swal.fire({
            icon: 'success',
            title: creating ? 'Composição cadastrada' : 'Composição atualizada',
            text: creating
              ? 'A composição foi cadastrada com sucesso.'
              : 'A composição foi atualizada com sucesso.',
            confirmButtonText: 'Continuar',
            confirmButtonColor: this.moduleColor ?? undefined,
          }).then(() => {
            if (continueAfterSave) {
              this.selectedSupply.set(savedComposition);
              this.selectedGroupId.set(savedComposition.group ?? null);
              this.compositionActionMode.set('EDIT_EXISTING');
              this.insumoForm().reset({ id: savedComposition.id.toString() });
              this.loadCompositionItemsFromApi(savedComposition.latest_version?.items ?? []);
              this.resetItemDraft();
              return;
            }

            this.resetForm();
            this.navigateBack();
          });
        },
        error: (error: HttpErrorResponse) => {
          console.error('Erro ao salvar composição:', error);
          void Swal.fire({
            icon: 'error',
            title: creating ? 'Erro ao cadastrar composição' : 'Erro ao atualizar composição',
            text: this.getApiErrorMessage(error),
            confirmButtonText: 'Fechar',
            confirmButtonColor: this.moduleColor ?? undefined,
          });
        },
      });
  }

  onCancel(): void {
    this.resetForm();
    this.navigateBack();
  }

  private loadCompositionForEditing(compositionId: number): void {
    this.loadingComposition.set(true);

    this.obrasService
      .getComposition(compositionId)
      .pipe(
        finalize(() => this.loadingComposition.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (composition) => {
          this.selectedSupply.set(composition);
          this.selectedGroupId.set(composition.group ?? null);
          this.compositionActionMode.set('EDIT_EXISTING');
          this.insumoForm().reset({ id: composition.id.toString() });
          this.loadCompositionItemsFromApi(composition.latest_version?.items ?? []);
          this.resetItemDraft();

          if (!this.canEditCompositionItems()) {
            void Swal.fire({
              icon: 'info',
              title: 'Composição somente para consulta',
              text: 'Somente composições do Hub com versão em rascunho podem ser alteradas.',
              confirmButtonText: 'Entendi',
              confirmButtonColor: this.moduleColor ?? undefined,
            });
          }
        },
        error: (error: HttpErrorResponse) => {
          console.error('Erro ao carregar composição:', error);
          void Swal.fire({
            icon: 'error',
            title: 'Não foi possível carregar a composição',
            text: this.getApiErrorMessage(error),
            confirmButtonText: 'Voltar',
            confirmButtonColor: this.moduleColor ?? undefined,
          }).then(() => this.navigateBack());
        },
      });
  }

  private navigateBack(): void {
    const returnUrl = this.activatedRoute.snapshot.queryParamMap.get('returnUrl');

    if (returnUrl?.startsWith('/') && !returnUrl.startsWith('//')) {
      void this.router.navigateByUrl(returnUrl);
      return;
    }

    void this.router.navigate(['../'], {
      relativeTo: this.activatedRoute,
    });
  }

  private resetForm(): void {
    this.expandedCompositionKeys.set([]);
    this.compositionDetailsCache.set(new Map());
    this.selectedSupply.set(null);
    this.selectedGroupId.set(null);

    this.compositionActionMode.set(null);

    this.insumoForm().reset({
      ...this.initialComposicaoFormModel,
    });

    this.compositionItems.set([]);

    this.removedExistingItemIds.set([]);

    this.resetItemDraft();
  }

  private createNewCompositionOption(name: string): ServiceCompositionAutocomplete {
    return {
      id: NEW_COMPOSITION_OPTION_ID,
      origin: 'HUB',
      code: '',
      name,
      is_active: true,
      latest_version: null,
    } as ServiceCompositionAutocomplete;
  }

  private isNewCompositionOption(composition: ServiceCompositionAutocomplete): boolean {
    return composition.id === NEW_COMPOSITION_OPTION_ID;
  }

  private normalizeCatalogName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleUpperCase('pt-BR');
  }

  private async startNewCompositionFromSupply(name: string): Promise<void> {
    if (this.creatingFromSearch()) {
      return;
    }

    this.creatingFromSearch.set(true);

    try {
      const supply = await firstValueFrom(this.obrasService.buscarInsumoServicoExato(name));

      if (!supply) {
        this.resetForm();

        await Swal.fire({
          icon: 'warning',
          title: 'Insumo de serviço não encontrado',
          text: `Cadastre um insumo ativo do tipo Serviço com o nome “${name}” antes de criar esta composição.`,
          confirmButtonText: 'Cadastrar novo Serviço.',
          confirmButtonColor: this.moduleColor ?? undefined,
        });
        window.open('/hub/gestao-administrativa/cadastro-insumos', '_blank');
        return;
      }

      const unit = supply.unit_measure_abbreviation ?? supply.unit ?? '';
      const newComposition = {
        id: NEW_COMPOSITION_OPTION_ID,
        origin: 'HUB',
        code: '',
        name: supply.description,
        is_active: true,
        latest_version: {
          id: 0,
          number: 1,
          status: 'DRAFT',
          origin: 'HUB',
          unit,
          material_total: '0.0000',
          labor_total: '0.0000',
          equipment_total: '0.0000',
          total: '0.0000',
          items: [],
        },
      } as unknown as ServiceCompositionAutocomplete;

      this.selectedSupply.set(newComposition);
      this.compositionActionMode.set('CREATE_NEW');
      this.insumoForm().reset({ id: `new:${supply.id}` });
      this.compositionItems.set([]);
      this.removedExistingItemIds.set([]);
      this.resetItemDraft();
    } catch (error) {
      console.error('Erro ao localizar o insumo para criar a composição:', error);
      this.resetForm();

      await Swal.fire({
        icon: 'error',
        title: 'Não foi possível iniciar a composição',
        text: 'Ocorreu um erro ao consultar o insumo de serviço cadastrado.',
        confirmButtonText: 'Fechar',
        confirmButtonColor: this.moduleColor ?? undefined,
      });
    } finally {
      this.creatingFromSearch.set(false);
    }
  }

  private getSupplyTypeLabel(supplyType: string): string {
    const labels: Record<string, string> = {
      MATERIAL: 'Material',
      SERVICE: 'Serviço',
      LABOR: 'Mão de obra',
      EQUIPMENT: 'Equipamento',
      OTHER: 'Outros',
    };

    return labels[supplyType] ?? supplyType;
  }

  private parseNullableNumber(value: string): number | null {
    const normalizedValue = value.trim().replace(/\s/g, '').replace(',', '.');

    if (!normalizedValue) {
      return null;
    }

    const parsedValue = Number(normalizedValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  private parseApiNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') {
      return 0;
    }

    const parsedValue = Number(String(value).replace(',', '.'));

    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /** Mantém a precisão de cálculo no payload; arredondamento para 2 casas é só de apresentação. */
  private decimalPayload(value: number, scale: number): string {
    if (!Number.isFinite(value)) return '0';
    return value.toFixed(scale);
  }

  formatQuantity(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }).format(value);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private splitUnitPrice(supplyType: string, unitValue: number, currentItem?: CompositionItem) {
    if (supplyType === 'OTHER' && currentItem) {
      const category = [
        ['materialUnitPrice', currentItem.materialUnitPrice],
        ['laborUnitPrice', currentItem.laborUnitPrice],
        ['equipmentUnitPrice', currentItem.equipmentUnitPrice],
      ].sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0];

      return {
        materialUnitPrice: category === 'materialUnitPrice' ? unitValue : 0,
        laborUnitPrice: category === 'laborUnitPrice' ? unitValue : 0,
        equipmentUnitPrice: category === 'equipmentUnitPrice' ? unitValue : 0,
      };
    }

    return {
      materialUnitPrice: supplyType === 'MATERIAL' || supplyType === 'OTHER' ? unitValue : 0,
      laborUnitPrice: supplyType === 'LABOR' || supplyType === 'SERVICE' ? unitValue : 0,
      equipmentUnitPrice: supplyType === 'EQUIPMENT' ? unitValue : 0,
    };
  }

  private getApiErrorMessage(error: HttpErrorResponse): string {
    const body = error.error;

    if (typeof body === 'string' && body.trim()) {
      return body;
    }

    if (body && typeof body === 'object') {
      const detail = body.detail;
      if (typeof detail === 'string') {
        return detail;
      }

      const firstValue = Object.values(body)[0];
      if (Array.isArray(firstValue) && firstValue.length > 0) {
        return String(firstValue[0]);
      }
      if (typeof firstValue === 'string') {
        return firstValue;
      }
    }

    return 'Não foi possível salvar a composição. Tente novamente.';
  }

  private generateClientId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return [Date.now().toString(36), Math.random().toString(36).slice(2)].join('-');
  }
}
