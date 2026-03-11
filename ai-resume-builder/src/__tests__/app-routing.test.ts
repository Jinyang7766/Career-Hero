import { describe, expect, it } from 'vitest';
import { View } from '../../types';
import { pathToView, viewToPath } from '../app-routing';

describe('app-routing', () => {
  it('maps view to expected route path', () => {
    expect(viewToPath(View.DASHBOARD)).toBe('/dashboard');
    expect(viewToPath(View.AI_ANALYSIS)).toBe('/ai-analysis');
    expect(viewToPath(View.AI_INTERVIEW)).toBe('/ai-interview');
    expect(viewToPath(View.PROFILE)).toBe('/profile');
    expect(viewToPath(View.CAREER_PROFILE)).toBe('/career-profile/upload');
    expect(viewToPath(View.CAREER_PROFILE_RESULT)).toBe('/career-profile/result');
    expect(viewToPath(View.TEMPLATES)).toBe('/preview/edit');
    expect(viewToPath(View.LOGIN)).toBe('/login');
  });

  it('maps route path back to expected view', () => {
    expect(pathToView('/dashboard')).toBe(View.DASHBOARD);
    expect(pathToView('/ai-analysis')).toBe(View.AI_ANALYSIS);
    expect(pathToView('/ai-interview')).toBe(View.AI_INTERVIEW);
    expect(pathToView('/profile')).toBe(View.PROFILE);
    expect(pathToView('/career-profile')).toBe(View.CAREER_PROFILE);
    expect(pathToView('/career-profile/result')).toBe(View.CAREER_PROFILE_RESULT);
    expect(pathToView('/preview/edit')).toBe(View.PREVIEW);
    expect(pathToView('/editor')).toBe(View.PREVIEW);
    expect(pathToView('/templates')).toBe(View.PREVIEW);
    expect(pathToView('/login')).toBe(View.LOGIN);
  });

  it('handles root and unknown routes', () => {
    expect(pathToView('/')).toBe(View.DASHBOARD);
    expect(pathToView('/unknown-route')).toBe(View.LOGIN);
  });
});
