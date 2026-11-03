/**
 * Cancelling a booking, safely.
 *
 * The status change is ONE conditional database update, made before any refund, fee or coupon work. So:
 *   - a booking that is already completed (or past the point a cancel is allowed) can never be cancelled,
 *     even if the request was prepared on an old copy of the booking
 *   - two cancels at the same moment cannot both win, so money is never refunded twice
 *   - a completion that lands first stays completed
 * If the work after the claim fails, rollbackCancellation() puts the booking back so the cancel can be retried.
 */

const Booking = require('../models/Booking');
const { BOOKING_STATUS } = require('../utils/constants');

/**
 * Moves the booking to cancelled only if it is still in one of `allowedStatuses`.
 * Returns the booking as it was BEFORE the change (so its previous status is known), or null when the
 * booking is missing or no longer in an allowed status.
 */
const claimCancellation = (bookingId, { allowedStatuses, by, reason, filter = {}, extra = {} }) =>
  Booking.findOneAndUpdate(
    { _id: bookingId, status: { $in: allowedStatuses }, ...filter },
    {
      $set: {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: by,
        cancellationReason: reason,
        ...extra
      }
    },
    { new: false, actor: by }
  );

/**
 * Undoes a claim whose follow-up work failed, but only if the booking is still in the cancelled state we put it in.
 */
const rollbackCancellation = (bookingId, previous, { by, restore = {} } = {}) =>
  Booking.findOneAndUpdate(
    { _id: bookingId, status: BOOKING_STATUS.CANCELLED, cancelledBy: by },
    {
      $set: { status: previous.status, ...restore },
      $unset: { cancelledAt: '', cancelledBy: '', cancellationReason: '', cancellationFee: '' }
    },
    { new: false, actor: 'system' }
  );

/**
 * What to tell the caller when a cancel is refused, based on where the booking is now.
 */
const explainRefusal = (status) => {
  switch (status) {
    case BOOKING_STATUS.CANCELLED:
      return 'Booking is already cancelled';
    case BOOKING_STATUS.COMPLETED:
      return 'Cannot cancel completed booking';
    case BOOKING_STATUS.WORK_DONE:
      return 'The work on this booking is already finished, so it can no longer be cancelled. If something is wrong, please raise a dispute.';
    case BOOKING_STATUS.VISITED:
      return 'Your professional has already arrived, so this booking can no longer be cancelled. If there is a problem, please contact support.';
    case BOOKING_STATUS.IN_PROGRESS:
      return 'The work on this booking has already started, so it can no longer be cancelled. If there is a problem, please contact support.';
    case BOOKING_STATUS.REJECTED:
      return 'This booking has already ended';
    default:
      return 'This booking can no longer be cancelled';
  }
};

module.exports = { claimCancellation, rollbackCancellation, explainRefusal };
