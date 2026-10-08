// Run with: node mobile-app/app.test.js
const assert = require('assert');
const app = require('./app.js');

// 2026-09-14 is a Monday: Tuesday and the following Sunday belong to the week starting that day.
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 14))), '2026-09-14');
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 15))), '2026-09-14');
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 20))), '2026-09-14');
// 2026-10-25 is the Sunday daylight saving time ends in Italy.
assert.strictEqual(app.isoDate(app.addDays(app.weekStart(new Date(2026, 9, 25)), 7)), '2026-10-26');
assert.strictEqual(app.isoDate(app.addDays(new Date(2026, 9, 24), 1)), '2026-10-25');
assert.strictEqual(app.isoDate(app.addDays(new Date(2026, 11, 28), 6)), '2027-01-03');

assert.strictEqual(app.dayTitle(0, new Date(2026, 8, 30)), 'Oggi, mercoledì 30/09');
assert.strictEqual(app.dayTitle(1, new Date(2026, 9, 1)), 'Domani, giovedì 01/10');
assert.strictEqual(app.dayTitle(2, new Date(2026, 9, 2)), 'venerdì 02/10');

assert.deepStrictEqual(
  app.parseLink('#url=https%3A%2F%2Fexample.supabase.co%2F&key=sb_publishable_abc'),
  { url: 'https://example.supabase.co', key: 'sb_publishable_abc' });
assert.strictEqual(app.parseLink(''), null);
assert.strictEqual(app.parseLink('#url=https%3A%2F%2Fexample.supabase.co&key=sb_secret_abc'), null);
assert.strictEqual(app.parseLink('#url=http%3A%2F%2Fexample.supabase.co&key=sb_publishable_abc'), null);
assert.strictEqual(app.parseLink('#url=https%3A%2F%2Fexample.org&key=sb_publishable_abc'), null);
assert.strictEqual(app.parseLink('#url=https%3A%2F%2Fexample.supabase.co.example.org&key=sb_publishable_abc'), null);

assert.strictEqual(app.escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');

assert.deepStrictEqual(app.cleanGuests(['  Ospite 1 ', '', '   ', 'Ospite 2']), ['Ospite 1', 'Ospite 2']);

const now = new Date(Date.UTC(2026, 9, 6, 10, 0, 0));
assert.deepStrictEqual(
  app.presenceRow('r1', '2026-10-06', 'dinner',
    { present: true, time: '19:30', guests: [' Ospite 1 ', ''], note: '  porto il dolce ' }, now),
  { roommate_id: 'r1', date: '2026-10-06', meal: 'dinner', is_present: true, required_time: '19:30',
    guest_names: ['Ospite 1'], note: 'porto il dolce', updated_at: '2026-10-06T10:00:00.000Z' });
// absent_has_no_guests_or_time: an absent row drops time and guests left in the form, but keeps the note.
assert.deepStrictEqual(
  app.presenceRow('r1', '2026-10-06', 'lunch',
    { present: false, time: '13:00', guests: ['Ospite 1'], note: 'rientro tardi' }, now),
  { roommate_id: 'r1', date: '2026-10-06', meal: 'lunch', is_present: false, required_time: null,
    guest_names: [], note: 'rientro tardi', updated_at: '2026-10-06T10:00:00.000Z' });
const bare = app.presenceRow('r1', '2026-10-06', 'lunch', { present: true, time: '', guests: [], note: '' }, now);
assert.strictEqual(bare.required_time, null);
assert.strictEqual(bare.note, null);
assert.deepStrictEqual(bare.guest_names, []);

assert.deepStrictEqual(app.shiftRow('t1', '2026-10-05', 'r2', 'pending', now),
  { task_id: 't1', week_start: '2026-10-05', roommate_id: 'r2', status: 'pending', updated_at: '2026-10-06T10:00:00.000Z' });

const present = { is_present: true, required_time: '13:00:00', guest_names: ['Ospite 1', 'Ospite 2'], note: null };
const alone = { is_present: true, required_time: null, guest_names: [], note: null };
const absent = { is_present: false, required_time: null, guest_names: [], note: 'rientro tardi' };
assert.strictEqual(app.headcount([null, absent]), 'nessun presente');
assert.strictEqual(app.headcount([alone, null]), '1 presente');
assert.strictEqual(app.headcount([present, alone, absent]), '2 presenti + 2 ospiti');

function roommate(name, presence) {
  return {
    name: name,
    meal_presence: presence ? [Object.assign({ date: '2026-10-06', meal: 'lunch' }, presence)] : [],
    meal_defaults: []
  };
}
assert.deepStrictEqual(
  app.othersLines([roommate('Nome 1', present), roommate('Nome 2', absent), roommate('Nome 3', null)], '2026-10-06', 'lunch'),
  ['Ci sono: Nome 1 (ore 13:00 · ospiti: Ospite 1, Ospite 2)', 'Non ci sono: Nome 2 (nota: rientro tardi)', 'Senza risposta: Nome 3']);
assert.deepStrictEqual(app.othersLines([roommate('Nome 1', present)], '2026-10-06', 'dinner'), ['Senza risposta: Nome 1']);

// Habits: 2026-10-06 is a Tuesday (ISO weekday 2) and 2026-10-11 a Sunday (7).
const habitual = {
  name: 'Nome 4',
  meal_presence: [],
  meal_defaults: [{ weekday: 2, meal: 'lunch', is_present: false }, { weekday: 2, meal: 'dinner', is_present: null },
    { weekday: 7, meal: 'dinner', is_present: true }]
};
assert.deepStrictEqual(app.presenceOf(habitual, '2026-10-06', 'lunch'),
  { is_present: false, required_time: null, guest_names: [], note: null });
assert.strictEqual(app.presenceOf(habitual, '2026-10-06', 'dinner'), null);
assert.strictEqual(app.presenceOf(habitual, '2026-10-07', 'lunch'), null);
assert.strictEqual(app.presenceOf(habitual, '2026-10-11', 'dinner').is_present, true);
const answered = Object.assign({}, habitual, { meal_presence: [{ date: '2026-10-06', meal: 'lunch', is_present: true,
  required_time: '13:00:00', guest_names: [], note: 'eccezione' }] });
assert.strictEqual(app.presenceOf(answered, '2026-10-06', 'lunch').note, 'eccezione');
// The answer belongs to its date only: the next Tuesday falls back to the habit.
assert.strictEqual(app.presenceOf(answered, '2026-10-13', 'lunch').is_present, false);
const excepted = {
  name: 'Nome 5',
  meal_defaults: [{ weekday: 2, meal: 'lunch', is_present: true }],
  meal_presence: [{ date: '2026-10-06', meal: 'lunch', is_present: false, required_time: null, guest_names: [], note: null }]
};
assert.strictEqual(app.presenceOf(excepted, '2026-10-06', 'lunch').is_present, false);
assert.deepStrictEqual(app.othersLines([excepted], '2026-10-06', 'lunch'), ['Non ci sono: Nome 5']);
assert.deepStrictEqual(app.othersLines([habitual], '2026-10-06', 'lunch'), ['Non ci sono: Nome 4']);
assert.strictEqual(app.headcount([app.presenceOf(habitual, '2026-10-11', 'dinner')]), '1 presente');

const habitRows = app.habitRows('r1', (weekday, meal) =>
  meal === 'lunch' && weekday <= 5 ? 'no' : weekday === 7 && meal === 'dinner' ? 'yes' : '', now);
assert.strictEqual(habitRows.length, 14);
assert.deepStrictEqual(habitRows[0],
  { roommate_id: 'r1', weekday: 1, meal: 'lunch', is_present: false, updated_at: '2026-10-06T10:00:00.000Z' });
assert.strictEqual(habitRows[1].is_present, null);
assert.deepStrictEqual([habitRows[13].weekday, habitRows[13].meal, habitRows[13].is_present], [7, 'dinner', true]);
// PostgREST rejects a bulk upsert whose objects do not share the same keys.
assert.ok(habitRows.every((r) => Object.keys(r).join() === Object.keys(habitRows[0]).join()));
assert.deepStrictEqual(app.habitLines({ meal_defaults: habitRows }),
  ['Pranzo: di solito non ci sono lun, mar, mer, gio, ven', 'Cena: di solito ci sono dom']);
assert.deepStrictEqual(app.habitLines({ meal_defaults: [] }), []);

console.log('app.test.js: ok');
