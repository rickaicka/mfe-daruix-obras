import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CadastroComposicaoServico } from './cadastro-composicao-servico';

describe('CadastroComposicaoServico', () => {
  let component: CadastroComposicaoServico;
  let fixture: ComponentFixture<CadastroComposicaoServico>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CadastroComposicaoServico],
    }).compileComponents();

    fixture = TestBed.createComponent(CadastroComposicaoServico);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should preserve separate costs and calculate the line without doubling the unit total', () => {
    const draft = {
      ...component.createItemDraft(),
      supply: { id: 1, description: 'Serviço misto', supply_type: 'SERVICE', unit: 'M2' } as any,
      quantity: 3,
      materialUnitPrice: 100,
      laborUnitPrice: 50,
      equipmentUnitPrice: 0,
      unitValue: 999,
    };
    const row = component.createItemRow(draft);
    expect(row.materialUnitPrice).toBe(100);
    expect(row.laborUnitPrice).toBe(50);
    expect(row.unitValue).toBe(150);
    expect(row.total).toBe(450);
    const reopened = component.itemToDraft(row);
    expect(reopened.materialUnitPrice).toBe(100);
    expect(reopened.laborUnitPrice).toBe(50);
  });

  it('should retain four decimal unit costs until multiplying by quantity', () => {
    const draft = {
      ...component.createItemDraft(),
      supply: { id: 1, description: 'Insumo', supply_type: 'MATERIAL', unit: 'M2' } as any,
      quantity: 1000,
      materialUnitPrice: 1.2345,
      laborUnitPrice: 0,
    };
    expect(component.createItemRow(draft).total).toBe(1234.5);
  });

  it('should preserve equipment on an existing row', () => {
    const draft = {
      ...component.createItemDraft(),
      supply: { id: 1, description: 'Equipamento', supply_type: 'EQUIPMENT', unit: 'H' } as any,
      quantity: 2,
      materialUnitPrice: 10,
      laborUnitPrice: 20,
      equipmentUnitPrice: 5,
    };
    const row = component.createItemRow(draft);
    expect(row.total).toBe(70);
    expect(component.itemToDraft(row).equipmentUnitPrice).toBe(5);
  });
  it('should flatten nested composition groups when the parent is expanded', () => {
    component.compositionGroupTree.set([{ id: 1, code: '03', name: 'Concreto', parent: null, children: [
      { id: 2, code: '03.10', name: 'Formas', parent: 1, children: [] },
    ] }]);
    component.expandedGroupIds.set(new Set([1]));
    expect(component.compositionGroupRows().map((row) => row.node.code)).toEqual(['03', '03.10']);
    component.toggleGroup(1);
    expect(component.compositionGroupRows().map((row) => row.node.code)).toEqual(['03']);
  });

});

// A árvore TCPO não afeta os cálculos nem a expansão de subcomposições.
