import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiX, FiEye, FiSearch, FiFilter, FiDownload, FiLoader, FiPower, FiTrash2 } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import Modal from '../UserCategories/components/Modal';
import adminWorkerService from '../../../../services/adminWorkerService';

const AllWorkers = () => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Load workers from backend
  useEffect(() => {
    loadWorkers();
  }, []);

  const loadWorkers = async () => {
    try {
      setLoading(true);
      const response = await adminWorkerService.getAllWorkers();
      if (response.success) {
        // Transform backend data to frontend format
        const transformedWorkers = response.data.map(worker => ({
          id: worker._id,
          name: worker.name,
          email: worker.email,
          phone: worker.phone,
          businessName: worker.businessName,
          service: worker.service,
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
          createdAt: worker.createdAt,
          isActive: worker.isActive
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
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search workers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-xs"
            />
          </div>
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
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Verification Documents</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedWorker.documents.aadhar && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">Aadhar Front</label>
                    <img
                      src={selectedWorker.documents.aadhar}
                      alt="Aadhar Front"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <a
                      href={selectedWorker.documents.aadhar}
                      download
                      className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <FiDownload className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                )}
                {selectedWorker.documents.aadharBack && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">Aadhar Back</label>
                    <img
                      src={selectedWorker.documents.aadharBack}
                      alt="Aadhar Back"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <a
                      href={selectedWorker.documents.aadharBack}
                      download
                      className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <FiDownload className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                )}
                {selectedWorker.documents.pan && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">PAN Card</label>
                    <img
                      src={selectedWorker.documents.pan}
                      alt="PAN"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <a
                      href={selectedWorker.documents.pan}
                      download
                      className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <FiDownload className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                )}
              </div>
            </div>

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
