import { describe, expect, it } from 'vitest';
import { mapLatticeTeiDocs } from './leaderboard-rows';

describe('mapLatticeTeiDocs', () => {
  it('filters empty matches and sorts by TEI score then games', () => {
    const rows = mapLatticeTeiDocs([
      {
        id: 'a',
        data: {
          displayName: 'Ada',
          localAi: { displayGrade: 'I15', matches: 2, wins: 1 },
        },
      },
      {
        id: 'b',
        data: {
          displayName: 'Bea',
          localAi: { displayGrade: 'I40', matches: 1, wins: 1 },
        },
      },
      {
        id: 'c',
        data: {
          displayName: 'Cal',
          localAi: { displayGrade: 'P0', matches: 0, wins: 0 },
        },
      },
      {
        id: 'd',
        data: {
          displayName: 'Dee',
          localAi: { displayGrade: 'I40', matches: 5, wins: 3 },
        },
      },
    ]);
    expect(rows.map((r) => r.uid)).toEqual(['d', 'b', 'a']);
    expect(rows[0]).toMatchObject({
      displayName: 'Dee',
      displayGrade: 'I40',
      matches: 5,
      wins: 3,
    });
  });

  it('maps the online TEI track', () => {
    const rows = mapLatticeTeiDocs(
      [
        {
          id: 'o1',
          data: {
            displayName: 'Orbit',
            online: { displayGrade: 'E20', matches: 3, wins: 2 },
            localAi: { displayGrade: 'I99', matches: 50, wins: 40 },
          },
        },
      ],
      'online',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uid: 'o1',
      displayGrade: 'E20',
      matches: 3,
      wins: 2,
    });
  });
});
