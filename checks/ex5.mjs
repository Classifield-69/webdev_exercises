// Exercise 5 self-check: is the review evidenced and were the fixes test-first?
//   node checks/ex5.mjs
import { readFileSync } from 'node:fs';
import { acceptanceIds, check, filled, git, read, report, section, testFiles } from './lib.mjs';

const review = read('REVIEW.md');
check('REVIEW.md exists', review !== null, 'the review of your partner\'s project lives in your repository');

if (review) {
  const rows = (review.match(/^\|\s*R\d+\s*\|/gm) ?? []).length;
  check('the findings table has rows', rows >= 4, `found ${rows} finding(s) with an id like R1`);
  const verdicts = /confirmed|false positive|unsure|потвърден|фалшив/i.test(review);
  check('every finding carries a verdict', verdicts, 'confirmed, false positive or unsure');
  check('evidence is recorded', /evidence|доказателств/i.test(review), 'a file and line, a request, or a failing test');
  check('precision per pass is written', filled(section(review, '.*[Pp]recision.*|.*[Тт]очност.*')).length >= 1, 'how many of each pass\'s findings were real');
  check('you noted what no agent found', /no agent|никой агент|не откри/i.test(review), 'the miss is the interesting part');
  check('you replied to the review of your own project', filled(section(review, '.*[Rr]eplies.*|.*[Оо]тговор.*')).length >= 1, 'fixed with a commit, or disputed with evidence');

  // The project is bigger now, so the review has to look at the newer surfaces too.
  check('the review covers the model feature', /model|модел|gemini|openai|inference|prompt/i.test(review),
    'a feature that sends user data to a third party and can be wrong is the first place to look');
  check('the review covers the MCP server', /mcp|tool call|инструмент/i.test(review),
    'the MCP tools are a second front door into the same data: check they carry the same rules');
  check('at least one finding is about authorization', /authoriz|authoris|ownership|owner|IDOR|403|достъп|собствен/i.test(review),
    'who may do this, not who are you: the commonest real bug in these projects');
  check('at least one finding is about the UI or accessibility', /\bUI\b|accessib|keyboard|contrast|focus|screen reader|интерфейс|достъпност|клавиатура/i.test(review),
    'the UI checklist is graded, so the review reads it too');
}

const defense = read('DEFENSE.md');
check('DEFENSE.md is written', defense !== null && filled(defense).length >= 12 && !/<[a-z ]+>/i.test(defense ?? ''),
  'your own answers, not the template: the defence is next, and this is your notes for it');

// The gate from Exercise 3 must survive the fixes: a fix that quietly drops a test is a regression.
const spec = read('SPEC.md');
const ids = acceptanceIds(spec);
const testText = testFiles('.').map((f) => readFileSync(f, 'utf8')).join('\n');
const untested = ids.filter((id) => !testText.includes(id));
check('traceability survived the fixes', ids.length > 0 && untested.length === 0,
  untested.length ? `no test names ${untested.join(', ')} any more` : 'no AC-n ids in SPEC.md');

const log = git(['log', '--oneline', '-n', '200']);
const tests = [...log.matchAll(/^\w+\s+test\((R\d+)\)/gim)].map((m) => m[1].toUpperCase());
const fixes = [...log.matchAll(/^\w+\s+fix\((R\d+)\)/gim)].map((m) => m[1].toUpperCase());
check('failing tests are committed before their fixes', tests.length >= 1, 'commit test(Rn) first, watch CI go red, then fix(Rn)');
const unpaired = fixes.filter((f) => !tests.includes(f));
check('every fix has its test', unpaired.length === 0, unpaired.length ? `no test commit for ${unpaired.join(', ')}` : '');

// A test(Rn) commit that touches no test file is a label, not a test.
const shas = [...log.matchAll(/^(\w+)\s+test\(R\d+\)/gim)].map((m) => m[1]);
const empty = shas.filter((sha) => {
  const files = git(['show', '--name-only', '--format=', sha]).split('\n').filter(Boolean);
  return !files.some((f) => /(\.test\.|_test\.|\.spec\.|^tests?\/|test_)/.test(f));
});
check('each test commit really touches a test file', shas.length > 0 && empty.length === 0,
  empty.length ? `${empty.join(', ')} is labelled test(Rn) but changes no test file` : '');

report('Exercise 5 · adversarial review');
