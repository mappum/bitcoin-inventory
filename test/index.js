var EventEmitter = require('events')
var inherits = require('util').inherits
var INV = require('bitcoin-protocol').constants.inventory
var test = require('tape')
var Inventory = require('..')

test('create Inventory', function (t) {
  t.test('no peers', function (t) {
    try {
      var inv = new Inventory()
      t.notOk(inv, 'should have thrown')
    } catch (err) {
      t.ok(err, 'threw error')
      t.equal(err.message, 'Must provide "peers" argument', 'correct error message')
      t.end()
    }
  })
  t.test('normal constructor', function (t) {
    var inv = new Inventory(new MockPeer())
    t.ok(inv instanceof Inventory, 'got Inventory')
    inv.close()
    t.end()
  })
  t.test('constructor without "new"', function (t) {
    var inv = Inventory(new MockPeer())
    t.ok(inv instanceof Inventory, 'got Inventory')
    inv.close()
    t.end()
  })
  t.end()
})

test('handling messages', function (t) {
  var peer = new MockPeer()
  var inv = new Inventory(peer)

  t.test('inv', function (t) {
    var hash = Buffer('0123456789abcdefghijklmnopqrstuv')
    t.test('single item inv', function (t) {
      peer.once('send', function (command, message) {
        t.equal(command, 'getdata', 'sent getdata')
        t.ok(Array.isArray(message), 'message is an array')
        t.equal(message.length, 1, 'message has length 1')
        t.equal(message[0].hash.toString('hex'), hash.toString('hex'), 'correct hash')
        t.equal(message[0].type, INV.MSG_TX, 'correct inv type')
        t.end()
      })
      peer.emit('inv', [{ hash: hash, type: INV.MSG_TX }], peer)
    })
    t.test('multiple item inv', function (t) {
      var hashes = [
        Buffer('01234567890123456789012345678901'),
        Buffer('abcdefghijklmnopqrstuv0123456789')
      ]
      peer.once('send', function (command, message) {
        t.equal(command, 'getdata', 'sent getdata')
        t.ok(Array.isArray(message), 'message is an array')
        t.equal(message.length, 2, 'message has length 2')
        t.equal(message[0].hash.toString('hex'), hashes[0].toString('hex'), 'correct hash')
        t.equal(message[1].hash.toString('hex'), hashes[1].toString('hex'), 'correct hash')
        t.equal(message[0].type, INV.MSG_TX, 'correct inv type')
        t.equal(message[1].type, INV.MSG_TX, 'correct inv type')
        t.end()
      })
      peer.emit('inv', hashes.map(function (hash) {
        return { hash: hash, type: INV.MSG_TX }
      }), peer)
    })
    t.test('inv that is being requested', function (t) {
      peer.once('send', function (command, message) {
        t.fail('should not have sent message')
      })
      peer.emit('inv', [{ hash: hash, type: INV.MSG_TX }], peer)
      t.end()
    })
    t.test('inv that is in the inventory', function (t) {
      inv.once('tx', function () {
        peer.once('send', function (command, message) {
          t.fail('should not have sent message')
        })
        peer.emit('inv', [{ hash: hash, type: INV.MSG_TX }], peer)
        t.end()
      })
      peer.emit('tx', { getHash: function () { return hash } })
    })
    t.test('close', function (t) {
      inv.close()
      t.end()
    })
  })
})

function MockPeer () {
  EventEmitter.call(this)
}
inherits(MockPeer, EventEmitter)
MockPeer.prototype.send = function (command, message) {
  this.emit('send', command, message)
}
