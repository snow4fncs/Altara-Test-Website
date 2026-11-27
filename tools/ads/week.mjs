// Actual ad spend against the working budget, the way Meta paces it: a daily budget is a weekly average
// (Sunday to Saturday, account time zone Australia/Sydney), so single days swing and the week is what to hold.
// Prints each day this week and last, the week's total against 7 x CAP, yesterday by ad set against its
// budget, and today's running total by hour. Read-only. usage (repo root): node tools/ads/week.mjs
import fs from 'fs';
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i < 1) continue;
  let v = line.slice(i + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[line.slice(0, i)] = v;
}
const CAP = Number((fs.readFileSync('ad-src/batch3/apply.mjs', 'utf8').match(/CAP\s*=\s*(\d+)/) || [])[1] || 120);
const T = env.FB_USER_TOKEN_LL, G = 'https://graph.facebook.com/v21.0/', A = 'act_2548980925519496';
const get = async (path, p = {}) => {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(G + path + '?' + new URLSearchParams({ ...p, access_token: T }), { signal: AbortSignal.timeout(45000) });
      return await r.json();
    } catch (e) { await new Promise(r => setTimeout(r, 4000 * (t + 1))); }
  }
  return {};
};
const sydney = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const today = sydney(Date.now());
const shift = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = new Date(today + 'T00:00:00Z').getUTCDay();
const weekStart = shift(today, -dow), lastStart = shift(weekStart, -7);
const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const d = await get(A + '/insights', { fields: 'spend', time_range: JSON.stringify({ since: lastStart, until: today }), time_increment: 1, limit: 50 });
const spend = Object.fromEntries((d.data || []).map(x => [x.date_start, Number(x.spend)]));
const week = start => {
  let total = 0, full = 0;
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const k = shift(start, i);
    if (k > today) break;
    const v = spend[k] || 0;
    total += v;
    if (k < today) full++;
    cells.push(names[i] + ' ' + k.slice(8) + ' $' + Math.round(v) + (k === today ? ' (so far)' : ''));
  }
  return { cells, total, full };
};
const last = week(lastStart), now = week(weekStart);
console.log('WORKING BUDGET $' + CAP + ' a day = $' + CAP * 7 + ' a week (Sunday to Saturday)');
console.log('last week :', last.cells.join(' | '), '| total $' + Math.round(last.total), '| average $' + Math.round(last.total / 7));
console.log('this week :', now.cells.join(' | '), '| total $' + Math.round(now.total));
const done = now.total - (spend[today] || 0);
if (now.full) console.log('  full days so far: ' + now.full + ', average $' + Math.round(done / now.full) + ' a day; left in the week under $' + CAP * 7 + ': $' + Math.round(CAP * 7 - now.total));
console.log(now.total > CAP * 7 ? '  OVER the weekly level: trim the test ad sets' : '  inside the weekly level');

const sets = await get(A + '/adsets', { fields: 'name,daily_budget,effective_status', limit: 200 });
const budget = Object.fromEntries((sets.data || []).map(s => [s.id, s]));
const yesterday = shift(today, -1);
for (const [label, day] of [['YESTERDAY ' + yesterday, yesterday], ['TODAY so far ' + today, today]]) {
  const s = await get(A + '/insights', { fields: 'adset_id,adset_name,spend', level: 'adset', time_range: JSON.stringify({ since: day, until: day }), limit: 50 });
  console.log('\n' + label + ' by ad set (spend against its daily budget)');
  for (const x of (s.data || []).sort((a, b) => Number(b.spend) - Number(a.spend))) {
    const b = budget[x.adset_id], set = b && b.daily_budget ? Number(b.daily_budget) / 100 : 0;
    console.log('  $' + Number(x.spend).toFixed(2).padStart(6), 'of', set ? '$' + set : 'no own budget', '|', (b ? b.effective_status : '?').padEnd(8), '|', x.adset_name);
  }
}
for (const day of [yesterday, today]) {
  const h = await get(A + '/insights', { fields: 'spend', time_range: JSON.stringify({ since: day, until: day }), breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', limit: 50 });
  const rows = (h.data || []).sort((a, b) => a.hourly_stats_aggregated_by_advertiser_time_zone.localeCompare(b.hourly_stats_aggregated_by_advertiser_time_zone));
  let c = 0;
  console.log('\n' + day + ' running total by hour: ' + rows.map(x => { c += Number(x.spend); return x.hourly_stats_aggregated_by_advertiser_time_zone.slice(0, 2) + 'h $' + Math.round(c); }).join(' | '));
}
