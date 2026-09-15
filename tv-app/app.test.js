// Run with: node tv-app/app.test.js
var assert = require('assert');
var app = require('./app.js');

// 2026-09-14 is a Monday: Tuesday and the following Sunday belong to the week starting that day.
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 14))), '2026-09-14');
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 15))), '2026-09-14');
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 20))), '2026-09-14');
// 2026-10-25 is the Sunday daylight saving time ends in Italy.
assert.strictEqual(app.isoDate(app.addDays(app.weekStart(new Date(2026, 9, 25)), 7)), '2026-10-26');

assert.strictEqual(app.escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');

assert.strictEqual(app.describeMeal(undefined), 'non specificato');
assert.strictEqual(
  app.describeMeal({ is_present: false, required_time: null, guest_names: [], note: 'rientro tardi' }),
  'assente · nota: rientro tardi');
assert.strictEqual(
  app.describeMeal({ is_present: true, required_time: '19:30:00', guest_names: ['Ospite 1', 'Ospite 2'], note: null }),
  'presente · ore 19:30 · ospiti (2): Ospite 1, Ospite 2');

assert.strictEqual(app.describeShift(null), 'non assegnata');
assert.strictEqual(app.describeShift({ status: 'done', roommates: { name: 'Nome 1' } }), 'Nome 1 (fatto)');
assert.strictEqual(app.describeShift({ status: 'pending', roommates: { name: 'Nome 1' } }), 'Nome 1 (da fare)');

var assigned = [{ name: 'Sala', cleaning_shifts: [{ week_start: '2026-09-21', status: 'pending', roommates: { name: 'Nome 1' } }] }];
var unassigned = [{ name: 'Sala', cleaning_shifts: [] }];
var saturday = new Date(2026, 8, 19);
var tuesday = new Date(2026, 8, 15);
function data(today, tasks) {
  return { today: today, nextWeek: '2026-09-21', tasks: tasks };
}
assert.strictEqual(app.nextWeekVisible(data(saturday, assigned), null), true);
assert.strictEqual(app.nextWeekVisible(data(saturday, unassigned), null), false);
assert.strictEqual(app.nextWeekVisible(data(tuesday, assigned), null), false);
assert.strictEqual(app.nextWeekVisible(data(tuesday, unassigned), true), true);
assert.strictEqual(app.nextWeekVisible(data(saturday, assigned), false), false);

console.log('app.test.js: ok');
