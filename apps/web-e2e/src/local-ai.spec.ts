import { expect, test } from '@playwright/test';

test.describe('pass and play', () => {
  test('starts a hotseat fleet game and gates the board between turns', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('enter-game').click();
    // Auth gate: local controls are visible without signing in
    await page.getByTestId('play-pass-and-play').click();
    await expect(page.getByTestId('pass-and-play-setup')).toBeVisible();
    await page.getByTestId('pass-name-white').fill('Alex');
    await page.getByTestId('pass-name-black').fill('Blake');
    await page.getByTestId('pass-setup-start').click();
    await expect(page.getByTestId('pass-and-play-game')).toBeVisible();
    await expect(page.getByText('Pass & Play')).toBeVisible();
    await expect(page.getByTestId('pass-hand-off')).toContainText(/Alex/i);
    await expect(page.getByText(/Rules:/)).toContainText('hybrid-fleet');

    await page.getByTestId('cell-5-1').click();
    await page.getByTestId('cell-5-2').click();

    await expect(page.getByTestId('pass-handoff-overlay')).toBeVisible();
    await expect(page.getByTestId('pass-handoff-overlay')).toContainText(
      /Blake at helm/i,
    );
    await page.getByTestId('pass-handoff-ready').click();
    await expect(page.getByTestId('pass-handoff-overlay')).toHaveCount(0);
    await expect(page.getByTestId('pass-hand-off')).toContainText(/Blake/i);

    await page.getByTestId('exit-pass-and-play').click();
    await expect(page.getByTestId('play-pass-and-play')).toBeVisible();
  });
});

test.describe('local AI', () => {
  test('starts a local AI fleet game from the auth gate and can move', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('enter-game')).toBeVisible();
    await page.getByTestId('enter-game').click();
    await expect(page.getByTestId('ai-strength')).toBeVisible();
    await page.getByTestId('play-vs-ai').click();
    await expect(page.getByTestId('local-ai-game')).toBeVisible();
    await expect(page.getByText('Local vs AI')).toBeVisible();
    await expect(page.getByText(/Rules:/)).toContainText('hybrid-fleet');

    // White escort at (5,1) → (5,2); relay lives at (5,3) under fleet rules
    await page.getByTestId('cell-5-1').click();
    await page.getByTestId('cell-5-2').click();

    await expect(page.getByText(/Turn:/)).toContainText(/BLACK|WHITE/);

    await page.getByTestId('exit-local-ai').click();
    await expect(page.getByTestId('play-vs-ai')).toBeVisible();
  });

  test('advisor requires consent then highlights a suggestion', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('enter-game').click();
    await page.getByTestId('play-vs-ai').click();
    await expect(page.getByTestId('advisor-panel')).toBeVisible();

    await page.getByTestId('advisor-ask').click();
    await expect(page.getByTestId('advisor-consent')).toBeVisible();
    await page.getByTestId('advisor-consent-yes').click();

    await expect(page.getByTestId('advisor-assisted')).toBeVisible();
    await expect(page.getByTestId('advisor-suggestion')).toBeVisible();
    await expect(page.getByTestId('advisor-suggestion')).toContainText('→');
    await expect(page.getByTestId('floating-coach-chip')).toBeVisible();
    await expect(page.getByTestId('floating-coach-chip')).toContainText('→');
  });
});

test.describe('standings link', () => {
  test('landing points at federation standings hub', async ({ page }) => {
    await page.goto('/');
    const standings = page.getByTestId('federation-standings');
    await expect(standings).toBeVisible();
    await expect(standings).toHaveAttribute(
      'href',
      'https://iwgf.org/leaderboard',
    );
  });
});

test.describe('academy', () => {
  test('completes the first scripted lesson', async ({ page }) => {
    await page.goto('/tutorial');

    await expect(page.getByText('Give your first order')).toBeVisible();
    await page.getByTestId('cell-5-1').click();
    await page.getByTestId('cell-5-2').click();

    await expect(page.getByTestId('tutorial-continue')).toBeVisible();
    await expect(page.getByText('Order confirmed. Escorts move')).toBeVisible();
  });

  test('operates the training board with arrow keys', async ({ page }) => {
    await page.goto('/tutorial');

    const escortCell = page.getByTestId('cell-5-1');
    await escortCell.focus();
    await escortCell.press('Enter');
    await escortCell.press('ArrowUp');
    await expect(page.getByTestId('cell-5-2')).toBeFocused();
    await page.getByTestId('cell-5-2').press('Enter');

    await expect(page.getByTestId('tutorial-continue')).toBeVisible();
  });
});
