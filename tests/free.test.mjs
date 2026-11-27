// Үнэгүй үзэх дүрмийн тест (server/free.js).
import assert from 'node:assert/strict'
import { freeLimit } from '../server/free.js'

const v = { orientation: 'vertical' }
const h = { orientation: 'horizontal' }
const eps = [1, 2, 3, 4, 5].map((number) => ({ number, duration: '4:00' }))

assert.equal(freeLimit(h), 600)
assert.equal(freeLimit(v), 600)
assert.equal(freeLimit(v, [{ number: 1, duration: '1:30:00' }], 1), 600)
assert.equal(freeLimit(h, eps, 2), Infinity)
assert.equal(freeLimit(h, eps, 3), 0)
// Shorts: 4+4 = 8 мин бүтэн, 3-р ангийн эхний 2 мин, цааш түгжээтэй.
assert.equal(freeLimit(v, eps, 1), Infinity)
assert.equal(freeLimit(v, eps, 2), Infinity)
assert.equal(freeLimit(v, eps, 3), 120)
assert.equal(freeLimit(v, eps, 4), 0)
assert.equal(freeLimit(v, eps, 9), 0)
// Урт нь тодорхойгүй анги бүтэн үнэгүй биш.
assert.equal(freeLimit(v, [{ number: 1, duration: '' }, { number: 2, duration: '' }], 1), 600)
console.log('free: ok')
