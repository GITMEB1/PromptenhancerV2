import test from 'node:test';
import assert from 'node:assert/strict';

import { debounce } from '../src/utils.js';

test('debounce delays invocation until after delay', async () => {
  let callCount = 0;
  const fn = debounce(() => { callCount += 1; }, 30);

  fn();
  fn();
  fn();

  assert.equal(callCount, 0, 'Should not have called yet');

  await sleep(50);
  assert.equal(callCount, 1, 'Should have called exactly once after delay');
});

test('debounce passes arguments to the debounced function', async () => {
  let captured = null;
  const fn = debounce((a, b) => { captured = { a, b }; }, 20);

  fn('hello', 42);
  await sleep(40);

  assert.deepEqual(captured, { a: 'hello', b: 42 });
});

test('debounce.cancel prevents pending invocation', async () => {
  let callCount = 0;
  const fn = debounce(() => { callCount += 1; }, 20);

  fn();
  fn.cancel();

  await sleep(40);
  assert.equal(callCount, 0, 'Cancelled debounce should never fire');
});

test('debounce resets timer on each call', async () => {
  let callCount = 0;
  const fn = debounce(() => { callCount += 1; }, 40);

  fn();
  await sleep(20);
  fn(); // reset the timer
  await sleep(20);
  assert.equal(callCount, 0, 'Should not have fired yet — timer was reset');

  await sleep(30);
  assert.equal(callCount, 1, 'Should fire after the full delay from last call');
});

test('debounce can be called again after firing', async () => {
  let callCount = 0;
  const fn = debounce(() => { callCount += 1; }, 15);

  fn();
  await sleep(30);
  assert.equal(callCount, 1);

  fn();
  await sleep(30);
  assert.equal(callCount, 2);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
