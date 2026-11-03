import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FiArrowLeft, FiUser, FiBriefcase, FiMapPin, FiCalendar, FiCreditCard, FiClock,
  FiUserCheck, FiXCircle, FiNavigation, FiLoader, FiAlertCircle
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { adminBookingService } from '../../../../services/adminBookingService';
import ConfirmDialog from '../../../../components/common/ConfirmDialog';
import AssignWorkerModal from './AssignWorkerModal';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const label = (s) => String(s || '').replace(/_/g, ' ');

const STATUS_STYLE = {
  completed: 'bg-green-100 text-green-700',
  work_done: 'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-blue-100 text-blue-700',
  visited: 'bg-purple-100 text-purple-700',
  journey_started: 'bg-purple-100 text-purple-700',
  assigned: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700'
};

const WHO = { user: 'Customer', worker: 'Professional', vendor: 'Professional', admin: 'Admin', system: 'System' };

const Card = ({ title, icon: Icon, children, className = '' }) => (
  <div className={`rounded-xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
    <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
      {Icon && <Icon className="h-4 w-4" />} {title}
    </h2>
    {children}
  </div>
);

const Row = ({ name, children, strong }) => (
  <div className="flex items-start justify-between gap-4 py-1 text-sm">
    <span className="text-gray-500">{name}</span>
    <span className={`text-right ${strong ? 'font-bold text-gray-900' : 'text-gray-800'}`}>{children}</span>
  </div>
);

/**
 * The page content for one booking. Kept apart from loading and the dialogs so it can be rendered on its own.
 */
export const BookingDetailView = ({ booking, onBack, onAssign, onCancel }) => {
  const customer = booking.userId || {};
  const pro = booking.vendorId || null;
  const address = booking.address || {};
  const actions = booking.adminActions || {};
  const history = [...(booking.statusHistory || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  const ended = ['cancelled', 'rejected'].includes(booking.status);
  const mapLink = address.lat && address.lng ? `https://www.google.com/maps?q=${address.lat},${address.lng}` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-2 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <FiArrowLeft /> Back
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Booking #{booking.bookingNumber}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${STATUS_STYLE[booking.status] || 'bg-yellow-100 text-yellow-700'}`}>
              {label(booking.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Placed {fmtDateTime(booking.createdAt)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/admin/bookings/tracking" className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <FiNavigation /> Tracking
          </Link>
          {actions.canAssign && (
            <button type="button" onClick={onAssign} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
              <FiUserCheck /> Assign professional
            </button>
          )}
          {actions.canCancel && (
            <button type="button" onClick={onCancel} className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100">
              <FiXCircle /> Cancel booking
            </button>
          )}
        </div>
      </div>

      {ended && (
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
          <FiXCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div className="text-sm">
            <p className="font-bold capitalize text-red-700">
              {booking.status}{booking.cancelledBy ? ` by ${(WHO[booking.cancelledBy] || booking.cancelledBy).toLowerCase()}` : ''}
              {booking.cancelledAt ? ` · ${fmtDateTime(booking.cancelledAt)}` : ''}
            </p>
            {booking.cancellationReason && <p className="text-red-600">{booking.cancellationReason}</p>}
            {Number(booking.cancellationFee) > 0 && <p className="text-red-600">Cancellation fee: {money(booking.cancellationFee)}</p>}
            {Number(booking.refundedAmount) > 0 && <p className="text-red-600">Refunded to the customer: {money(booking.refundedAmount)}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Service" icon={FiBriefcase}>
            <p className="text-base font-bold text-gray-900">{booking.serviceName || booking.serviceId?.title || '—'}</p>
            <p className="text-sm text-gray-500">
              {[booking.serviceCategory || booking.categoryId?.title, booking.brandName].filter(Boolean).join(' · ') || '—'}
            </p>
            {(booking.bookedItems || []).length > 0 && (
              <ul className="mt-3 divide-y divide-gray-50 rounded-lg border border-gray-100">
                {booking.bookedItems.map((item, i) => (
                  <li key={i} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-gray-800">{item.card?.title || item.card?.name || item.serviceName || item.brandName || 'Item'}</span>
                    <span className="text-gray-500">× {item.quantity || 1}</span>
                  </li>
                ))}
              </ul>
            )}
            {(booking.addOns || []).length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Add-ons</p>
                {booking.addOns.map((a, i) => (
                  <Row key={i} name={`${a.title} × ${a.quantity}`}>{money(a.total ?? a.price * a.quantity)}</Row>
                ))}
              </div>
            )}
            {booking.customerNotes && (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700"><span className="font-semibold">Customer note: </span>{booking.customerNotes}</p>
            )}
          </Card>

          <Card title="Schedule and address" icon={FiCalendar}>
            <Row name="Type" strong>{label(booking.bookingType)}</Row>
            <Row name="Date">{fmtDate(booking.scheduledDate)}</Row>
            <Row name="Time">{booking.scheduledTime || '—'}</Row>
            <div className="mt-2 flex items-start gap-2 border-t border-gray-50 pt-3 text-sm text-gray-800">
              <FiMapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p>{[address.addressLine1, address.addressLine2, address.landmark].filter(Boolean).join(', ')}</p>
                <p className="text-gray-500">{[address.city, address.state, address.pincode].filter(Boolean).join(', ')}</p>
                {mapLink && <a href={mapLink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:underline">Open in Maps</a>}
              </div>
            </div>
          </Card>

          <Card title="Timeline" icon={FiClock}>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">No history recorded.</p>
            ) : (
              <ol className="relative space-y-4 border-l-2 border-gray-100 pl-5">
                {history.map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500 ring-2 ring-blue-100" />
                    <p className="text-sm font-semibold capitalize text-gray-900">
                      {h.event === 'created' ? 'Booking placed' : h.event === 'payment' ? 'Payment received' : h.event === 'refunded' ? 'Refunded' : label(h.status)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {fmtDateTime(h.at)}{h.by ? ` · ${WHO[h.by] || h.by}` : ''}
                    </p>
                    {h.note && <p className="mt-0.5 text-xs text-gray-600">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Customer" icon={FiUser}>
            <p className="text-base font-bold text-gray-900">{customer.name || 'Guest'}</p>
            {customer.phone && <p className="text-sm text-gray-600">{customer.phone}</p>}
            {customer.email && <p className="text-sm text-gray-600">{customer.email}</p>}
          </Card>

          <Card title="Professional" icon={FiBriefcase}>
            {pro ? (
              <>
                <p className="text-base font-bold text-gray-900">{pro.businessName || pro.name}</p>
                {pro.businessName && pro.name && <p className="text-sm text-gray-600">{pro.name}</p>}
                {pro.phone && <p className="text-sm text-gray-600">{pro.phone}</p>}
              </>
            ) : (
              <p className="text-sm text-gray-500">{booking.awaitingAdmin ? 'Waiting for an admin to assign one' : 'Not assigned yet'}</p>
            )}
          </Card>

          <Card title="Payment" icon={FiCreditCard}>
            <Row name="Method">{label(booking.paymentMethod) || '—'}</Row>
            <Row name="Status">{label(booking.paymentStatus) || '—'}</Row>
            <div className="my-2 border-t border-gray-50" />
            <Row name="Service price">{money(booking.basePrice)}</Row>
            {Number(booking.discount) > 0 && <Row name="Discount">− {money(booking.discount)}</Row>}
            {booking.couponCode && <Row name={`Coupon ${booking.couponCode}`}>− {money(booking.couponDiscount)}</Row>}
            {Number(booking.addOnsTotal) > 0 && <Row name="Add-ons">{money(booking.addOnsTotal)}</Row>}
            {Number(booking.emergencyCharge) > 0 && <Row name="Emergency charge">{money(booking.emergencyCharge)}</Row>}
            {Number(booking.tax) > 0 && <Row name="GST">{money(booking.tax)}</Row>}
            {Number(booking.visitingCharges) > 0 && <Row name="Visiting charge">{money(booking.visitingCharges)}</Row>}
            {Number(booking.penalty) > 0 && <Row name="Earlier cancellation fee">{money(booking.penalty)}</Row>}
            <div className="my-2 border-t border-gray-100" />
            <Row name="Total" strong>{money(booking.finalAmount)}</Row>
            {Number(booking.refundedAmount) > 0 && <Row name="Refunded">{money(booking.refundedAmount)}</Row>}
          </Card>
        </div>
      </div>
    </div>
  );
};

/**
 * One booking, start to finish: who booked it, who is doing it, where and when, what it costs,
 * and everything that happened to it. Admin actions (assign, cancel) appear only when allowed.
 */
const BookingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminBookingService.getBookingById(id);
      setBooking(res.data);
      setError(null);
    } catch (err) {
      setBooking(null);
      setError(err?.message || 'Could not load this booking');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const handleCancel = async () => {
    setCancelling(false);
    try {
      await adminBookingService.cancelBooking(booking._id, 'Cancelled by admin');
      toast.success('Booking cancelled');
      load();
    } catch (err) {
      toast.error(err?.message || 'Failed to cancel the booking');
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><FiLoader className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  if (error || !booking) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <FiAlertCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <h1 className="text-lg font-bold text-gray-900">Booking not found</h1>
        <p className="mt-1 text-sm text-gray-500">{error || 'This booking does not exist or was removed.'}</p>
        <Link to="/admin/bookings" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
          <FiArrowLeft /> Back to bookings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BookingDetailView
        booking={booking}
        onBack={() => navigate(-1)}
        onAssign={() => setAssigning(true)}
        onCancel={() => setCancelling(true)}
      />

      {assigning && (
        <AssignWorkerModal
          booking={booking}
          onClose={() => setAssigning(false)}
          onAssigned={() => { setAssigning(false); toast.success('Request sent to the professional'); load(); }}
        />
      )}

      <ConfirmDialog
        isOpen={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={handleCancel}
        type="danger"
        title="Cancel this booking?"
        message={`#${booking.bookingNumber} will be cancelled and anything the customer paid will be refunded to their wallet.`}
        confirmLabel="Cancel booking"
        cancelLabel="Keep it"
      />
    </div>
  );
};

export default BookingDetail;
