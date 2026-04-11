#!/usr/bin/env tsx
/**
 * Decrypt and print the private keys of the treasury + MM wallets.
 *
 * ⚠  LOCAL USE ONLY — this must NEVER be run via an LLM/agent tool because
 *     the output would flow through the tool channel.
 *     Run this yourself in a terminal on your own machine.
 *
 *     Copy the output to a password manager (1Password, Bitwarden, etc.)
 *     and clear your terminal scrollback afterwards (`clear && printf '\033[3J'`).
 *
 * Usage:
 *   pnpm treasury:export-keys
 *
 * Requires:
 *   - KEYSTORE_PASSWORD in .env
 *   - data/treasury.json and/or data/keystore/*.json to exist
 */

import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadScriptEnv } from './lib/env.js'
import { loadKeystore, decryptKeystore } from '@polymm/shared'

const TREASURY_PATH = 'data/treasury.json'
const KEYSTORE_DIR = 'data/keystore'

function printHeader() {
  const bar = '━'.repeat(72)
  process.stdout.write('\n')
  process.stdout.write(`\x1b[38;2;255;66;69m${bar}\x1b[0m\n`)
  process.stdout.write(
    `\x1b[1m\x1b[38;2;255;66;69m  ⚠  PRIVATE KEY EXPORT  —  DO NOT PASTE THIS OUTPUT ANYWHERE\x1b[0m\n`
  )
  process.stdout.write(
    `\x1b[38;2;163;163;163m  These keys control real money. If anyone else sees them, assume\x1b[0m\n`
  )
  process.stdout.write(
    `\x1b[38;2;163;163;163m  the funds are compromised. Copy to a password manager and clear\x1b[0m\n`
  )
  process.stdout.write(
    `\x1b[38;2;163;163;163m  your terminal scrollback after: clear && printf '\\033[3J'\x1b[0m\n`
  )
  process.stdout.write(`\x1b[38;2;255;66;69m${bar}\x1b[0m\n\n`)
}

function printFooter() {
  const bar = '━'.repeat(72)
  process.stdout.write(`\n\x1b[38;2;255;66;69m${bar}\x1b[0m\n`)
  process.stdout.write(
    `\x1b[38;2;163;163;163m  Now: clear && printf '\\033[3J'     (wipes scrollback)\x1b[0m\n`
  )
  process.stdout.write(`\x1b[38;2;255;66;69m${bar}\x1b[0m\n\n`)
}

function row(label: string, address: string, privateKey: string) {
  process.stdout.write(`  \x1b[38;2;255;163;24m${label.padEnd(10)}\x1b[0m `)
  process.stdout.write(`\x1b[38;2;245;245;245m${address}\x1b[0m\n`)
  process.stdout.write(`             \x1b[38;2;255;66;69m${privateKey}\x1b[0m\n\n`)
}

async function main() {
  const env = loadScriptEnv()

  // Detect if stdin is being piped — if so, refuse (possible LLM harness)
  if (!process.stdout.isTTY) {
    process.stderr.write(
      '❌ Refusing to export private keys to a non-interactive terminal.\n' +
        '   Run this command directly in your own terminal, not via a pipe\n' +
        '   or an LLM tool wrapper. Keys must never cross a tool boundary.\n'
    )
    process.exit(1)
  }

  printHeader()

  let found = 0

  if (existsSync(TREASURY_PATH)) {
    try {
      const ks = loadKeystore(TREASURY_PATH)
      const key = decryptKeystore(ks, env.KEYSTORE_PASSWORD)
      row('treasury', ks.address, key)
      found++
    } catch (err) {
      process.stderr.write(`  treasury: ${(err as Error).message}\n`)
    }
  }

  if (existsSync(KEYSTORE_DIR)) {
    const files = readdirSync(KEYSTORE_DIR)
      .filter((f) => f.match(/^\d+\.json$/))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    for (const file of files) {
      try {
        const ks = loadKeystore(join(KEYSTORE_DIR, file))
        const key = decryptKeystore(ks, env.KEYSTORE_PASSWORD)
        row(ks.label, ks.address, key)
        found++
      } catch (err) {
        process.stderr.write(`  ${file}: ${(err as Error).message}\n`)
      }
    }
  }

  if (found === 0) {
    process.stdout.write('  (no keystores found)\n\n')
    return
  }

  printFooter()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
