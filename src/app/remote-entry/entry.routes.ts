import { Routes } from '@angular/router';
import { hubPermissionGuard } from '@daruix/hub-auth';

export const OBRAS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('../features/obras/pages/obras-list/obras-list').then((m) => m.ObrasList),
  },
  {
    path: 'composicao-servicos',
    canActivate: [hubPermissionGuard],
    data: {
      permission: 'supplies.view',
    },
    loadComponent: () =>
      import('../features/obras/pages/cadastro-composicao-servico/cadastro-composicao-servico').then(
        (m) => m.CadastroComposicaoServico,
      ),
  },
  {
    path: 'mapa-cotacao',
    pathMatch: 'full',
    redirectTo: 'mapas-cotacao',
  },
  {
    path: 'mapas-cotacao',
    canActivate: [hubPermissionGuard],
    data: {
      permission: 'quotation_map.manage',
    },
    loadComponent: () =>
      import('../features/obras/pages/mapas-cotacao/mapas-cotacao').then((m) => m.MapasCotacao),
  },
  {
    path: 'leilao-reverso',
    loadComponent: () =>
      import('../features/obras/pages/leilao-reverso/leilao-reverso').then((m) => m.LeilaoReverso),
  },
];
