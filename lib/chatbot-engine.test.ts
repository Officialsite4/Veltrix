import test from 'node:test';
import assert from 'node:assert/strict';
import { processSupportMessage, type ChatbotSettingsContext } from './chatbot-engine';

const ctx: ChatbotSettingsContext = {
  withdrawFeePercent: 3,
  minWithdrawUsdt: 10,
  withdrawLockDays: 15,
  signalProfitPercent: 0.8,
  signalValidityMinutes: 30,
  signalSettleMinutes: 20,
  regularSchedule: '4:00 PM, 6:00 PM, 8:00 PM',
  extraSignalTime: '9:00 PM',
  firstDepositBonusPct: 5,
  directReferralBonusPct: 7,
  foodAllowancePct: 10,
  foodAllowanceMin: 300,
  supportContact: '+1 (800) 555-0199',
};

test('chatbot answers food allowance and signal schedule accurately in English', () => {
  const food = processSupportMessage('Tell me about food allowance', ctx);
  assert.equal(food.isRedFlag, false);
  assert.match(food.reply, /\$300/);
  assert.match(food.reply, /10%/);

  const sig = processSupportMessage('When are daily signals?', ctx);
  assert.equal(sig.isRedFlag, false);
  assert.match(sig.reply, /4:00 PM/);
  assert.match(sig.reply, /30 minutes/);
});

test('chatbot flags abusive or hacking attempts for admin red-flag queue', () => {
  const hack = processSupportMessage('How can I hack admin password?', ctx);
  assert.equal(hack.isRedFlag, true);
  assert.ok(hack.flagReason);
  assert.match(hack.reply, /\+1 \(800\) 555-0199/);
});

test('chatbot gives polite contact fallback for out-of-scope queries', () => {
  const unknown = processSupportMessage('What is the weather in Tokyo tomorrow?', ctx);
  assert.equal(unknown.isRedFlag, false);
  assert.equal(unknown.topic, 'fallback');
  assert.match(unknown.reply, /\+1 \(800\) 555-0199/);
});
