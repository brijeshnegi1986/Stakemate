import { getSetting, setSetting } from "@/db/database";
import { TRIAL_DAYS as HAND_REVIEW_TRIAL_DAYS } from "@/constants/subscription";

const SETTING_KEY = "handReviewFirstUsed";
const MS_PER_DAY  = 86_400_000;

export function getHandReviewTrialStatus(): {
  allowed: boolean;       // can they use it right now?
  daysLeft: number;       // 0 = expired, >0 = days remaining in trial
  trialStarted: boolean;  // has trial begun at all?
} {
  const raw = getSetting(SETTING_KEY);
  if (!raw) {
    // Trial hasn't started yet — will start on first use
    return { allowed: true, daysLeft: HAND_REVIEW_TRIAL_DAYS, trialStarted: false };
  }
  const firstUsed = parseInt(raw, 10);
  const elapsed   = Date.now() - firstUsed;
  const daysLeft  = Math.max(0, HAND_REVIEW_TRIAL_DAYS - Math.floor(elapsed / MS_PER_DAY));
  return { allowed: daysLeft > 0, daysLeft, trialStarted: true };
}

export function markHandReviewTrialStarted(): void {
  if (!getSetting(SETTING_KEY)) {
    setSetting(SETTING_KEY, String(Date.now()));
  }
}
