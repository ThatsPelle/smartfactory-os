// @ts-check
import nodeConfig from '@sfos/eslint-config/node';

/**
 * Module template — flat config (lint-as-published).
 *
 * Real modules generated from this template inherit this file; adjust per
 * module if/when the module needs the `react` preset for UI work.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [{ ignores: ['dist/**', '.turbo/**'] }, ...nodeConfig];
