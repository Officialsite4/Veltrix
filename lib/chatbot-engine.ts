export interface ChatbotSettingsContext {
  withdrawFeePercent: number;
  minWithdrawUsdt: number;
  withdrawLockDays: number;
  signalProfitPercent: number;
  signalValidityMinutes: number;
  signalSettleMinutes: number;
  regularSchedule: string;
  extraSignalTime: string;
  firstDepositBonusPct: number;
  directReferralBonusPct: number;
  foodAllowancePct: number;
  foodAllowanceMin: number;
  supportContact: string;
}

export interface ChatbotResponse {
  reply: string;
  isRedFlag: boolean;
  flagReason: string | null;
  topic: string;
}

const RED_FLAG_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(hack|exploit|bypass|sql\s*injection|xss|ddos|crack|steal|leak|phish)\b/i,
    reason: 'Security / exploit probing attempt',
  },
  {
    pattern: /(#admin|admin\s*password|admin\s*panel|secret\s*code|database\s*dump|override\s*balance)/i,
    reason: 'Unauthorized admin credential / system probing',
  },
  {
    pattern: /\b(fake\s*txid|fake\s*deposit|photoshop|double\s*withdraw|scam\s*you|cheat\s*system)\b/i,
    reason: 'Potential financial fraud / abuse intent',
  },
  {
    pattern: /\b(fuck|shit|bitch|asshole|bastard|scammer|fraudster|idiot)\b/i,
    reason: 'Abusive or hostile language',
  },
];

export function processSupportMessage(
  rawMessage: string,
  ctx: ChatbotSettingsContext
): ChatbotResponse {
  const message = rawMessage.trim();
  if (!message) {
    return {
      reply:
        'Hello! Welcome to Veltrix Quant Support. Please ask a question about deposits, signals, withdrawals, bonuses, referrals, or Sunday salaries.',
      isRedFlag: false,
      flagReason: null,
      topic: 'greeting',
    };
  }

  for (const rule of RED_FLAG_PATTERNS) {
    if (rule.pattern.test(message)) {
      return {
        reply: `I can only assist with official Veltrix Quant platform guidelines and policies. Security or unauthorized requests are not permitted. If you have a legitimate account issue, please contact our official support team at ${ctx.supportContact}.`,
        isRedFlag: true,
        flagReason: rule.reason,
        topic: 'red_flag',
      };
    }
  }

  const lower = message.toLowerCase();

  if (/^(hi|hello|hey|salam|assalam|good\s*(morning|afternoon|evening))\b/i.test(lower)) {
    return {
      reply:
        'Hello! I am the Veltrix Quant Support Assistant. Ask me about USDT BEP20 deposits, daily signal timings, withdrawals, 10% food allowance, referral bonuses, or Sunday salary levels.',
      isRedFlag: false,
      flagReason: null,
      topic: 'greeting',
    };
  }

  if (/(food\s*allowance|allowance|300)/i.test(lower)) {
    return {
      reply: `Food Allowance Policy: Deposits of $${ctx.foodAllowanceMin} USDT and above ($300, $500, $1,000, $2,000, $3,000, $5,000) qualify for a ${ctx.foodAllowancePct}% Food Allowance. This reward is sent directly to your bound BEP20 wallet address rather than your in-app trading wallet.`,
      isRedFlag: false,
      flagReason: null,
      topic: 'food_allowance',
    };
  }

  if (/(deposit|tier|package|bep20|txid|bscscan|minimum\s*deposit)/i.test(lower)) {
    return {
      reply: `Deposit Policy: Veltrix Quant accepts USDT (BEP20) only across fixed tiers: $100, $200, $300, $500, $1,000, $2,000, $3,000, and $5,000. Submit your exact amount and BscScan TXID for verification. Your first approved deposit grants a +${ctx.firstDepositBonusPct}% bonus to your Profit Balance.`,
      isRedFlag: false,
      flagReason: null,
      topic: 'deposit',
    };
  }

  if (/(signal|4\s*pm|6\s*pm|8\s*pm|9\s*pm|time|timing|schedule|paste|additional|extra|0\.80)/i.test(lower)) {
    return {
      reply: `Signal Schedule & Execution: An approved deposit ($100+) is required to unlock signals. Three regular signals are issued daily at ${ctx.regularSchedule} (default 4:00 PM, 6:00 PM, 8:00 PM), plus an additional signal at ${ctx.extraSignalTime} for newly deposited users (first 3 days) and their direct sponsor (max 1/day). Each signal remains valid for ${ctx.signalValidityMinutes} minutes, yields ${ctx.signalProfitPercent}% on (Trading Capital + Profit Balance), and credits profit after ${ctx.signalSettleMinutes} minutes.`,
      isRedFlag: false,
      flagReason: null,
      topic: 'signals',
    };
  }

  if (/(withdraw|cashout|payout|15\s*day|fee|address|wallet|pin|capital)/i.test(lower)) {
    return {
      reply: `Withdrawal Policy: Deposited Trading Capital stays locked for signal execution; only Profit Balance can be withdrawn. Withdrawals unlock permanently ${ctx.withdrawLockDays} days after your first approved deposit and run 24/7 (1 withdrawal per day, minimum $${ctx.minWithdrawUsdt} USDT, ${ctx.withdrawFeePercent}% fee). Your BEP20 address can be bound once—future address changes require official Admin support.`,
      isRedFlag: false,
      flagReason: null,
      topic: 'withdraw',
    };
  }

  if (/(salary|sunday|level|grade|rank)/i.test(lower)) {
    return {
      reply:
        'Sunday Salary Program: Salaries are distributed every Sunday across 7 leadership levels based on active ($100+ deposited) Grade A direct members and Grade A+B+C team size. Inactive ($0 deposit) accounts do not count toward level qualification.',
      isRedFlag: false,
      flagReason: null,
      topic: 'salary',
    };
  }

  if (/(refer|referral|invite|sponsor|team|bonus|commission|7%|5%)/i.test(lower)) {
    return {
      reply: `Referral & Team Policy: Registration is invite-only and requires a valid active member referral code. Your own referral link unlocks once your first deposit is approved. Direct Grade A referrals grant you +${ctx.directReferralBonusPct}% of every approved deposit into your Profit Balance, while Grade B and Grade C active members count toward your Sunday Salary rank.`,
      isRedFlag: false,
      flagReason: null,
      topic: 'referral',
    };
  }

  if (/(rule|policy|pdf|about|terms|legal)/i.test(lower)) {
    return {
      reply:
        'All Veltrix Quant operating policies, official posters, and the downloadable Rules PDF are available in the About & Policies section inside your app menu.',
      isRedFlag: false,
      flagReason: null,
      topic: 'about',
    };
  }

  return {
    reply: `I only have information about official Veltrix Quant rules and procedures. For specialized assistance or account-specific inquiries, please contact our official support team at ${ctx.supportContact}.`,
    isRedFlag: false,
    flagReason: null,
    topic: 'fallback',
  };
}
