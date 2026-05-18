#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'package.json',
  'main.js',
  'preload.js',
  'app/index.html',
  'app/signin.html',
  'app/player.html',
  'app/trainer.html',
  'app/editor.html',
  'app/styles.css',
  'app/settings.js',
  'app/supabase-client.js',
  'app/cache.js',
  'app/sync-queue.js',
  'app/quiz-adapter.js',
];

for (const rel of requiredFiles) {
  assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'sandvik-training-desktop');
assert.equal(pkg.main, 'main.js');
assert.ok(pkg.scripts.start.includes('electron'));
assert.ok(pkg.scripts.build.includes('electron-builder'));
assert.ok(pkg.dependencies['@supabase/supabase-js']);
assert.ok(pkg.devDependencies.electron);

const index = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
assert.match(index, /Sandvik Training/);
assert.match(index, /Player/);
assert.match(index, /Trainer/);
assert.match(index, /Editor/);

const supabaseClient = fs.readFileSync(path.join(root, 'app/supabase-client.js'), 'utf8');
assert.match(supabaseClient, /signInWithOtp/);
assert.match(supabaseClient, /getQuizBank/);
assert.match(supabaseClient, /cacheThenSync/);

const quizBankPath = path.join(root, 'app/quiz-data/quiz_bank.json');
assert.ok(fs.existsSync(quizBankPath), 'standalone app must ship an offline quiz bank');
const quizBank = JSON.parse(fs.readFileSync(quizBankPath, 'utf8'));
assert.equal(quizBank.stats.totalQuestions, 3616, 'offline quiz bank must include all 3,616 questions');
assert.equal(quizBank.stats.totalQuizSets, 34, 'offline quiz bank must include all 34 quiz sets');
assert.match(supabaseClient, /loadBundledQuizBank/, 'client must fall back to bundled quiz bank before showing empty data');
assert.match(supabaseClient, /hasQuizContent/, 'client must not cache/show empty remote rows as valid quiz content');
const playerHtml = fs.readFileSync(path.join(root, 'app/player.html'), 'utf8');
assert.doesNotMatch(playerHtml, /\$\{first\.question\}/, 'question text must not be injected through innerHTML templates');
assert.doesNotMatch(playerHtml, /\$\{first\.answer/, 'answer text must not be injected through innerHTML templates');
assert.match(playerHtml, /textContent=first\.question/, 'question text should render via textContent');

const cache = require(path.join(root, 'app/cache.js'));
const syncQueue = require(path.join(root, 'app/sync-queue.js'));
const adapter = require(path.join(root, 'app/quiz-adapter.js'));

assert.equal(typeof cache.createMemoryCache, 'function');
assert.equal(typeof syncQueue.createSyncQueue, 'function');
assert.equal(typeof adapter.rowsToQuizBank, 'function');

const memory = cache.createMemoryCache();
memory.saveQuizBank({ sections: [{ id: 's1', name: 'Section', quizSets: [] }] });
assert.equal(memory.getQuizBank().sections[0].id, 's1');

const queue = syncQueue.createSyncQueue({ cache: memory, postAttempt: async () => ({ ok: false }) });
(async () => {
  await queue.recordAttempt({ question_id: 'q1', was_correct: true, app_source: 'training_app' });
  assert.equal(memory.getPendingAttempts().length, 1, 'offline attempt should queue');

  const quizBank = adapter.rowsToQuizBank({
    sections: [{ id: 's', name: 'S', icon: 'drill', description: 'D', sort_order: 0 }],
    quiz_sets: [{ id: 'qs', section_id: 's', name: 'QS', sort_order: 0 }],
    questions: [{ id: 'q', quiz_set_id: 'qs', question_text: 'Q?', difficulty: 'easy', source_manual: 'manual' }],
    answers: [{ question_id: 'q', answer_text: 'A', has_answer: true }],
  });
  assert.equal(quizBank.sections.length, 1);
  assert.equal(quizBank.sections[0].quizSets[0].questions[0].answer, 'A');
  assert.equal(quizBank.stats.totalQuestions, 1);

  console.log('test_smoke: PASS');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
