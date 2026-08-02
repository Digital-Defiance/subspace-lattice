import type { TutorialLesson } from '../tutorial/tutorial-types';
import { TUTORIAL_LESSONS } from '../tutorial/tutorial-model';

/** Curriculum pack for Academy or short drill packs. */
export interface TutorialPackConfig {
  id: string;
  title: string;
  kicker: string;
  lessons: readonly TutorialLesson[];
  progressKey: string;
  homeHref?: string;
  completeHref?: string;
  completeLabel?: string;
}

export const ACADEMY_PACK: TutorialPackConfig = {
  id: 'academy',
  title: 'Fleet Academy',
  kicker: 'Core training',
  lessons: TUTORIAL_LESSONS,
  progressKey: 'subspace-lattice:tutorial-progress',
  homeHref: '/',
  completeHref: '/play',
  completeLabel: 'Practice against the AI',
};
