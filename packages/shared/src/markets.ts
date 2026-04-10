/**
 * Live Polymarket market definitions for the Legend Trade Series event.
 *
 * Source of truth: Gamma API
 *   https://gamma-api.polymarket.com/events?slug=who-will-win-the-legend-trade-series
 * Fetched 2026-04-10.
 *
 * This file is intentionally a hardcoded snapshot so the bot can boot deterministically
 * without a network round-trip. To add a new event, write a loader that populates a
 * MarketDef[] from Gamma and use it in place of LEGEND_TRADE_SERIES_MARKETS.
 *
 * Notes:
 * - The event is NegRisk. All markets settle against the NegRisk CTF Exchange.
 * - Kurt has a 0.001 tick size; everyone else is 0.01.
 * - Joey and "Other" are inactive (manualActivation); the bot only quotes the 8 live markets.
 */

import type { MarketDef } from './types.js'

export const LEGEND_TRADE_SERIES_EVENT = {
  slug: 'who-will-win-the-legend-trade-series',
  eventId: '326443',
  negRiskMarketId: '0x167daf2eda42f85368d396cf9576603e2c7eaa7486004be8457d8e52882bd500',
  endDate: '2026-04-16T00:00:00Z',
  resolver: '0x69c47De9D4D3Dad79590d61b9e05918E03775f24',
  negRisk: true,
} as const

/**
 * All 10 markets (8 live + 2 inactive), as they exist on Polymarket.
 */
export const ALL_LEGEND_MARKETS: readonly MarketDef[] = [
  {
    trader: 'MINHxDYNASTY',
    slug: 'will-minhxdynasty-win-the-legend-trade-series',
    conditionId: '0x90665ddb867b069d3d51ac5709f4dcf59c0bc846f3323ce58aa86ed3634a9aa1',
    yesTokenId: '15833387738465285384721779088662815953619609162513344413977003306071614255601',
    noTokenId: '86722129062503806068236121733451600943693326121014515109304333646776441949827',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
  {
    trader: 'Jadoodoo',
    slug: 'will-jadoodoo-win-the-legend-trade-series',
    conditionId: '0xa961b6079bb7fb06b37dbc98df04fc568133fe7dfb788f7c066cbc52dcb40474',
    yesTokenId: '76213921189552775097453077173013446024221392159577740188489762514625416911814',
    noTokenId: '98996667012371469306635424941834764149872696354977941252088518725293441372567',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
  {
    trader: 'Elisa',
    slug: 'will-elisa-win-the-legend-trade-series',
    conditionId: '0x0a5b2d91711173467cdd12b62530a2658d7d98b67dce4285967ef748d4155a61',
    yesTokenId: '58598143428979256761428976729981324127225434097538834200181335748643589485758',
    noTokenId: '219136386151484245387139903599893457000425859603787609059544167670377027398',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
  {
    trader: 'Kurt',
    slug: 'will-kurt-win-the-legend-trade-series',
    conditionId: '0xfabe32aadba3b67958f9b7416a0080129586c0f52bb2a22f48c1015ebd4d7e86',
    yesTokenId: '11983122424969365799115051174847061345897800207229472907570155452352471815518',
    noTokenId: '7229257364198145803300918017446190160767791411466051782954773637492634482633',
    tickSize: 0.001,
    minOrderSize: 5,
    negRisk: true,
  },
  {
    trader: 'Jim Parillo',
    slug: 'will-jim-parillo-win-the-legend-trade-series',
    conditionId: '0x8cfa0af5981b37d862f99100b85a07d77a1510cb1dc4fac02e61b43af3b94117',
    yesTokenId: '29057280529587995005119693932086817702802857713241185738962256459103047405687',
    noTokenId: '103474817682557668557649719745631602035823083024103499212550768836857567708444',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
  {
    trader: 'Trevor',
    slug: 'will-trevor-win-the-legend-trade-series',
    conditionId: '0x40fe71d0a61c664b0528c15406a1db44c5659cd7612c964093705c2ca6b531d2',
    yesTokenId: '82724510251505851436568284771149051482225184882990193928256126061224782052808',
    noTokenId: '28169329089814604992195249972671894766558978681819638547916603056942991957711',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
  {
    trader: 'Madz',
    slug: 'will-madz-win-the-legend-trade-series',
    conditionId: '0xeacf632d1cc37371f105d275a48dea3cfe19212b91c5505c8c8f68b663ca77c9',
    yesTokenId: '94343378572379880411162160646185207415788812244787541662517710758580224008982',
    noTokenId: '8510023428738032952711262696429089765120909146686668957095882616913892730648',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
  {
    trader: 'Prodzy',
    slug: 'will-prodzy-win-the-legend-trade-series',
    conditionId: '0x5df8bfe979cdd8a82b2e91ac65e01955740f1348bbe2f5ce70d35df0a4029aae',
    yesTokenId: '79590291110327769989624570377511647445184442732174348234935181250427525713127',
    noTokenId: '65887825519003222820599288360561958688358596189324279559554640075512828927578',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
  // --- Inactive markets (do NOT quote) ---
  {
    trader: 'Joey',
    slug: 'will-joey-win-the-legend-trade-series',
    conditionId: '0x60cad96d958641174ac3927d2d734988916f76b20add005fe2e482f5350a6ac1',
    yesTokenId: '42979033063366221054564396061471811536573310283086957354441762013309307007164',
    noTokenId: '66631033264845597405023619574150733206778161814357693421753561297823125641176',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
  {
    trader: 'Other',
    slug: 'will-another-trader-win-the-legend-trade-series',
    conditionId: '0xf94ca12a469bb09a6863fb8b6d22bd74efe0f8f1b08f130e3de1f541db3fab27',
    yesTokenId: '7556888158662677931699805946792874975019323367836669101967226809322723805671',
    noTokenId: '79922811079036524906075936324505307145800428563782798726243716767635749136677',
    tickSize: 0.01,
    minOrderSize: 5,
    negRisk: true,
  },
] as const

/**
 * Slugs of inactive markets. Never quoted by the bot.
 */
export const INACTIVE_MARKET_SLUGS = new Set<string>([
  'will-joey-win-the-legend-trade-series',
  'will-another-trader-win-the-legend-trade-series',
])

/**
 * Primary export: the 8 markets the bot actively quotes.
 */
export const LEGEND_TRADE_SERIES_MARKETS: readonly MarketDef[] = ALL_LEGEND_MARKETS.filter(
  (m) => !INACTIVE_MARKET_SLUGS.has(m.slug)
)

/**
 * Lookup helpers.
 */
export function findMarketByCondition(
  markets: readonly MarketDef[],
  conditionId: string
): MarketDef | undefined {
  return markets.find((m) => m.conditionId.toLowerCase() === conditionId.toLowerCase())
}

export function findMarketByTokenId(
  markets: readonly MarketDef[],
  tokenId: string
): { market: MarketDef; outcome: 'YES' | 'NO' } | undefined {
  for (const market of markets) {
    if (market.yesTokenId === tokenId) return { market, outcome: 'YES' }
    if (market.noTokenId === tokenId) return { market, outcome: 'NO' }
  }
  return undefined
}
