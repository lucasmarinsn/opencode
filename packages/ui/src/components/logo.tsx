import { type ComponentProps } from "solid-js"

const FrynSymbol = (props: { id: string }) => (
  <>
    <defs>
      <linearGradient id={props.id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8b5cf6" />
        <stop offset="0.55" stop-color="#7c3aed" />
        <stop offset="1" stop-color="#22d3ee" />
      </linearGradient>
    </defs>
    <path
      d="M13 7h39c-1.2 9-7.8 15-17.5 15H25v8h20c-1 9-7.4 15-17 15h-3v3.5C25 56 20.5 61 12 64V17c0-4.7.2-7.3 1-10Z"
      fill={`url(#${props.id})`}
    />
  </>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Fryn"
    >
      <FrynSymbol id="fryn-mark-gradient" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Fryn"
    >
      <FrynSymbol id="fryn-splash-gradient" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 210 64"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
      aria-label="Fryn"
    >
      <g transform="translate(0 0)">
        <FrynSymbol id="fryn-logo-gradient" />
      </g>
      <text
        x="76"
        y="45"
        fill="var(--text-strong, currentColor)"
        font-size="39"
        font-weight="700"
        font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        letter-spacing="-1.2"
      >
        Fryn
      </text>
    </svg>
  )
}
