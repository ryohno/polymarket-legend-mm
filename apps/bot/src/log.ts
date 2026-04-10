/**
 * Structured logger (pino) with key-material redaction.
 *
 * Never log:
 *   - privateKey, mnemonic
 *   - CLOB API secret/passphrase
 *   - KEYSTORE_PASSWORD
 */

import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'privateKey',
      '*.privateKey',
      'mnemonic',
      '*.mnemonic',
      'secret',
      '*.secret',
      'passphrase',
      '*.passphrase',
      'password',
      '*.password',
      'KEYSTORE_PASSWORD',
      'creds.secret',
      'creds.passphrase',
    ],
    censor: '[REDACTED]',
  },
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        },
})
