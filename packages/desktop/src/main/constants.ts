import { app } from "electron"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.OPENCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

// Fryn is distributed directly to the company. Do not contact the upstream
// OpenCode release feed or install updates from another project.
export const UPDATER_ENABLED = false
