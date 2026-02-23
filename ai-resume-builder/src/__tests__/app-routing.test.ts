import { describe, expect, it } from 'vitest';
import { View } from '../../types';
import { pathToView, viewToPath } from '../app-routing';

describe('app-routing', () => {
  it('maps view to expected route path', () => {
    expect(viewToPath(View.DASHBOARD)).toBe('/dashboard');
    expect(viewToPath(View.AI_ANALYSIS)).toBe('/ai-analysis');
    expect(viewToPath(View.AI_INTERVIEW)).toBe('/ai-interview');
    expect(viewToPath(View.PROFILE)).toBe('/profile');
    expect(viewToPath(View.LOGIN)).toBe('/login');
  });

  it('maps route path back to expected view', () => {
    expect(pathToView('/dashboard')).toBe(View.DASHBOARD);
    expect(pathToView('/ai-analysis')).toBe(View.AI_ANALYSIS);
    expect(pathToView('/ai-interview')).toBe(View.AI_INTERVIEW);
    expect(pathToView('/profile')).toBe(View.PROFILE);
    expect(pathToView('/login')).toBe(View.LOGIN);
  });

  it('handles root and unknown routes', () => {
    expect(pathToView('/')).toBe(View.DASHBOARD);
    expect(pathToView('/unknown-route')).toBe(View.LOGIN);
  });
});

