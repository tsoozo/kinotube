// AWS-ийн жишээ (S3 → Query string authentication) болон botocore-ийн гаргасан утгууд дээр шалгана: npm test
import assert from 'node:assert/strict'
import { presign, signHeaders } from '../server/r2.js'

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

// botocore 1.43 (S3SigV4QueryAuth / S3SigV4Auth)-ийн гаргасан утга.
const keys = { host: 'acct123.r2.cloudflarestorage.com', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }
const path = '/kinotube/movies/the-general.mp4'

const put = await presign({
  ...keys, path, method: 'PUT', expires: 86400, query: { partNumber: '3', uploadId: 'abc/def==' }, now: new Date('2026-10-26T16:48:38Z'),
})
// Параметрийн дараалал өөр байж болно, гарын үсэг ба утгууд таарах ёстой.
const params = (u) => Object.fromEntries(new URL(u).searchParams)
const ref = 'https://acct123.r2.cloudflarestorage.com/kinotube/movies/the-general.mp4?partNumber=3&uploadId=abc%2Fdef%3D%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIDEXAMPLE%2F20261026%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261026T164838Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=9f117ec2511307bfbf587ca68a86ced63b8b2f0b30b723bd9f66333b5360eb18'
assert.deepEqual(params(put), params(ref))
assert.equal(put.split('?')[0], ref.split('?')[0])
console.log('ok   presigned UploadPart (PUT) matches botocore')

const create = await signHeaders({
  ...keys, method: 'POST', path, query: { uploads: '' }, headers: { 'content-type': 'video/mp4' }, now: new Date('2026-10-26T16:48:38Z'),
})
assert.equal(create.authorization.split('Signature=')[1], 'ae969bc893cecae38cbb701e1f0d2d03578254afa8b551624f1d4456d7e57e11')
assert.match(create.authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,/)
console.log('ok   CreateMultipartUpload header signature matches botocore')

const body = '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"etag1"</ETag></Part></CompleteMultipartUpload>'
const complete = await signHeaders({
  ...keys, method: 'POST', path, query: { uploadId: 'abc/def==' }, headers: { 'content-type': 'application/xml' }, body,
  now: new Date('2026-10-26T16:48:38Z'),
})
assert.equal(complete.authorization.split('Signature=')[1], '50eb88910c16f1bdc07c0f4bd652cf2e91ee25d3fdfd9c72f6c5ee969e33481b')
console.log('ok   CompleteMultipartUpload header signature matches botocore')
