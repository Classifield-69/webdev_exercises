// Exercise 3 self-check: is the feature delivered through every layer?
//   node checks/ex3.mjs
import { existsSync, readFileSync } from 'node:fs';
import {
  acceptanceIds, answered, check, filled, findFile, findFiles, git, grep, json, prose, read, report, run, section, testFiles,
} from './lib.mjs';

const migration = findFile('.', (name, full) => /\.(sql|js|ts|py)$/.test(name) && /migrat/i.test(full));
check('a migration file exists', migration !== null, 'the data model change is delivered as a numbered migration');

const tests = testFiles('.');
check('automated tests exist', tests.length > 0, 'at least one test for the rule and one for the API');

// ---- the suite actually runs -------------------------------------------------
const pkg = json('package.json');
const python = existsSync('pytest.ini') || existsSync('pyproject.toml') || existsSync('requirements.txt');
if (pkg?.scripts?.test) {
  const { code, out } = run('npm', ['test']);
  check('the test suite passes', code === 0, code === 0 ? '' : out.split('\n').filter(Boolean).slice(-3).join(' | '));
} else if (python) {
  const { code, out } = run('python3', ['-m', 'pytest', '-q']);
  check('the test suite passes', code === 0, code === 0 ? '' : out.split('\n').filter(Boolean).slice(-3).join(' | '));
} else {
  check('the test suite passes', false, 'no npm test script and no pytest setup found: the suite must be runnable by one command');
}

// ---- traceability: a criterion nobody tested is a criterion nobody checked ----
const spec = read('SPEC.md');
const ids = acceptanceIds(spec);
const testText = tests.map((f) => readFileSync(f, 'utf8')).join('\n');
const untested = ids.filter((id) => !testText.includes(id));
check('every acceptance criterion traces to a test', ids.length > 0 && untested.length === 0,
  ids.length === 0 ? 'no AC-n ids in SPEC.md; see Exercise 2' : untested.length ? `no test names ${untested.join(', ')}` : '');

// ---- the model feature -------------------------------------------------------
const modelSpec = prose(section(spec, 'The model feature'));
const PROVIDER = /generativelanguage|googleapis|gemini|openai|anthropic|api\.groq|api\.mistral|huggingface|transformers|onnxruntime|ollama|replicate/i;
const modelFiles = grep(PROVIDER, { where: (f) => !/\.md$|\.env|README/i.test(f) });
check('the model feature is built', modelFiles.length > 0,
  'no call to a model provider found in the source; the feature is part of the project, not an idea in the spec');

const inHttp = modelFiles.filter((f) => /(^|\/)(routes?|controllers?|api|handlers?|views?)(\/|$)/i.test(f));
check('the model call lives outside the HTTP layer', modelFiles.length > 0 && inHttp.length === 0,
  inHttp.length ? `${inHttp[0]} both handles a request and calls the model; move the call into a service` : '');

const modelText = modelFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
check('the model call has a timeout', /AbortSignal|abort|timeout|Timeout|deadline/.test(modelText),
  'a provider that never answers must not hang your request forever');
check('the model call has a fallback', /catch|except\b/.test(modelText) && /fallback|default|heuristic|резерв/i.test(modelText + modelSpec),
  'what runs when the key is missing, the provider is down, or you are rate-limited?');
const fakedIn = tests.filter((f) => /mock|stub|fake|monkeypatch|inject|double/i.test(readFileSync(f, 'utf8')));
check('the model feature is tested without calling the model', fakedIn.length > 0,
  'pass in a fake client: tests that need the network are slow, flaky and metered');

// ---- the project's own MCP server -------------------------------------------
// The server's own source, not its tests: a test about the MCP server legitimately
// contains the words this check looks for.
const isTest = (path) => /(\.test\.|_test\.|\.spec\.|(^|\/)tests?\/|(^|\/)test_)/.test(path);
const mcpFiles = findFiles('.', (name, full) => /\.(js|mjs|cjs|ts|py)$/.test(name) && /mcp/i.test(full) && !isTest(full) && !/check\.mjs$/.test(name));
const mcpText = mcpFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
check('the MCP server is in the repository', mcpFiles.length > 0, 'it grew out of Exercise 1 and now serves this project');
check('the MCP server speaks the protocol', /initialize/.test(mcpText) && /tools\/list/.test(mcpText),
  'the handshake and the tool list are what a client calls first');

// The load-bearing check of the whole design: one set of rules, two front doors.
const reachesServices = /services?[\/.]|service\b/i.test(mcpText);
const reachesData = /\b(SELECT|INSERT|UPDATE|DELETE)\b\s|db\.prepare|cursor\.execute|knex\(|prisma\./i.test(mcpText);
check('the MCP tools call the service layer', reachesServices && !reachesData,
  reachesData ? 'the MCP server writes its own queries; that is a second way into your data with none of your rules on it'
              : 'no call into services/ found: a tool must reuse the same function the API route calls');
check('the MCP server knows who is calling', /token|session|user|auth/i.test(mcpText),
  'a tool call is made on behalf of somebody, and may do exactly what that person may do');

const toolNames = [...new Set([...mcpText.matchAll(/["'`]([a-z][a-z0-9_]{2,30})["'`]\s*[,:]?\s*(?:\{|\n)?/g)].map((m) => m[1]))];
const declared = (section(spec, 'MCP tools') ?? '').split('\n')
  .filter((l) => l.trim().startsWith('|'))
  .map((l) => (l.split('|')[1] ?? '').trim().replace(/`/g, ''))
  .filter((n) => /^[a-z][a-z0-9_]{2,30}$/.test(n));
check('at least three project tools are implemented', declared.filter((n) => mcpText.includes(n)).length >= 3,
  `${declared.filter((n) => mcpText.includes(n)).length} of the tools in SPEC.md appear in the MCP source; find_lecture and your Exercise 1 tool do not count towards the three`);

// ---- the rest, unchanged -----------------------------------------------------
const hasNote = answered(section(spec ?? '', 'Architecture')).length >= 3 || findFile('docs', (name) => /feature/i.test(name));
check('the architecture note exists', Boolean(hasNote), 'trace one request through the layers, in SPEC.md or docs/');

const log = git(['log', '--oneline']);
const commits = log ? log.split('\n').length : 0;
check('you committed in small steps', commits >= 5, `${commits} commit(s) in this repository, aim for one per working step`);

const agents = read('AGENTS.md');
check('the always-ask list is written', filled(section(agents ?? '', 'Always ask before')).length >= 3, 'the agent must know what to never do unasked');

const plan = read('AGENT_LOG.md');
check('the plan and what you changed are logged', (plan ?? '').length > 400, 'paste the reviewed plan and what you corrected in it');

report('Exercise 3 · a full feature');
