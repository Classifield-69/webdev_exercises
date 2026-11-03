// The night before the defence. Runs the structural gates of Exercises 2 to 5 one after
// another, then actually measures coverage, which the per-exercise checks deliberately
// do not because they run in a bare clone with nothing installed.
//
//   node checks/project.mjs
//
// A green run means nothing is structurally missing. It does not mean the project is good,
// and it will not answer a single question the committee asks you.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, filled, json, prose, read, report, run } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));

for (const exercise of ['ex2', 'ex3', 'ex4', 'ex5']) {
  const { code, out } = run('node', [join(here, `${exercise}.mjs`)], { timeout: 300_000 });
  const first = out.split('\n').find((l) => l.startsWith('FAIL')) ?? '';
  const tally = out.split('\n').find((l) => /checks passed/.test(l)) ?? '';
  check(`${exercise} passes`, code === 0, [tally, first].filter(Boolean).join('  ·  '));
}

// The real coverage run, not the structural question of whether a gate exists.
const pkg = json('package.json');
if (pkg?.scripts?.coverage) {
  const { code, out } = run('npm', ['run', 'coverage'], { timeout: 600_000 });
  check('coverage meets the gate', code === 0, code === 0 ? '' : out.split('\n').filter(Boolean).slice(-4).join(' | '));
  if (pkg.scripts['coverage:services']) {
    const services = run('npm', ['run', 'coverage:services'], { timeout: 600_000 });
    check('the service layer meets its gate', services.code === 0,
      services.code === 0 ? '' : services.out.split('\n').filter(Boolean).slice(-4).join(' | '));
  }
} else if (existsSync('pyproject.toml') || existsSync('requirements.txt')) {
  const { code, out } = run('python3', ['-m', 'pytest', '--cov=src', '--cov-fail-under=80', '-q'], { timeout: 600_000 });
  check('coverage meets the gate', code === 0, code === 0 ? '' : out.split('\n').filter(Boolean).slice(-4).join(' | '));
} else {
  check('coverage meets the gate', false, 'no coverage command found: see AGENTS.md');
}

// Comments stripped: the template's own guidance is longer than most first drafts.
const defense = filled(prose(read('DEFENSE.md'))).join('\n');
check('you have written your defence notes', defense.length > 800,
  `${defense.length} characters of your own so far; answer every heading, including the last one`);

report('The course project · before the defence');
