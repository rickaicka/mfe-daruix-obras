import { Routes } from '@angular/router';
import { hubPermissionGuard } from '@daruix/hub-auth';

export const OBRAS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [hubPermissionGuard],
    // data: {
    //   permission: 'obras.view',
    // },
    loadComponent: () =>
      import('../features/obras/pages/obras-list/obras-list').then((m) => m.ObrasList),
  },
  {
    path: 'composicao-servicos',
    canActivate: [hubPermissionGuard],
    // data: {
    //   permission: 'obras.view',
    // },
    loadComponent: () =>
      import('../features/obras/pages/cadastro-composicao-servico/cadastro-composicao-servico').then(
        (m) => m.CadastroComposicaoServico,
      ),
  },
];
