// Project serialisation. Reading a file is the one place untrusted values enter
// the app, so every field is coerced against the shape of a default cloud and
// then clamped — a hand-edited file can't put the renderer into a bad state.

import { defaultCloud, normalizeCloud } from "./synth.js";

const FORMAT = "cloud-studio/v1";
const DEFAULT_DURATION = 10;

export function toProjectJson(state) {
  return JSON.stringify(
    {
      format: FORMAT,
      name: state.name,
      durationSec: state.durationSec,
      clouds: state.clouds,
    },
    null,
    2
  );
}

const isCloudLike = (raw) => raw !== null && typeof raw === "object" && !Array.isArray(raw);

function reviveCloud(source, durationSec) {
  const cloud = defaultCloud();

  // The default cloud defines both the field list and each field's type.
  for (const [key, fallback] of Object.entries(cloud)) {
    const value = source[key];
    if (value === undefined) continue;
    if (typeof fallback === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) cloud[key] = n;
    } else if (typeof fallback === "boolean") {
      cloud[key] = Boolean(value);
    } else if (typeof fallback === "string") {
      cloud[key] = String(value);
    }
  }

  return { ...cloud, ...normalizeCloud(cloud, durationSec) };
}

export function fromProjectJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  if (!data || typeof data !== "object" || !Array.isArray(data.clouds)) {
    throw new Error("That doesn't look like a Cloud Studio project.");
  }

  const duration = Number(data.durationSec);
  const durationSec = Number.isFinite(duration) ? Math.min(60, Math.max(1, duration)) : DEFAULT_DURATION;

  return {
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "untitled",
    durationSec,
    // Entries that aren't objects are dropped rather than revived — a stray
    // null in a hand-edited file shouldn't become a silent default cloud.
    clouds: data.clouds.filter(isCloudLike).map((cloud) => reviveCloud(cloud, durationSec)),
  };
}

export function fileSlug(name) {
  return name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") || "untitled";
}

export function timeStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
