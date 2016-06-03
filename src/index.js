'use strict'

var EventEmitter = require('events')
var INV = require('bitcoin-protocol').constants.inventory
var MapDeque = require('map-deque')
var old = require('old')
var reverse = require('buffer-reverse')

// TODO: prevent DoS (e.g. rate limiting, cap on stored data)

class Inventory extends EventEmitter {
  constructor (peers, opts = {}) {
    if (!peers) {
      throw new Error('Must provide "peers" argument')
    }
    super()
    var ttl = opts.ttl != null ? opts.ttl : 2 * 60 * 1000
    this.peers = peers
    this.data = new MapDeque()
    this.requesting = {}

    this.peers.on('inv', this._onInv.bind(this))
    this.peers.on('tx', this._onTx.bind(this))

    this.lastCount = 0
    this.interval = setInterval(this._removeOld.bind(this), ttl)
  }

  _onInv (items, peer = this.peers) {
    var getData = []
    for (let item of items) {
      if (item.type !== INV.MSG_TX) continue
      let hash = getHash(item.hash)
      if (this.requesting[hash] || this.data.has(hash)) continue
      getData.push(item)
      this.requesting[hash] = true
    }
    if (getData.length > 0) {
      peer.send('getdata', getData)
    }
  }

  _onTx (tx, peer = this.peers) {
    var hash = getHash(tx.getHash())
    delete this.requesting[hash]
    if (this.data.has(hash)) return
    this.add(tx, false)
    this.emit('tx', tx, peer)
    this.emit(`tx:${hash}`, tx, peer)
  }

  _removeOld () {
    for (let i = 0; i < this.lastCount; i++) {
      this.data.shift()
    }
    this.lastCount = this.data.length
  }

  add (data, announce = true) {
    var hash = getHash(data.getHash())
    if (this.data.has(hash)) return
    this.data.push(hash, data)
    if (!announce) return
    this.peers.send('inv', [
      { hash: data.getHash(), type: INV.MSG_TX }
    ])
  }

  get (hash) {
    return this.data.get(getHash(hash))
  }

  close () {
    clearInterval(this.interval)
  }
}

function getHash (hash) {
  return reverse(hash).toString('hex')
}

module.exports = old(Inventory)
