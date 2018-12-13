'use strict'

const EventEmitter = require('events')
const protocol = require('bitcoin-protocol')
const MapDeque = require('map-deque')
const old = require('old')
const createHash = require('create-hash')

const INV = protocol.constants.inventory
const encodeTx = protocol.types.transaction.encode

// TODO: prevent DoS (e.g. rate limiting, cap on stored data)
// TODO: add optional tx verification (user-provided function), and broadcast valid txs

class Inventory extends EventEmitter {
  constructor (peers, opts = {}) {
    if (!peers) {
      throw Error('Must provide "peers" argument')
    }
    super()
    let ttl = opts.ttl != null ? opts.ttl : 2 * 60 * 1000
    this.peers = peers
    this.data = new MapDeque()
    this.requesting = {}

    this.peers.on('inv', this._onInv.bind(this))
    this.peers.on('tx', this._onTx.bind(this))
    this.peers.on('getdata', this._onGetdata.bind(this))
    this.peers.on('reject', this._onReject.bind(this))

    this.lastCount = 0
    this.interval = setInterval(this._removeOld.bind(this), ttl)
    if (this.interval.unref) this.interval.unref()
  }

  _onInv (items, peer = this.peers) {
    let getData = []
    for (let item of items) {
      if (item.type !== INV.MSG_TX) continue
      let hash = hashToString(item.hash)
      if (this.requesting[hash] || this.data.has(hash)) continue
      item.hash = reverse(item.hash)
      getData.push(item)
      this.requesting[hash] = true
    }
    if (getData.length > 0) {
      peer.send('getdata', getData)
    }
  }

  _onTx (tx, peer = this.peers) {
    let hash = getTxHash(tx)
    let hashStr = hashToString(hash)
    delete this.requesting[hashStr]
    if (this.data.has(hashStr)) return
    this._add(tx, false)
    this.emit('tx', tx, peer)
  }

  _onGetdata (items, peer = this.peers) {
    for (let item of items) {
      if (item.type !== INV.MSG_TX) continue
      let hash = hashToString(item.hash)
      if (!this.data.has(hash)) continue
      let entry = this.data.get(hash)
      if (!entry.broadcast) continue
      peer.send('tx', this.data.get(hash).tx)
    }
  }

  _onReject (message, peer = this.peers) {
    console.log('got reject', message)
  }

  _removeOld () {
    for (let i = 0; i < this.lastCount; i++) {
      this.data.shift()
    }
    this.lastCount = this.data.length
  }

  _add (tx, broadcast) {
    let hashBuf = getTxHash(tx)
    let hash = hashToString(hashBuf)
    if (!this.data.has(hash)) {
      this.data.push(hash, { tx, broadcast })
    } else {
      this.data.get(hash).broadcast = true
    }
  }

  broadcast (tx) {
    this._add(tx, true)
    this._sendInv(tx, this.peers)
  }

  _sendInv (tx, peer) {
    peer.send('inv', [
      { hash: getTxHash(tx), type: INV.MSG_TX }
    ])
  }

  get (hash) {
    let entry = this.data.get(hashToString(hash))
    if (entry) return entry.tx
  }

  close () {
    clearInterval(this.interval)
    // TODO: stop listening to peers
  }
}

function reverse (buf) {
  let clone = Buffer.allocUnsafe(buf.length)
  buf.copy(clone)
  return clone.reverse()
}

function hashToString (hash) {
  return reverse(hash).toString('base64')
}

function getTxHash (tx) {
  let txBytes = encodeTx(tx)
  return sha256(sha256(txBytes))
}

function sha256 (data) {
  return createHash('sha256').update(data).digest()
}

module.exports = old(Inventory)
module.exports.getTxHash = getTxHash
module.exports.reverse = reverse
