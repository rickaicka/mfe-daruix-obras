import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { HubNavigationService, HubSessionService } from '@daruix/hub-auth';

import { CardListComponent, CardListItemComponent, CardSquareComponent } from '@daruix/hub-ui';

import { HubMenuItem } from '../../models/hub-shared.model';

import { ObrasService } from '../../services/obras.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-obras-list',
  imports: [CardSquareComponent, CardListComponent, CardListItemComponent],
  templateUrl: './obras-list.html',
  styleUrl: './obras-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObrasList {
  readonly session = inject(HubSessionService);

  readonly navigation = inject(HubNavigationService);
  readonly router = inject(Router);

  private readonly obrasService = inject(ObrasService);

  readonly actualModule = computed(() =>
    this.session.userModules().find((module) => module.slug === 'obras'),
  );
  readonly moduleIcone =
    this.router.currentNavigation()?.extras.state?.['moduleIcone'] ??
    history.state?.['moduleIcone'] ??
    null;

  readonly features = computed<HubMenuItem[]>(
    () => (this.actualModule()?.children ?? []) as HubMenuItem[],
  );

  readonly userModulesChildren = computed(() => this.features().length);

  itemIsFavorite(item: HubMenuItem): boolean {
    return Boolean(item.favorito);
  }

  toggleFavorite(nextFavoriteState: boolean, item: HubMenuItem): void {
    this.obrasService.updateFavorite(item.slug, nextFavoriteState).subscribe({
      next: (updatedItem) => {
        this.session.updateModuleFavorite(item.slug, Boolean(updatedItem.favorito));
      },

      error: (error) => {
        console.error('Não foi possível atualizar o favorito.', error);
      },
    });
  }
}
