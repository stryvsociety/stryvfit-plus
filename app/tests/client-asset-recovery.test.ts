import { describe, expect, test } from 'bun:test';
import { isRecoverableChunkLoadError } from '../src/lib/clientAssetRecovery';

describe('client asset recovery', () => {
  test('treats stale Next.js CSS app-shell assets as recoverable', () => {
    expect(
      isRecoverableChunkLoadError(
        'Resource http://localhost:3001/_next/static/css/app/layout.css?v=1783125083485 load failed'
      )
    ).toBe(true);
    expect(
      isRecoverableChunkLoadError(
        'Resource https://stryvsocietyfit.com/_next/static/css/app/layout.css load failed'
      )
    ).toBe(true);
  });

  test('does not recover arbitrary missing resources', () => {
    expect(isRecoverableChunkLoadError('Resource https://stryvsocietyfit.com/logo.png load failed')).toBe(false);
  });
});
