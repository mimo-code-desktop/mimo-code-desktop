import { MetaProvider } from "@solidjs/meta"
import { render } from "solid-js/web"
import "@mimo-ai/app/index.css"
import { Font } from "@mimo-ai/ui/font"
import { Splash } from "@mimo-ai/ui/logo"
import { Progress } from "@mimo-ai/ui/progress"
import "./styles.css"
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { InitStep } from "../preload/types"

const root = document.getElementById("root")!
const lines = ["Starting local MiMo Code...", "Waiting for mimo serve", "This may take a moment"]
const delays = [3000, 9000]

render(() => {
  const [step, setStep] = createSignal<InitStep | null>(null)
  const [line, setLine] = createSignal(0)

  const phase = createMemo(() => step()?.phase)

  const value = createMemo(() => {
    if (phase() === "done") return 100
    return 35
  })

  window.api
    .awaitInitialization((next) => setStep(next as InitStep))
    .then(() => setStep({ phase: "done" }))
    .catch(() => undefined)

  onMount(() => {
    setLine(0)

    const timers = delays.map((ms, i) => setTimeout(() => setLine(i + 1), ms))

    onCleanup(() => {
      timers.forEach(clearTimeout)
    })
  })

  createEffect(() => {
    if (phase() !== "done") return

    const timer = setTimeout(() => window.api.loadingWindowComplete(), 1000)
    onCleanup(() => clearTimeout(timer))
  })

  const status = createMemo(() => {
    if (phase() === "done") return "All done"
    return lines[line()]
  })

  return (
    <MetaProvider>
      <div class="w-screen h-screen bg-background-base flex items-center justify-center">
        <Font />
        <div class="flex flex-col items-center gap-11">
          <Splash class="size-20 opacity-15" />
          <div class="w-60 flex flex-col items-center gap-4" aria-live="polite">
            <span class="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-strong text-14-normal">
              {status()}
            </span>
            <Progress
              value={value()}
              class="w-20 [&_[data-slot='progress-track']]:h-1 [&_[data-slot='progress-track']]:border-0 [&_[data-slot='progress-track']]:rounded-none [&_[data-slot='progress-track']]:bg-surface-weak [&_[data-slot='progress-fill']]:rounded-none [&_[data-slot='progress-fill']]:bg-icon-warning-base"
              aria-label="Server startup progress"
              getValueLabel={({ value }) => `${Math.round(value)}%`}
            />
          </div>
        </div>
      </div>
    </MetaProvider>
  )
}, root)
