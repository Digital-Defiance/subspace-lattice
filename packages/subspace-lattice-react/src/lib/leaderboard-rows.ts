/**
 * Pure helpers for the TEI leaderboard (unit-tested without Firestore).
 */
export interface LeaderboardRow {
  uid: string;
  displayName: string;
  displayGrade: string;
  matches: number;
  wins: number;
}

export type TeiTrack = 'localAi' | 'online';

export function mapLatticeTeiDocs(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
  track: TeiTrack = 'localAi',
): LeaderboardRow[] {
  return docs
    .map((docSnap) => {
      const skill = docSnap.data[track] as
        | {
            displayGrade?: string;
            matches?: number;
            wins?: number;
          }
        | undefined;
      if (!skill?.displayGrade || !(skill.matches && skill.matches > 0)) {
        return null;
      }
      return {
        uid: docSnap.id,
        displayName: String(docSnap.data.displayName ?? 'Commander'),
        displayGrade: skill.displayGrade,
        matches: skill.matches,
        wins: skill.wins ?? 0,
      };
    })
    .filter((row): row is LeaderboardRow => row !== null)
    .sort((a, b) => {
      const scoreA = Number(a.displayGrade.slice(1)) || 0;
      const scoreB = Number(b.displayGrade.slice(1)) || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.matches - a.matches;
    });
}
