/* eslint-env node */
export default {
  extends: ['@commitlint/config-angular'],
  parserPreset: 'conventional-changelog-angular',
  rules: {
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 72],
    'header-full-stop': [2, 'never', '.'],
    'body-leading-blank': [2, 'always'],
    'type-enum': [2, 'always', ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style']],
  },
};
