// Exercise 4 self-check: is the project deployable and is the report honest?
//   node checks/ex4.mjs                      structure only
//   node checks/ex4.mjs https://your-app.url  also checks the live site
import { answered, check, filled, json, manifestValue, read, report, section } from './lib.mjs';

check('a Dockerfile exists', read('Dockerfile') !== null, 'the image builds and runs your app');
const env = read('.env.example');
check('.env.example lists your variables', filled(env).length >= 2, 'every variable your app needs, with placeholder values');
check('no .env is committed', read('.env') === null, 'real values never enter the repository');

const ci = read('.github/workflows/ci.yml');
check('CI runs on every push', ci !== null && /on:\s*[\s\S]{0,40}push/.test(ci), 'the template ships a workflow that runs your tests');

// ---- the coverage gate -------------------------------------------------------
// Structure only, deliberately: this check runs in a shallow clone with no dependencies
// installed. The green CI run on your latest push is the gate; this only asks whether one exists.
const pkg = json('package.json');
const make = read('Makefile') ?? '';
const pyproject = read('pyproject.toml') ?? '';
const coverageCommand = Boolean(pkg?.scripts?.coverage) || /^coverage:/m.test(make) || /\[tool\.(coverage|pytest)/.test(pyproject);
check('a coverage command exists', coverageCommand, 'one command that measures coverage and fails below the threshold');

const THRESHOLD = /--test-coverage-lines|--cov-fail-under|fail_under|coverageThreshold|--check-coverage/;
const ciAndScripts = `${ci ?? ''}\n${JSON.stringify(pkg?.scripts ?? {})}\n${make}\n${pyproject}`;
check('CI enforces the threshold', ci !== null && /coverage/i.test(ci) && THRESHOLD.test(ciAndScripts),
  'CI must fail when coverage drops, otherwise the number is decoration');

const numbers = [...ciAndScripts.matchAll(/(?:--test-coverage-lines[= ]|--cov-fail-under[= ]|fail_under\s*=\s*)(\d{1,3})/g)].map((m) => Number(m[1]));
check('the service layer is gated at 100%', numbers.includes(100),
  `thresholds found: ${numbers.join(', ') || 'none'}; the layer that holds your rules is the one that must be fully covered`);
check('the whole project is gated at 80% or more', numbers.some((n) => n >= 80 && n < 100),
  'a second, lower gate over all of src: 80 is the course minimum');

// ---- the UI is graded, so the checklist is a deliverable ---------------------
const ui = read('docs/UI.md');
check('docs/UI.md exists', ui !== null, 'the UI checklist ships with the template; fill it in');
if (ui) {
  const items = (ui.match(/^\s*-\s*\[[ xX]\]/gm) ?? []).length;
  const unticked = (ui.match(/^\s*-\s*\[ \]/gm) ?? []).length;
  check('the UI checklist is complete', items >= 10, `found ${items} checklist item(s), the template ships more than 10`);
  check('every UI item is ticked', items > 0 && unticked === 0, unticked ? `${unticked} item(s) still unticked: fix them or say in writing why not` : '');
  // The template ships "how I checked:" as an empty label on every item, so only a line
  // with something after the colon counts as evidence.
  const evidenced = (ui.match(/how i checked:\s*\S.*|как проверих:\s*\S.*/gi) ?? []).length;
  const screenshots = /!\[|https?:\/\/\S+\.(png|jpg|jpeg|webp)/i.test(ui);
  check('the UI claims carry evidence', evidenced >= 5 && screenshots,
    `${evidenced} item(s) say how you checked them, screenshots: ${screenshots ? 'yes' : 'no'}`);
}

const readiness = read('READINESS.md');
check('READINESS.md exists', readiness !== null, 'the main deliverable of this exercise');
if (readiness) {
  for (const [label, heading] of [
    ['the live URL and how to verify it', 'Live URL'],
    ['the environment variables table', 'Environment variables'],
    ['what happens when things fail', 'fail'],
    ['the four states of one screen', 'states'],
    ['the request waterfall', 'waterfall'],
    ['the security basics checked', 'Security'],
    ['known gaps, ranked by risk', 'gaps'],
    ['the model feature in production', 'Model'],
    ['the MCP server in production', 'MCP'],
  ]) {
    check(label, filled(section(readiness, `.*${heading}.*`)).length >= 1, `section about ${heading} is missing or empty`);
  }
  check('gaps are listed honestly', !/no gaps|nothing is missing|everything is ready/i.test(readiness), 'a project with no gaps is a report nobody believes');
  check('every claim says how you checked it', /how i checked|как проверих/i.test(readiness), 'add a "How I checked" note to the claims');
  const model = section(readiness, '.*Model.*') ?? '';
  check('you say what data leaves the app', /leaves|sends?|third|outside|изпраща|напуска/i.test(model), 'which user data goes to the provider, and what does not');
  check('you priced one model call', /\$|cent|token|лев|цена|cost/i.test(model), 'list price per request, from the provider\'s pricing page on a stated date');
  check('you say what happens when the provider is down', /down|fallback|timeout|429|rate|резерв/i.test(model), '');
  const mcp = section(readiness, '.*MCP.*') ?? '';
  check('you say who may call your MCP tools', /token|who|user|permission|allowed|право|потребител/i.test(mcp), 'a tool call acts as somebody: say who, and what that grants');
}

// The deployment's address lives in course.json from now on, so this check can find
// your site without being handed the URL each time.
const declaredUrl = manifestValue('liveUrl');
check('course.json names your live URL', Boolean(declaredUrl), 'fill in liveUrl, with no trailing slash');
if (declaredUrl) check('the live URL is https', declaredUrl.startsWith('https://'), `course.json says ${declaredUrl}`);

// An argument still wins, so you can point the check at a staging copy while you work.
const url = process.argv[2] ?? declaredUrl;
if (url) {
  const base = url.replace(/\/$/, '');
  check('the URL is https', base.startsWith('https://'), 'a public deployment must be https');
  try {
    const started = Date.now();
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(90000) });
    const seconds = Math.round((Date.now() - started) / 1000);
    check(`GET ${base}/health returns 200`, res.status === 200, `got ${res.status}`);
    if (seconds > 5) console.log(`       (it took ${seconds}s: a free service was asleep, which is expected)`);
  } catch (error) {
    check(`GET ${base}/health returns 200`, false, error.name === 'TimeoutError' ? 'no answer within 90s' : error.message);
  }
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(90000) });
    const html = await res.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
    check('the site serves a page', res.ok && /text\/html/.test(res.headers.get('content-type') ?? ''), `got ${res.status} ${res.headers.get('content-type') ?? ''}`);
    check('the page has a real title', title.length > 3 && !/^(document|untitled|app|index|react app|vite)$/i.test(title), `<title> is "${title}"`);
  } catch (error) {
    check('the site serves a page', false, error.name === 'TimeoutError' ? 'no answer within 90s' : error.message);
  }
} else {
  console.log('Tip: fill in liveUrl in course.json, or pass a URL: node checks/ex4.mjs https://your-app.onrender.com\n');
}

report('Exercise 4 · deployment and readiness');
