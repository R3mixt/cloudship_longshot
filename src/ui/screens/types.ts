import type { AppApi, ScreenId } from '@/app/types';

export interface UiContext {
  api: AppApi;
  /** Re-reads save state and redraws whatever is open. */
  refresh(): void;
}

/**
 * Every screen is built once and updated in place. Rebuilding on each show
 * would be simpler but would destroy the element the player has focused, so
 * `refresh` re-reads the save and writes new values into existing nodes.
 */
export interface Screen {
  readonly id: ScreenId;
  /** Full-viewport layer added to the overlay root. */
  readonly layer: HTMLElement;
  /** Dialog element; the focus trap boundary. */
  readonly dialog: HTMLElement;
  refresh(): void;
  /** Moves focus to the screen's primary control. */
  focusPrimary(): void;
  /** Screen-specific shortcuts. Return true when the key was consumed. */
  onKeyDown?(event: KeyboardEvent): boolean;
  onShow?(): void;
  onHide?(): void;
  destroy?(): void;
}
