import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiCheck, FiX, FiEye, FiSearch, FiFilter, FiDownload, FiLoader, FiPower, FiTrash2, FiFileText } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import Modal from '../UserCategories/components/Modal';
import adminWorkerService from '../../../../services/adminWorkerService';
import DataExportButton from '../../components/common/DataExportButton';
import { getPartnerRegistrationFields } from '../../services/workerService';
import { downloadFile } from '../../../../utils/downloadFile';

const Chips = ({ items, tone = 'blue' }) => {
  const list = [...new Set((items || []).map((i) => String(i).trim()).filter(Boolean))];
  if (list.length === 0) return <span className="text-sm text-gray-500">None chosen</span>;
  const tones = { blue: 'bg-blue-50 text-blue-700 border-blue-100', purple: 'bg-purple-50 text-purple-700 border-purple-100', gray: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((t) => <span key={t} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{t}</span>)}
    </div>
  );
};

/** View (opens the file) and Download (saves it) for one document. */
const DocActions = ({ url, name }) => (
  <div className="mt-2 flex flex-wrap items-center gap-4 text-sm font-semibold">
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900">
      <FiEye className="w-4 h-4" /> View Document
    </a>
    <button type="button" onClick={() => downloadFile(url, name)} className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
      <FiDownload className="w-4 h-4" /> Download
    </button>
  </div>
);

const AllWorkers = () => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  // The header search opens this list with ?search=…; follow it when it changes
  const [urlParams] = useSearchParams();
  useEffect(() => {
    const fromUrl = urlParams.get('search');
    if (fromUrl !== null) setSearchQuery(fromUrl);
  }, [urlParams]);

  const [selectedWorker, setSelectedWorker] = useState(null);
  // ?worker=<id> (from a category's "workers" list) opens that worker's details straight away, once
  const workerParam = urlParams.get('worker');
  const openedForParam = useRef(null);
  // What the admin currently calls each signup field, so stored answers show a title and not a key
  const [fieldLabels, setFieldLabels] = useState({});
  useEffect(() => {
    getPartnerRegistrationFields()
      .then((res) => {
        if (res?.success && Array.isArray(res.fields)) {
          setFieldLabels(Object.fromEntries(res.fields.map((f) => [f.fieldKey, f.label])));
        }
      })
      .catch(() => { /* keys are shown instead */ });
  }, []);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Load workers from backend
  useEffect(() => {
    loadWorkers();
  }, []);

  useEffect(() => {
    if (!workerParam || workers.length === 0 || openedForParam.current === workerParam) return;
    const target = workers.find((w) => String(w.id) === String(workerParam));
    if (target) {
      openedForParam.current = workerParam;
      setSelectedWorker(target);
      setIsViewModalOpen(true);
    }
  }, [workerParam, workers]);

  const loadWorkers = async () => {
    try {
      setLoading(true);
      // The API pages its answer (20 by default): fetch every page, otherwise only the 20 newest workers show
      let response = await adminWorkerService.getAllWorkers({ page: 1, limit: 200 });
      if (response.success) {
        const pages = response.pagination?.pages || 1;
        for (let pageNo = 2; pageNo <= Math.min(pages, 25); pageNo += 1) {
          const more = await adminWorkerService.getAllWorkers({ page: pageNo, limit: 200 });
          if (!more.success) break;
          response = { ...response, data: [...response.data, ...more.data] };
        }
      }
      if (response.success) {
        // Transform backend data to frontend format
        const transformedWorkers = response.data.map(worker => ({
          id: worker._id,
          name: worker.name,
          email: worker.email,
          phone: worker.phone,
          alternatePhone: worker.alternatePhone || null,
          businessName: worker.businessName,
          service: worker.service,
          // Services the professional chose at sign-up: the service categories, categories and skills they listed
          categories: Array.isArray(worker.categories) ? worker.categories : [],
          skills: Array.isArray(worker.skills) ? worker.skills : [],
          referralCode: worker.referralCode || '',
          // The referrer comes back as { name, phone, referralCode } (null when nobody referred them)
          referredBy: worker.referredBy && typeof worker.referredBy === 'object' ? worker.referredBy : null,
          approvalStatus: worker.approvalStatus,
          aadhar: worker.aadhar?.number,
          pan: worker.pan?.number,
          gstin: worker.gstin,
          documents: {
            aadhar: worker.aadhar?.document,
            aadharBack: worker.aadhar?.backDocument,
            pan: worker.pan?.document,
            other: worker.otherDocuments?.[0]
          },
          customFields: worker.customFields || {},
          customDocuments: worker.customDocuments || [],
          createdAt: worker.createdAt,
          isActive: worker.isActive,
          serviceRange: worker.settings?.serviceRange ?? null,
          address: worker.address
        }));
        setWorkers(transformedWorkers);
      } else {
        toast.error(response.message || 'Failed to load workers');
      }
    } catch (error) {
      console.error('Error loading workers:', error);
      toast.error('Failed to load workers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkers = useMemo(() => {
    return workers.filter(worker => {
      const serviceString = Array.isArray(worker.service)
        ? worker.service.join(' ')
        : (worker.service || '');

      const matchesStatus = filterStatus === 'all' || worker.approvalStatus === filterStatus;

      const matchesSearch =
        worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        worker.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        worker.phone.includes(searchQuery) ||
        serviceString.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (worker.businessName && worker.businessName.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [workers, filterStatus, searchQuery]);

  const handleApprove = async (vendorId) => {
    try {
      const response = await adminWorkerService.approveWorker(vendorId);
      if (response.success) {
        setWorkers(prev => prev.map(v =>
          v.id === vendorId ? { ...v, approvalStatus: 'approved' } : v
        ));
        toast.success('Worker approved successfully!');
      } else {
        toast.error(response.message || 'Failed to approve worker');
      }
    } catch (error) {
      console.error('Error approving worker:', error);
      toast.error('Failed to approve worker. Please try again.');
    }
  };

  const handleReject = async (vendorId) => {
    try {
      const response = await adminWorkerService.rejectWorker(vendorId);
      if (response.success) {
        setWorkers(prev => prev.map(v =>
          v.id === vendorId ? { ...v, approvalStatus: 'rejected' } : v
        ));
        toast.success('Worker rejected successfully.');
      } else {
        toast.error(response.message || 'Failed to reject worker');
      }
    } catch (error) {
      console.error('Error rejecting worker:', error);
      toast.error('Failed to reject worker. Please try again.');
    }
  };

  const handleToggleStatus = async (vendorId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      const response = await adminWorkerService.toggleStatus(vendorId, newStatus);
      if (response.success) {
        setWorkers(prev => prev.map(v =>
          v.id === vendorId ? { ...v, isActive: newStatus } : v
        ));
        toast.success(`Worker ${newStatus ? 'activated' : 'deactivated'} successfully`);
      } else {
        toast.error(response.message || 'Failed to update worker status');
      }
    } catch (error) {
      console.error('Error toggling worker status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (vendorId) => {
    if (!window.confirm('Are you sure you want to delete this worker? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await adminWorkerService.deleteWorker(vendorId);
      if (response.success) {
        setWorkers(prev => prev.filter(v => v.id !== vendorId));
        toast.success('Worker deleted successfully');
      } else {
        toast.error(response.message || 'Failed to delete worker');
      }
    } catch (error) {
      console.error('Error deleting worker:', error);
      toast.error('Failed to delete worker');
    }
  };

  const handleViewDetails = (worker) => {
    setSelectedWorker(worker);
    setIsViewModalOpen(true);
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      approved: 'bg-green-100 text-green-800 border-green-300',
      rejected: 'bg-red-100 text-red-800 border-red-300'
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const pendingCount = workers.filter(v => v.approvalStatus === 'pending').length;
  const approvedCount = workers.filter(v => v.approvalStatus === 'approved').length;
  const rejectedCount = workers.filter(v => v.approvalStatus === 'rejected').length;

  return (
    <div className="space-y-4">
      <CardShell
        icon={FiFilter}
        title="Worker Management"
        subtitle="Manage and verify platform workers"
      >
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider mb-1">Pending</div>
            <div className="text-xl font-bold text-yellow-900">{pendingCount}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">Approved</div>
            <div className="text-xl font-bold text-green-900">{approvedCount}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Rejected</div>
            <div className="text-xl font-bold text-red-900">{rejectedCount}</div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search workers by name, phone, email, service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-xs"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['all', 'pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${filterStatus === status
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <DataExportButton
              entity="workers"
              label="workers"
              params={{ search: searchQuery.trim(), approvalStatus: filterStatus === 'all' ? undefined : filterStatus }}
              filterText={[searchQuery.trim() && `search "${searchQuery.trim()}"`, filterStatus !== 'all' && `${filterStatus} only`].filter(Boolean).join(', ')}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Worker Details</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Business / Skill Info</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-500">Loading workers...</td>
                  </tr>
                ) : filteredWorkers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-xs text-gray-500">No workers found</td>
                  </tr>
                ) : (
                  filteredWorkers.map((worker) => (
                    <tr key={worker.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-900 text-xs">{worker.name}</p>
                          <p className="text-[10px] text-gray-500">{worker.phone}</p>
                          <p className="text-[10px] text-gray-400">{worker.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-gray-800 text-xs">{worker.businessName || 'N/A'}</p>
                          <p className="text-[10px] text-blue-600 font-medium">
                            {Array.isArray(worker.service) ? worker.service.join(', ') : (worker.service || 'No service')}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${worker.approvalStatus === 'approved' ? 'bg-green-50 text-green-700 border-green-100' :
                          worker.approvalStatus === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                            'bg-yellow-50 text-yellow-700 border-yellow-100'
                          }`}>
                          {worker.approvalStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* View Details */}
                          <button
                            onClick={() => handleViewDetails(worker)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Active Status */}
                          <button
                            onClick={() => handleToggleStatus(worker.id, worker.isActive)}
                            className={`p-1.5 rounded-lg transition-colors ${worker.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                            title={worker.isActive ? "Disable Login" : "Enable Login"}
                          >
                            <FiPower className={`w-3.5 h-3.5 ${worker.isActive ? 'fill-current' : ''}`} />
                          </button>

                          {/* Approve/Reject (Only for pending) */}
                          {worker.approvalStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(worker.id)}
                                className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                                title="Approve"
                              >
                                <FiCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReject(worker.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Reject"
                              >
                                <FiX className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* Delete Worker */}
                          <button
                            onClick={() => handleDelete(worker.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Worker"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardShell >

      {/* View Worker Details Modal */}
      < Modal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedWorker(null);
        }}
        title="Worker Details"
        size="lg"
      >
        {selectedWorker && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Business / Agency Name</label>
                <div className="text-gray-900">{selectedWorker.businessName || 'N/A'}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Worker Name</label>
                <div className="text-gray-900">{selectedWorker.name}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <div className="text-gray-900">{selectedWorker.email}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                <div className="text-gray-900">{selectedWorker.phone}</div>
              </div>
              {selectedWorker.alternatePhone && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Alternate Phone</label>
                  <div className="text-gray-900">{selectedWorker.alternatePhone}</div>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">PAN Number</label>
                <div className="text-gray-900 font-mono font-medium">{selectedWorker.pan || 'N/A'}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">GSTIN (Optional)</label>
                <div className="text-gray-900 font-mono font-medium">{selectedWorker.gstin || 'Not Provided (Optional)'}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                <div>{getStatusBadge(selectedWorker.approvalStatus)}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Registered On</label>
                <div className="text-gray-900">
                  {new Date(selectedWorker.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Active</label>
                <div className={`text-sm font-semibold ${selectedWorker.isActive ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedWorker.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Service Radius</label>
                <div className="text-gray-900 font-medium">
                  {selectedWorker.serviceRange ? `${selectedWorker.serviceRange} km (Custom)` : 'Platform Default'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Home Map Location</label>
                <div className={`text-sm font-medium ${selectedWorker.address?.lat && selectedWorker.address?.lng ? 'text-green-600' : 'text-amber-600'}`}>
                  {selectedWorker.address?.lat && selectedWorker.address?.lng ? 'Coordinates Saved' : 'No Coordinates (Uses Platform Radius)'}
                </div>
              </div>
            </div>

            {/* Referral: their own code, and who brought them in (if anyone) */}
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Referral code</label>
                <div className="text-gray-900 font-mono font-semibold" data-testid="worker-referral-code">{selectedWorker.referralCode || 'Not generated'}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Referred by</label>
                {selectedWorker.referredBy ? (
                  <div className="text-gray-900" data-testid="worker-referred-by">
                    <span className="font-medium">{selectedWorker.referredBy.businessName || selectedWorker.referredBy.name || 'Another professional'}</span>
                    {selectedWorker.referredBy.phone && <span className="block text-xs text-gray-500">{selectedWorker.referredBy.phone}</span>}
                    {selectedWorker.referredBy.referralCode && <span className="block text-xs font-mono text-gray-500">Code {selectedWorker.referredBy.referralCode}</span>}
                  </div>
                ) : (
                  <div className="text-gray-500 text-sm" data-testid="worker-referred-by">Not referred by anyone</div>
                )}
              </div>
            </div>

            {/* Services the professional chose at sign-up */}
            <div className="space-y-3" data-testid="worker-services">
              <label className="block text-sm font-semibold text-gray-700">Services chosen</label>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Services</p>
                <Chips items={Array.isArray(selectedWorker.service) ? selectedWorker.service : [selectedWorker.service]} />
              </div>
              {(selectedWorker.categories || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Categories</p>
                  <Chips items={selectedWorker.categories} tone="purple" />
                </div>
              )}
              {(selectedWorker.skills || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Skills</p>
                  <Chips items={selectedWorker.skills} tone="gray" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Verification Documents</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedWorker.documents.aadhar && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">{fieldLabels.aadhar_front || 'Aadhar Front'}</label>
                    <img
                      src={selectedWorker.documents.aadhar}
                      alt="Aadhar Front"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <DocActions url={selectedWorker.documents.aadhar} name={`${selectedWorker.name} - Aadhar front`} />
                  </div>
                )}
                {selectedWorker.documents.aadharBack && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">{fieldLabels.aadhar_back || 'Aadhar Back'}</label>
                    <img
                      src={selectedWorker.documents.aadharBack}
                      alt="Aadhar Back"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <DocActions url={selectedWorker.documents.aadharBack} name={`${selectedWorker.name} - Aadhar back`} />
                  </div>
                )}
                {selectedWorker.documents.pan && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">{fieldLabels.pan_document || 'PAN Card'}</label>
                    <img
                      src={selectedWorker.documents.pan}
                      alt="PAN"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <DocActions url={selectedWorker.documents.pan} name={`${selectedWorker.name} - PAN card`} />
                  </div>
                )}

                {/* Dynamic Custom Documents */}
                {Array.isArray(selectedWorker.customDocuments) && selectedWorker.customDocuments.map((doc, idx) => {
                  const isPdf = doc.url?.toLowerCase().endsWith('.pdf') || doc.fileType?.includes('pdf');
                  return (
                    <div key={idx} className="bg-gray-50/70 p-2.5 rounded-xl border border-gray-200">
                      <label className="block text-xs font-bold text-gray-700 mb-2 truncate">
                        {fieldLabels[doc.fieldKey] || doc.label || doc.fieldKey || `Document #${idx + 1}`}
                      </label>
                      {isPdf ? (
                        <div className="w-full h-48 bg-red-50/40 rounded-lg border-2 border-dashed border-red-200 flex flex-col items-center justify-center p-4">
                          <FiFileText className="w-12 h-12 text-red-500 mb-2" />
                          <span className="text-xs font-bold text-gray-800 text-center truncate max-w-full">
                            {doc.fileName || 'PDF Document'}
                          </span>
                        </div>
                      ) : (
                        <img
                          src={doc.url}
                          alt={doc.label || 'Document'}
                          className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                        />
                      )}
                      <DocActions url={doc.url} name={`${selectedWorker.name} - ${fieldLabels[doc.fieldKey] || doc.label || doc.fieldKey || `document ${idx + 1}`}`} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Custom Text Fields */}
            {selectedWorker.customFields && Object.keys(selectedWorker.customFields).length > 0 && (
              <div className="pt-4 border-t border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-3">Additional Details</label>
                <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                  {Object.entries(selectedWorker.customFields).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0.5">
                        {fieldLabels[key] || key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {value !== null && value !== undefined && value !== '' ? String(value) : 'Not Provided'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedWorker.approvalStatus === 'pending' && (
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={async () => {
                    await handleApprove(selectedWorker.id);
                    setIsViewModalOpen(false);
                    setSelectedWorker(null);
                  }}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiCheck className="w-5 h-5" />
                  Approve Worker
                </button>
                <button
                  onClick={async () => {
                    await handleReject(selectedWorker.id);
                    setIsViewModalOpen(false);
                    setSelectedWorker(null);
                  }}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiX className="w-5 h-5" />
                  Reject Worker
                </button>
              </div>
            )}
          </div>
        )}
      </Modal >
    </div >
  );
};

export default AllWorkers;
