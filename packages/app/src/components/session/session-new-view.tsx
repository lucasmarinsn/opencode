import { For } from "solid-js"
import { useLanguage } from "@/context/language"

const ROOT_CLASS = "size-full flex flex-col"

interface NewSessionViewProps {
  worktree: string
}

export function NewSessionView(_props: NewSessionViewProps) {
  const language = useLanguage()

  const cards = () => [
    {
      badge: "PDF",
      title: language.t("session.new.card.documents.title"),
      text: language.t("session.new.card.documents.text"),
    },
    {
      badge: "IMG",
      title: language.t("session.new.card.images.title"),
      text: language.t("session.new.card.images.text"),
    },
    {
      badge: "365",
      title: language.t("session.new.card.outlook.title"),
      text: language.t("session.new.card.outlook.text"),
    },
  ]

  return (
    <div class={ROOT_CLASS}>
      <div class="h-12 shrink-0" aria-hidden />
      <div class="relative flex-1 overflow-hidden px-6 pb-30 flex items-center justify-center text-center">
        <div
          aria-hidden
          class="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 select-none text-[clamp(84px,15vw,190px)] font-[760] leading-none tracking-[-0.08em] text-v2-text-text-base/[0.035]"
        >
          Fryn
        </div>
        <div class="pointer-events-none absolute inset-x-[18%] top-[18%] h-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.18),rgba(37,99,235,0))] blur-3xl" />

        <div class="relative z-10 w-full max-w-[820px] flex flex-col items-center text-center gap-7">
          <div class="flex flex-col items-center gap-4">
            <div class="flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7c3aed,#2563eb)] text-white shadow-[0_18px_50px_rgba(99,102,241,0.28)]">
              <span class="text-[26px] font-[760] leading-none tracking-[-0.08em]">F</span>
            </div>
            <div class="space-y-2">
              <div class="text-[32px] font-[720] leading-tight tracking-[-0.04em] text-v2-text-text-base">
                {language.t("session.new.title")}
              </div>
              <div class="mx-auto max-w-[560px] text-[14px] font-[440] leading-6 text-v2-text-text-muted">
                {language.t("session.new.subtitle")}
              </div>
            </div>
          </div>

          <div class="grid w-full max-w-[720px] grid-cols-1 gap-3 md:grid-cols-3">
            <For each={cards()}>
              {(card) => (
                <div class="rounded-2xl border border-v2-border-border-muted bg-v2-background-bg-base/70 p-4 text-left shadow-[0_12px_35px_rgba(15,23,42,0.06)] backdrop-blur">
                  <div class="mb-3 flex size-9 items-center justify-center rounded-xl bg-v2-background-bg-layer-02 text-v2-icon-icon-accent">
                    <span class="text-[10px] font-[760] tracking-[-0.02em]">{card.badge}</span>
                  </div>
                  <div class="text-[13px] font-[650] leading-5 text-v2-text-text-base">{card.title}</div>
                  <div class="mt-1 text-[12px] font-[420] leading-5 text-v2-text-text-muted">{card.text}</div>
                </div>
              )}
            </For>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-2 text-[12px] font-[500] text-v2-text-text-muted">
            <div class="rounded-full border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-1.5">
              {language.t("session.new.badge.private")}
            </div>
            <div class="rounded-full border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-1.5">
              {language.t("session.new.badge.outlook")}
            </div>
            <div class="rounded-full border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-1.5">
              {language.t("session.new.badge.files")}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
