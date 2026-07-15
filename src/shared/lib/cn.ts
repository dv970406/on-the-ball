import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind 클래스 병합 유틸 (조건부 클래스 + 중복 해소) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
