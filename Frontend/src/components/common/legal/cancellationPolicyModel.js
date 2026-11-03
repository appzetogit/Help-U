/**
 * Turns the admin's cancellation settings into the stages shown on the policy page, so the page
 * always says what the server will actually charge.
 *   config    the public booking config (free window, grace, late fee / penalty)
 *   settings  the global settings (flat on-the-way penalty, visiting charge)
 */

const rupees = (n) => `₹${Number(n) || 0}`;
const hoursText = (h) => `${h} hour${Number(h) === 1 ? '' : 's'}`;

export const feeText = (type, value, max) => {
  const v = Number(value) || 0;
  if (v <= 0) return null;
  if (type === 'percentage') {
    const cap = Number(max) > 0 ? ` (up to ${rupees(max)})` : '';
    return `${v}% of the booking${cap}`;
  }
  return rupees(v);
};

export const userPolicy = (config, settings) => {
  const hours = Number(config.userFreeCancelHours) || 0;
  const grace = Number(config.userFreeCancelGraceMinutes) || 0;
  const lateFee = feeText(config.userLateCancelFeeType, config.userLateCancelFeeValue, config.userLateCancelFeeMax);
  // Mirrors the server: the flat fee exactly as the admin set it
  const onTheWay = Number(config?.cancellationPenalty ?? settings?.cancellationPenalty) || 0;
  const visiting = Number(settings?.visitedCharges ?? config?.visitedCharges) > 0
    ? Number(settings?.visitedCharges ?? config?.visitedCharges)
    : 149;

  const stages = [
    {
      key: 'search', tone: 'green', icon: 'search', title: 'Finding a professional',
      when: 'Until a professional accepts', result: 'Free',
      detail: 'Full refund of anything you paid. You are never charged if nobody accepts.'
    },
    hours > 0 && {
      key: 'early', tone: 'green', icon: 'check', title: 'Professional assigned',
      when: `More than ${hoursText(hours)} before your slot`, result: 'Free',
      detail: 'Full refund, no fee.'
    },
    {
      key: 'late', tone: lateFee ? 'amber' : 'green', icon: 'clock', title: 'Professional assigned',
      when: hours > 0 ? `Within ${hoursText(hours)} of your slot` : 'Once the free grace time ends',
      result: lateFee || 'Free',
      detail: grace > 0
        ? `Changed your mind right after they accept? It is free for the first ${grace} minutes, which also covers instant bookings.`
        : 'The professional has set aside this time for you.'
    },
    onTheWay > 0 && {
      key: 'way', tone: 'orange', icon: 'navigation', title: 'Professional on the way',
      when: 'After they start travelling to you', result: rupees(onTheWay),
      detail: 'A flat cancellation fee for the travel already under way.'
    },
    {
      key: 'arrived', tone: 'red', icon: 'pin', title: 'Professional arrived',
      when: 'Once they reach your address', result: 'Cannot be cancelled',
      detail: `They have reached you, so the visit is charged${visiting > 0 ? ` (${rupees(visiting)})` : ''} and the booking can no longer be cancelled in the app. If something is wrong, please contact support.`
    }
  ].filter(Boolean);

  return { hours, grace, lateFee, onTheWay, visiting, stages };
};

export const workerPolicy = (config) => {
  const hours = Number(config.workerFreeCancelHours) || 0;
  const grace = Number(config.workerFreeCancelGraceMinutes) || 0;
  const penalty = feeText(config.workerLateCancelPenaltyType, config.workerLateCancelPenaltyValue, config.workerLateCancelPenaltyMax);

  const stages = [
    {
      key: 'before', tone: 'green', icon: 'search', title: 'Before you accept',
      when: 'While a request is only an alert', result: 'No penalty',
      detail: 'Ignore or reject a request any time. Nothing is deducted.'
    },
    hours > 0 && {
      key: 'early', tone: 'green', icon: 'check', title: 'Accepted, plenty of time',
      when: `More than ${hoursText(hours)} before the slot`, result: 'No penalty',
      detail: 'The customer is matched with another professional.'
    },
    {
      key: 'late', tone: penalty ? 'amber' : 'green', icon: 'clock', title: 'Accepted, close to the slot',
      when: hours > 0 ? `Within ${hoursText(hours)} of the slot` : 'Once the free grace time ends',
      result: penalty || 'No penalty',
      detail: penalty
        ? 'Deducted from your earnings. Frequent cancellations also lower your ranking for new jobs.'
        : 'No money is deducted, but frequent cancellations lower your ranking for new jobs.'
    },
    {
      key: 'arrived', tone: 'red', icon: 'pin', title: 'After you arrive',
      when: 'Once you have reached the customer', result: 'Contact support',
      detail: 'A job can no longer be cancelled in the app after arrival. Please raise it with support.'
    }
  ].filter(Boolean);

  return { hours, grace, penalty, stages };
};

/**
 * The text the page shows until the admin writes their own: one explanation section and the common
 * questions. The admin editor can load this as a starting point, so both always match.
 * Returns { sections: [{ title, body }], faqs: [{ question, answer }] }.
 */
export const builtInContent = (audience, graceMinutes = 0) => {
  if (audience === 'user') {
    return {
      sections: [{
        title: 'Why is there a fee?',
        body: 'Professionals set aside their time and travel for your booking. A late cancellation costs them work they could have taken, so the fee compensates them.'
      }],
      faqs: [
        { question: 'Will I get my money back?', answer: 'If you paid online or from your wallet, the refund goes to your Help U wallet. Any cancellation fee is deducted from it first.' },
        { question: 'I pay after the service. How is a fee collected?', answer: 'It is added to your account and charged with your next booking, so nothing is taken from you right away.' },
        { question: 'What if my professional cancels?', answer: 'You are not charged. We try to match you with another professional straight away.' },
        { question: 'Can I change the time instead of cancelling?', answer: 'Yes. Open your booking and choose reschedule to pick a new slot.' }
      ]
    };
  }
  return {
    sections: [{
      title: 'Why is there a penalty?',
      body: 'Customers plan their day around the time you accept. A late cancellation leaves them without help and costs the platform their trust.'
    }],
    faqs: [
      { question: 'Where is a penalty taken from?', answer: 'It is deducted from your earnings balance and shown as a penalty in your wallet history.' },
      { question: 'What happens to the customer?', answer: 'They are matched with another professional when possible; otherwise the booking is cancelled for them.' },
      {
        question: 'Can I cancel by mistake and undo it?',
        answer: graceMinutes > 0
          ? `Cancelling is free for the first ${graceMinutes} minutes after you accept, so a wrong tap costs nothing.`
          : 'Cancellations cannot be undone, so check before you confirm.'
      }
    ]
  };
};

/**
 * One sentence of the customer's cancellation policy, built from the admin's current settings.
 * Shown on service pages so it always matches what is charged.
 */
export const policySummaryLine = (config) => {
  const hours = Number(config.userFreeCancelHours) || 0;
  const grace = Number(config.userFreeCancelGraceMinutes) || 0;
  const fee = feeText(config.userLateCancelFeeType, config.userLateCancelFeeValue, config.userLateCancelFeeMax);

  const freeParts = [];
  if (hours > 0) freeParts.push(`at least ${hoursText(hours)} before your slot`);
  if (grace > 0) freeParts.push(`within ${grace} minutes of your professional accepting`);
  const free = freeParts.length ? `Free cancellation ${freeParts.join(', or ')}.` : 'Free cancellation until a professional is assigned.';
  return fee ? `${free} After that, a cancellation fee of ${fee} applies.` : `${free} After that, cancelling is still free.`;
};
