import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getEpochTime(millis: number = Date.now()): number {
  return Math.floor(millis / 1000)
}