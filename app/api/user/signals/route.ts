import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import { getDb, getSettingsMap, withTransaction } from '@/lib/db';
import { calculateSignalProfit, evaluateSignalEligibility } from '@/lib/quant-rules';
import {
  getStartOfTodayUtcMs,
  getTeamTreeForUser,
  settleDueSignals,
} from '@/lib/settlement';

const claimSchema = z.object({
  signalCode: z.string().trim().min(3, 'Enter a valid signal code').max(40),
});

export async function GET() {
  settleDueSignals();
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const settings = getSettingsMap();
  const now = Date.now();
  const isDepositActive = user.capital_balance >= 100 && user.first_deposit_at !== null;

  // Never expose un-pasted signal codes here! Only show active window indicators and user's own claim history.
  const activeWindows = db
    .prepare(
      `SELECT id, pair, direction, signal_type, profit_percent, starts_at, expires_at, settle_delay_minutes
       FROM signals
       WHERE starts_at <= ? AND expires_at >= ?
       ORDER BY starts_at DESC`
    )
    .all(now, now);

  const claims = db
    .prepare(
      `SELECT sc.id, sc.signal_id, s.signal_code, s.pair, s.direction, s.signal_type,
              sc.base_capital, sc.base_profit, sc.total_base, sc.profit_percent,
              sc.expected_profit, sc.status, sc.claimed_at, sc.settle_at, sc.settled_at
       FROM signal_claims sc
       JOIN signals s ON s.id = sc.signal_id
       WHERE sc.user_id = ?
       ORDER BY sc.claimed_at DESC
       LIMIT 30`
    )
    .all(user.id);

  return NextResponse.json({
    isDepositActive,
    capitalBalance: user.capital_balance,
    profitBalance: user.profit_balance,
    compoundingBase: user.capital_balance + user.profit_balance,
    activeWindowsCount: activeWindows.length,
    activeWindows,
    claims,
    schedule: {
      regularTimes: settings.signal_schedule_times || '16:00, 18:00, 20:00',
      extraTime: settings.extra_signal_time || '21:00',
      timezone: settings.timezone || 'Asia/Karachi',
    },
  });
}

export async function POST(req: NextRequest) {
  settleDueSignals();
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Enter a valid signal code.' },
        { status: 400 }
      );
    }

    const code = parsed.data.signalCode.trim().toUpperCase();
    const db = getDb();
    const now = Date.now();
    const todayStart = getStartOfTodayUtcMs(now);

    const signal = db
      .prepare('SELECT * FROM signals WHERE UPPER(signal_code) = ?')
      .get(code) as
      | {
          id: number;
          signal_code: string;
          pair: string;
          direction: string;
          signal_type: 'REGULAR' | 'ADDITIONAL';
          profit_percent: number;
          starts_at: number;
          expires_at: number;
          settle_delay_minutes: number;
        }
      | undefined;

    if (!signal) {
      return NextResponse.json({ error: 'Invalid signal code.' }, { status: 404 });
    }

    const existingClaim = db
      .prepare('SELECT id FROM signal_claims WHERE signal_id = ? AND user_id = ?')
      .get(signal.id, user.id) as { id: number } | undefined;

    const tree = getTeamTreeForUser(user.id);
    const sponsorExtraRow = db
      .prepare(
        `SELECT COUNT(*) as cnt
         FROM signal_claims sc
         JOIN signals s ON s.id = sc.signal_id
         WHERE sc.user_id = ? AND s.signal_type = 'ADDITIONAL' AND sc.claimed_at >= ?`
      )
      .get(user.id, todayStart) as { cnt: number };

    const check = evaluateSignalEligibility({
      capitalBalance: user.capital_balance,
      firstDepositAtMs: user.first_deposit_at,
      signalType: signal.signal_type,
      startsAtMs: signal.starts_at,
      expiresAtMs: signal.expires_at,
      alreadyClaimed: Boolean(existingClaim),
      hasNewActiveDirectReferralWithin3Days: tree.hasNewActiveDirectReferralWithin3Days,
      sponsorAdditionalClaimsToday: sponsorExtraRow.cnt,
      nowMs: now,
    });

    if (!check.eligible) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }

    const createdClaim = withTransaction((tx) => {
      const freshUser = tx
        .prepare('SELECT capital_balance, profit_balance FROM users WHERE id = ?')
        .get(user.id) as { capital_balance: number; profit_balance: number };

      const dup = tx
        .prepare('SELECT id FROM signal_claims WHERE signal_id = ? AND user_id = ?')
        .get(signal.id, user.id) as { id: number } | undefined;
      if (dup) {
        throw new Error('DUPLICATE_CLAIM');
      }

      const { totalBase, expectedProfit } = calculateSignalProfit(
        freshUser.capital_balance,
        freshUser.profit_balance,
        signal.profit_percent
      );
      const settleAt = now + signal.settle_delay_minutes * 60 * 1000;

      const info = tx
        .prepare(
          `INSERT INTO signal_claims
           (signal_id, user_id, base_capital, base_profit, total_base, profit_percent, expected_profit, status, claimed_at, settle_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
        )
        .run(
          signal.id,
          user.id,
          freshUser.capital_balance,
          freshUser.profit_balance,
          totalBase,
          signal.profit_percent,
          expectedProfit,
          now,
          settleAt
        );

      return {
        id: Number(info.lastInsertRowid),
        signalCode: signal.signal_code,
        pair: signal.pair,
        direction: signal.direction,
        signalType: signal.signal_type,
        totalBase,
        profitPercent: signal.profit_percent,
        expectedProfit,
        claimedAt: now,
        settleAt,
      };
    });

    return NextResponse.json({ ok: true, claim: createdClaim }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'DUPLICATE_CLAIM') {
      return NextResponse.json({ error: 'You have already executed this signal.' }, { status: 409 });
    }
    console.error('Signal claim error:', err);
    return NextResponse.json({ error: 'Unable to execute signal.' }, { status: 500 });
  }
}
