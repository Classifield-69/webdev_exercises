// Self-check for Exercise 1. It starts your server, sends the messages from
// messages.jsonl and reports what a real MCP client would think of the replies.
// It never writes your server: it only tells you which part is not answering correctly.
//
//   node mcp-server/check.mjs -- <your start command>
//   node mcp-server/check.mjs -- node mcp-server/server.js
//   node mcp-server/check.mjs -- python3 mcp-server/server.py
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const command = process.argv.slice(process.argv.indexOf('--') + 1);
if (process.argv.indexOf('--') === -1 || command.length === 0) {
  console.error('Usage: node mcp-server/check.mjs -- <your start command>');
  console.error('   e.g. node mcp-server/check.mjs -- node mcp-server/server.js');
  process.exit(2);
}

const lectures = JSON.parse(readFileSync(join(here, 'lectures.json'), 'utf8'));
const steps = readFileSync(join(here, 'messages.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('//'))
  .map((line) => JSON.parse(line));

const child = spawn(command[0], command.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
child.on('error', (error) => {
  console.error(`Could not start your server: ${error.message}`);
  process.exit(2);
});

/** anything your server wrote to stderr, and how it ended, so a crash is not reported as silence */
let errorOutput = '';
let exit;
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  errorOutput += chunk;
});
child.on('exit', (code, signal) => {
  if (exit === undefined) exit = signal ? `killed by ${signal}` : `exited with code ${code}`;
});

/** replies your server printed, in order */
const replies = [];
const junk = [];
let buffer = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      replies.push(JSON.parse(line));
    } catch {
      // anything that is not JSON on stdout breaks a real client
      junk.push(line);
    }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (id, ms = 2500) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const found = replies.find((r) => r.id === id);
    if (found) return found;
    await sleep(25);
  }
  return undefined;
};

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

for (const step of steps) {
  child.stdin.write(`${JSON.stringify(step.message)}\n`);

  if (step.expect === 'silence') {
    await sleep(400);
    const answered = replies.some((r) => r.id === step.message.id);
    check(step.name, !answered, answered ? 'your server replied to a notification, which has no id' : '');
    continue;
  }

  const reply = await waitFor(step.message.id);
  if (!reply) {
    check(step.name, false, 'no reply arrived within 2.5s');
    continue;
  }

  if (step.expect === 'initialize') {
    const r = reply.result;
    check(
      step.name,
      Boolean(r?.protocolVersion && r?.serverInfo?.name && r?.capabilities?.tools),
      r ? 'result needs protocolVersion, serverInfo.name and capabilities.tools' : `got an error: ${reply.error?.message ?? '?'}`,
    );
  } else if (step.expect === 'tools') {
    const tools = reply.result?.tools;
    const found = Array.isArray(tools) && tools.find((t) => t.name === 'find_lecture');
    const schema = found?.inputSchema;
    const described = typeof found?.description === 'string' && found.description.length >= 20;
    check(step.name, Boolean(found), Array.isArray(tools) ? 'no tool named find_lecture' : 'result.tools is not an array');
    check('find_lecture has an input schema', Boolean(schema?.properties?.number), 'inputSchema.properties.number is missing');
    check('find_lecture has a real description', described, 'write a description a model can choose by, at least 20 characters');
    check('a second tool of your own', Array.isArray(tools) && tools.length >= 2, `found ${tools?.length ?? 0} tool(s)`);
    // The description is the only thing the model reads when it decides which tool to call,
    // so the rule that applies to find_lecture applies to every tool you add later too.
    const thin = (Array.isArray(tools) ? tools : []).filter((t) => typeof t?.description !== 'string' || t.description.length < 20);
    check(
      'every tool has a real description',
      Array.isArray(tools) && thin.length === 0,
      thin.length ? `${thin.map((t) => t?.name ?? '(unnamed)').join(', ')}: a model picks a tool by reading this` : '',
    );
  } else if (step.expect === 'lecture') {
    const text = reply.result?.content?.[0]?.text ?? '';
    const wanted = lectures.find((l) => l.number === step.message.params.arguments.number);
    check(step.name, text.includes(wanted.title), text ? `expected the title of lecture ${wanted.number} in the text` : 'result.content[0].text is missing');
  } else if (step.expect === 'tool-error') {
    const flagged = reply.result?.isError === true;
    check(step.name, flagged, reply.error ? 'a tool that ran and failed returns a result with isError, not a JSON-RPC error' : 'result.isError should be true');
  } else if (step.expect === 'code') {
    check(step.name, reply.error?.code === step.code, reply.error ? `got code ${reply.error.code}, expected ${step.code}` : 'expected an error object, got a result');
  }
}

child.stdin.end();
child.kill();

check('nothing but protocol on stdout', junk.length === 0, junk.length ? `saw ${junk.length} non-JSON line(s), first: ${junk[0].slice(0, 60)}` : '');

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok || !r.detail ? '' : `\n       ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

// A server that never starts answers nothing, and "no reply arrived" on every line
// says nothing about why. Whatever it printed before dying is the actual answer.
if (failed.length && errorOutput.trim()) {
  const lines = errorOutput.trim().split('\n');
  console.log(`\nYour server printed this on stderr${exit ? ` before it ${exit}` : ''}:`);
  for (const line of lines.slice(0, 12)) console.log(`   ${line}`);
  if (lines.length > 12) console.log(`   ... ${lines.length - 12} more line(s)`);
  // Only a server that stopped has crashed. One that is still running is just logging, as it should.
  if (exit) console.log('Read that first: a server that crashes fails every check after the crash for one reason.');
}

if (failed.length) console.log('Fix the failures above yourself. The agent may explain a message, but not write the handler.');
process.exit(failed.length ? 1 : 0);
