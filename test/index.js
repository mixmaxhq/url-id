const expect = require('chai').expect;

const Encoder = require('..');

describe('Encoder', function() {
  it('should handle the example', function() {
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
          type: 'gmailMessageId',
        };

        [data.userId, data.gmailMessageId] = this.decode('id', 2);
        return data;
      },
    });

    encoder.define('id', {
      token: 'z',
      encode(input) {
        return this.string(input, 'utf8');
      },
      decode() {
        return this.string('utf8');
      },
    });

    const exampleData = {
      type: 'gmailMessageId',
      userId: '76456789976',
      gmailMessageId: 'some id here (full unicode)',
    };

    const encoded = encoder.encode(exampleData);

    expect(encoded)
      .to.be.a('string')
      .and.to.match(/^[a-z0-9-_]+$/i);

    const decoded = encoder.decode(encoded);

    expect(exampleData).to.deep.equal(decoded);
  });
});
