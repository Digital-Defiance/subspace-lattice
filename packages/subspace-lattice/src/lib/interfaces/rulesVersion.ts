export type RulesVersion =
  | 'classic'
  | 'hybrid'
  | 'hybrid-spool'
  /** Track A fleet candidate: hold1 / contested / act100 / initiative relay. */
  | 'hybrid-fleet';
