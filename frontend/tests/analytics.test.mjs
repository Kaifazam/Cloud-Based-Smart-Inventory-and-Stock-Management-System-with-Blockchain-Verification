import {test} from 'node:test';
import assert from 'node:assert/strict';
import {money,localDateKey,salesChart} from '../src/analytics.js';

test('currency preserves paise instead of rounding to whole rupees',()=>{
  assert.equal(money(1250),'₹12.50');
  assert.equal(money(2500),'₹25');
});

test('sales chart groups UTC timestamps by the same local day as its labels',()=>{
  const now=new Date(2026,10,16,0,30);
  const previous=new Date(2026,10,15,23,55);
  const current=new Date(2026,10,16,0,5);
  const old=new Date(2026,10,9,12);
  const chart=salesChart([
    {created_at:previous.toISOString(),total:1250},
    {created_at:current.toISOString(),total:2500},
    {created_at:old.toISOString(),total:99900},
  ],now);
  assert.equal(localDateKey(now),'2026-11-16');
  assert.equal(chart.length,7);
  assert.equal(chart[5].sales,12.5);
  assert.equal(chart[6].sales,25);
  assert.equal(chart.reduce((sum,day)=>sum+day.sales,0),37.5);
});
