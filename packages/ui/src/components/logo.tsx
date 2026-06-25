import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="58" height="58" rx="14" fill="#151515" />
      <rect x="3" y="3" width="58" height="58" rx="14" stroke="#2a2a2a" stroke-width="2" />
      <path
        d="M14 21L27 32L14 43"
        stroke="white"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M35 18L48 26L37 38"
        stroke="white"
        stroke-width="3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="35" cy="18" r="4" fill="white" />
      <circle cx="48" cy="26" r="4" fill="white" />
      <circle cx="37" cy="38" r="4" fill="white" />
      <path d="M41 48H53" stroke="white" stroke-width="4" stroke-linecap="round" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6" y="6" width="68" height="68" rx="16" fill="#151515" />
      <rect x="6" y="6" width="68" height="68" rx="16" stroke="#2a2a2a" stroke-width="2.5" />
      <path
        d="M19 27 35 40 19 53"
        stroke="white"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M44 23 60 33 47 48"
        stroke="white"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="44" cy="23" r="4.8" fill="white" />
      <circle cx="60" cy="33" r="4.8" fill="white" />
      <circle cx="47" cy="48" r="4.8" fill="white" />
      <path d="M51 59H66" stroke="white" stroke-width="4" stroke-linecap="round" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <rect y="0" width="42" height="42" rx="9" fill="#151515" />
      <rect x="1" y="1" width="40" height="40" rx="8" stroke="#2a2a2a" stroke-width="2" />
      <path
        d="M9 14L18 21L9 28"
        stroke="white"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M23 12L32 18L24 26"
        stroke="white"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="23" cy="12" r="3" fill="white" />
      <circle cx="32" cy="18" r="3" fill="white" />
      <circle cx="24" cy="26" r="3" fill="white" />
      <path d="M28 32H36" stroke="white" stroke-width="3" stroke-linecap="round" />
      <text
        x="54"
        y="29"
        fill="var(--icon-strong-base)"
        font-family="Inter, ui-sans-serif, system-ui, sans-serif"
        font-size="26"
        font-weight="800"
        letter-spacing="0"
      >
        MIMO
      </text>
      <text
        x="130"
        y="29"
        fill="var(--icon-base)"
        font-family="Inter, ui-sans-serif, system-ui, sans-serif"
        font-size="26"
        font-weight="800"
        letter-spacing="0"
      >
        CODE
      </text>
    </svg>
  )
}
