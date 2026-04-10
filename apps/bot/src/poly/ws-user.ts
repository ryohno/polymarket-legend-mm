/**
 * User WebSocket (one per wallet).
 *
 * Subscribes to the authenticated `/ws/user` channel for order + trade updates
 * on all the event's conditionIds. Writes every update to the event emitter
 * that the strategy + DB layer consume.
 */

import WebSocket from 'ws'
import { CLOB_WS_USER_URL } from '@polymm/shared'
import { logger } from '../log.js'

export type UserEventKind = 'order_update' | 'trade_update' | 'unknown'

export interface UserEvent {
  kind: UserEventKind
  walletAddress: string
  raw: unknown
  receivedAt: number
}

export type UserEventListener = (event: UserEvent) => void

interface ApiCreds {
  key: string
  secret: string
  passphrase: string
}

export class UserDataWs {
  private ws: WebSocket | null = null
  private pingTimer: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private intentionalClose = false
  private readonly listeners = new Set<UserEventListener>()

  constructor(
    private readonly walletAddress: string,
    private readonly creds: ApiCreds,
    private readonly conditionIds: readonly string[]
  ) {}

  connect(): void {
    this.intentionalClose = false
    logger.info({ wallet: this.walletAddress }, 'user-ws: connecting')
    const ws = new WebSocket(CLOB_WS_USER_URL)
    this.ws = ws

    ws.on('open', () => {
      this.reconnectAttempt = 0
      logger.info({ wallet: this.walletAddress }, 'user-ws: open')
      ws.send(
        JSON.stringify({
          auth: {
            apiKey: this.creds.key,
            secret: this.creds.secret,
            passphrase: this.creds.passphrase,
          },
          type: 'user',
          markets: [...this.conditionIds],
        })
      )
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('PING')
      }, 10_000)
    })

    ws.on('message', (data) => {
      const text = data.toString()
      if (text === 'PONG' || text === 'PING') return
      try {
        const parsed = JSON.parse(text)
        const msgs = Array.isArray(parsed) ? parsed : [parsed]
        for (const msg of msgs) {
          const kind: UserEventKind =
            msg.event_type === 'order' || msg.event_type === 'order_update'
              ? 'order_update'
              : msg.event_type === 'trade' || msg.event_type === 'trade_update'
                ? 'trade_update'
                : 'unknown'
          for (const listener of this.listeners) {
            listener({
              kind,
              walletAddress: this.walletAddress,
              raw: msg,
              receivedAt: Date.now(),
            })
          }
        }
      } catch (err) {
        logger.warn({ err, wallet: this.walletAddress }, 'user-ws: parse error')
      }
    })

    ws.on('close', (code) => {
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = null
      if (this.intentionalClose) return
      this.reconnectAttempt++
      const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempt)
      logger.warn({ code, wallet: this.walletAddress, delay }, 'user-ws: reconnecting')
      setTimeout(() => this.connect(), delay)
    })

    ws.on('error', (err) => {
      logger.error({ err, wallet: this.walletAddress }, 'user-ws: socket error')
    })
  }

  close(): void {
    this.intentionalClose = true
    this.ws?.close()
    if (this.pingTimer) clearInterval(this.pingTimer)
  }

  onEvent(listener: UserEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
