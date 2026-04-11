import { getSetupStatus } from '../../lib/setup-status'
import { SetupWizard } from './_wizard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SetupPage() {
  const status = await getSetupStatus()
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold">Setup</h1>
        <p className="text-muted-3 text-sm mt-1">
          Get the bot ready to trade. Each step is idempotent — safe to re-run.
        </p>
      </header>
      <SetupWizard status={status} />
    </div>
  )
}
