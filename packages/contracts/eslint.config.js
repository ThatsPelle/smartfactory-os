// @ts-check
import nodeConfig from '@sfos/eslint-config/node';

/** @type {import('eslint').Linter.Config[]} */
export default [{ ignores: ['dist/**', '.turbo/**'] }, ...nodeConfig];
