url-id
======

A utility for encoding and parsing tiny, url-safe objects of identifiers

Usage
-----

Create an `Encoder` instance, define encoding/decoding rules on it, and begin encoding objects.

```js
const Encoder = require('url-id');

// The default context to encode/decode in.
const encoder = new Encoder('main');

encoder.define('main', {
  token: 'g',
  match: (obj) => obj && obj.type === 'gmailMessageId',
  encode(obj) {
    this.assert(typeof obj.userId === 'string');
    return this.encode('id', obj.userId) + this.encode('id', obj.gmailMessageId);
  },
  decode() {
    const data = {
      type: 'gmailMessageId'
    };

    [data.userId, data.gmailMessageId] = this.decode('id', 2);
    return data;
  }
});

encoder.define('id', {
  token: 'z',
  encode(input) {
    return this.string(input, 'utf8');
  },
  decode() {
    return this.string('utf8');
  }
});

const exampleData = {
  type: 'gmailMessageId',
  userId: '76456789976',
  gmailMessageId: 'some id here (full unicode)'
};

encoder.encode(exampleData);
// => gzALNzY0NTY3ODk5NzYzAbc29tZSBpZCBoZXJlIChmdWxsIHVuaWNvZGUp
//    (length: 58)

encoder.decode('gzALNzY0NTY3ODk5NzYzAbc29tZSBpZCBoZXJlIChmdWxsIHVuaWNvZGUp');
// => { type: 'gmailMessageId',
//      userId: '76456789976',
//      gmailMessageId: 'some id here (full unicode)' }

// compare to just base64-encoding JSON.stringify:
Buffer.from(JSON.stringify(exampleData)).toString('base64');
// eyJ0eXBlIjoiZ21haWxNZXNzYWdlSWQiLCJ1c2VySWQiOiI3NjQ1Njc4OTk3NiIsImdtYWlsTWVzc2FnZUlkIjoic29tZSBpZCBoZXJlIChmdWxsIHVuaWNvZGUpIn0=
// (length: 128)
```
