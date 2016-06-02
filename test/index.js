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
})
