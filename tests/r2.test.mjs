// AWS-ийн жишээ (S3 → Query string authentication) дээр шалгана: node tests/r2.test.mjs
import assert from 'node:assert/strict'
import { presign } from '../server/r2.js'

const url = await presign({
  host: 'examplebucket.s3.amazonaws.com',
  path: '/test.txt',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  expires: 86400,
  now: new Date('2013-05-24T00:00:00Z'),
})
assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/)
assert.match(url, /X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request/)
console.log('ok   presign matches the AWS SigV4 example')
