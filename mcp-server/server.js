// Hand-rolled MCP server over stdio (JSON-RPC 2.0, one JSON object per line).
// stdout = protocol only. All logging goes to stderr.
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

const LECTURES_FILE = path.join(__dirname, 'lectures.json');
const loadLectures = () => JSON.parse(fs.readFileSync(LECTURES_FILE, 'utf8'));

const TOOLS = [
  {
    name: 'find_lecture',
    description:
      'Look up one course lecture by its number and return its title and topics. Use this when the user asks what a specific lecture (e.g. "lecture 7") covers.',
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'integer', minimum: 1, maximum: 10, description: 'Lecture number, 1 to 10' },
      },
      required: ['number'],
    },
  },
  {
    name: 'search_lectures',
    description:
      'Search all course lectures for a keyword in the title or topics and list every match. Use this when the user asks which lecture covers a subject (e.g. "MCP" or "testing").',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Word or phrase to search for (case-insensitive)' },
      },
      required: ['query'],
    },
  },
];

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });

function findLecture({ number } = {}) {
  const lecture = loadLectures().find((l) => l.number === Number(number));
  if (!lecture) return text(`Lecture ${number} does not exist. Choose a number from 1 to 10.`, true);
  return text(`Lecture ${lecture.number}: ${lecture.title}\nTopics: ${lecture.topics}`);
}

function searchLectures({ query } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return text('Please give a non-empty search query.', true);
  const hits = loadLectures().filter((l) => `${l.title} ${l.topics}`.toLowerCase().includes(q));
  if (hits.length === 0) return text(`No lecture mentions "${query}".`);
  return text(hits.map((l) => `Lecture ${l.number}: ${l.title} (${l.topics})`).join('\n'));
}

const HANDLERS = { find_lecture: findLecture, search_lectures: searchLectures };

function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: params?.protocolVersion ?? '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'lecture-server', version: '1.0.0' },
    });
  }
  if (isNotification) return; // notifications/initialized etc. get no reply
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const handler = HANDLERS[params?.name];
    if (!handler) return fail(id, -32602, `Unknown tool: ${params?.name}`);
    try {
      return reply(id, handler(params.arguments ?? {}));
    } catch (err) {
      return reply(id, text(`Tool failed: ${err.message}`, true));
    }
  }
  return fail(id, -32601, `Method not found: ${method}`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  console.error('<-', line);
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  handle(msg);
});