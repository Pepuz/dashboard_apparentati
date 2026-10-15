// Run with: node tv-app/app.test.js
var assert = require('assert');
var app = require('./app.js');

function has(html, text) {
  return html.indexOf(text) !== -1;
}

// The state icon's label, which is what a presence or a shift shows on screen.
function state(html) {
  return /aria-label="([^"]+)"/.exec(html)[1];
}

// 2026-09-14 is a Monday: Tuesday and the following Sunday belong to the week starting that day.
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 14))), '2026-09-14');
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 15))), '2026-09-14');
assert.strictEqual(app.isoDate(app.weekStart(new Date(2026, 8, 20))), '2026-09-14');
// 2026-10-25 is the Sunday daylight saving time ends in Italy.
assert.strictEqual(app.isoDate(app.addDays(app.weekStart(new Date(2026, 9, 25)), 7)), '2026-10-26');

assert.strictEqual(app.longDate(new Date(2026, 9, 10)), 'Sabato 10 ottobre 2026');
assert.strictEqual(app.longDate(new Date(2026, 9, 1)), 'Giovedì 1 ottobre 2026');

assert.strictEqual(app.escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');

var full = app.personHtml('Nome 1',
  { is_present: true, required_time: '19:30:00', guest_names: ['Ospite 1', 'Ospite 2'], note: 'porto <il> dolce' });
assert.strictEqual(state(full), 'presente');
assert.ok(has(full, '<span class="time">ore 19:30</span>'));
assert.ok(has(full, 'Ospiti: Ospite 1, Ospite 2'));
assert.ok(has(full, 'Note: porto &lt;il&gt; dolce'));
// Rows without content are left out: an absent roommate can still leave a note.
var absent = app.personHtml('Nome 2', { is_present: false, required_time: null, guest_names: [], note: 'rientro tardi' });
assert.strictEqual(state(absent), 'assente');
assert.ok(has(absent, 'Note: rientro tardi'));
assert.ok(!has(absent, 'ore ') && !has(absent, 'Ospiti'));
var unknown = app.personHtml('<Nome 3>', undefined);
assert.strictEqual(state(unknown), 'non specificato');
assert.ok(has(unknown, '&lt;Nome 3&gt;'));
assert.ok(!has(unknown, 'class="detail"'));
// The row's class lets style.css mute the roommates who have not answered.
assert.ok(has(unknown, '<li class="unknown">') && has(absent, '<li class="absent">') && has(full, '<li class="present">'));
// The state icon comes before the name, so the states line up in a column.
assert.ok(full.indexOf('aria-label="presente"') < full.indexOf('Nome 1'));

var withGuests = { is_present: true, required_time: null, guest_names: ['Ospite 1', 'Ospite 2'], note: null };
var alone = { is_present: true, required_time: null, guest_names: [], note: null };
var away = { is_present: false, required_time: null, guest_names: [], note: 'rientro tardi' };
assert.strictEqual(app.headcount([undefined, away]), 'nessun presente');
assert.strictEqual(app.headcount([alone, undefined]), '1 presente');
assert.strictEqual(app.headcount([withGuests, alone, away]), '2 presenti + 2 ospiti');
assert.strictEqual(app.headcount([{ is_present: true, required_time: null, guest_names: ['Ospite 1'], note: null }]), '1 presente + 1 ospite');

var habitual = {
  name: 'Nome 4',
  meal_presence: [],
  meal_defaults: [{ meal: 'lunch', is_present: false }, { meal: 'dinner', is_present: null }]
};
assert.strictEqual(state(app.personHtml('Nome 4', app.presenceFor(habitual, 'lunch'))), 'assente');
assert.strictEqual(state(app.personHtml('Nome 4', app.presenceFor(habitual, 'dinner'))), 'non specificato');
var answered = {
  name: 'Nome 5',
  meal_presence: [{ meal: 'lunch', is_present: true, required_time: null, guest_names: [], note: null }],
  meal_defaults: habitual.meal_defaults
};
assert.strictEqual(state(app.personHtml('Nome 5', app.presenceFor(answered, 'lunch'))), 'presente');
var excepted = {
  meal_presence: [{ meal: 'lunch', is_present: false, required_time: null, guest_names: [], note: null }],
  meal_defaults: [{ meal: 'lunch', is_present: true }]
};
assert.strictEqual(state(app.personHtml('Nome 6', app.presenceFor(excepted, 'lunch'))), 'assente');

var lunch = app.mealCard(['lunch', 'Pranzo'], [answered, habitual]);
assert.ok(has(lunch, '<h2>Pranzo '));
assert.ok(has(lunch, '<span class="count">1 presente</span>'));
assert.strictEqual(lunch.split('<li ').length - 1, 2);
assert.ok(lunch.indexOf('Nome 5') < lunch.indexOf('Nome 4'));

assert.strictEqual(state(app.shiftHtml('Sala', { status: 'done', roommates: { name: 'Nome 1' } })), 'fatto');
assert.strictEqual(state(app.shiftHtml('Sala', { status: 'pending', roommates: { name: 'Nome 1' } })), 'da fare');
assert.ok(has(app.shiftHtml('<Sala>', null), '&lt;Sala&gt;</span> <span class="who none">non assegnata</span>'));

var assigned = [{ name: 'Sala', cleaning_shifts: [{ week_start: '2026-09-21', status: 'pending', roommates: { name: 'Nome 1' } }] }];
var unassigned = [{ name: 'Sala', cleaning_shifts: [] }];
var week = app.weekCard(assigned, '2026-09-21');
assert.ok(has(week, 'settimana 21/09'));
assert.strictEqual(state(week.slice(week.indexOf('<li>'))), 'da fare');
assert.ok(has(app.weekCard(assigned, '2026-09-14'), 'non assegnata'));

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
