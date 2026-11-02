import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import StateCityFields from '../../components/StateCityFields';
import { toast } from 'react-hot-toast';
import { cityService } from '../../services/cityService';
import { HiPlus, HiPencil, HiTrash, HiCheck, HiX, HiArrowLeft, HiSearch, HiExclamation, HiChevronRight } from 'react-icons/hi';
import { groupCitiesByState } from '../../../../data/indiaStatesCities';
import ModalLock from '../../../../components/common/ModalLock';

const CityManagement = () => {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState(null);

  // States first; opening one shows its cities. The state is kept in the address (?state=Karnataka) so
  // a refresh, the back button or a shared link lands on the same view.
  const [params, setParams] = useSearchParams();
  const openState = params.get('state');
  const [search, setSearch] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    state: '',
    country: 'India',
    isActive: true,
    isDefault: false
  });

  const fetchCities = async () => {
    try {
      setLoading(true);
      const response = await cityService.getAll();
      if (response.success) {
        setCities(response.cities);
      }
    } catch (error) {
      toast.error('Failed to load cities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCities();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCity) {
        await cityService.update(editingCity._id, formData);
        toast.success('City updated successfully');
      } else {
        await cityService.create(formData);
        toast.success('City created successfully');
      }
      setIsModalOpen(false);
      setEditingCity(null);
      resetForm();
      fetchCities();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this city?')) return;
    try {
      await cityService.delete(id);
      toast.success('City deleted successfully');
      fetchCities();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  // Find a city on the map (its position is stored, so the Zones map can centre on it)
  const [locating, setLocating] = useState({});
  const handleLocate = async (id, quiet = false) => {
    setLocating((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await cityService.locate(id);
      if (!quiet) toast.success(res.message || 'Located');
      return true;
    } catch (error) {
      if (!quiet) toast.error(error.response?.data?.message || 'Could not locate this city');
      return false;
    } finally {
      setLocating((prev) => ({ ...prev, [id]: false }));
      if (!quiet) fetchCities();
    }
  };

  const hasPosition = (c) => Number.isFinite(Number(c.location?.lat)) && Number.isFinite(Number(c.location?.lng)) && c.location?.lat !== null;

  const handleLocateAll = async (list) => {
    let ok = 0;
    for (const c of list) {
      if (await handleLocate(c._id, true)) ok += 1;
    }
    toast[ok === list.length ? 'success' : 'error'](`Located ${ok} of ${list.length} ${list.length === 1 ? 'city' : 'cities'}`);
    fetchCities();
  };

  const handleToggleStatus = async (id) => {
    try {
      await cityService.toggleStatus(id);
      toast.success('Status updated');
      fetchCities();
    } catch (error) {
      toast.error('Status update failed');
    }
  };

  const openEditModal = (city) => {
    setEditingCity(city);
    setFormData({
      name: city.name,
      state: city.state,
      country: city.country,
      isActive: city.isActive,
      isDefault: city.isDefault
    });
    setIsModalOpen(true);
  };

  const openCreateModal = (state = '') => {
    setEditingCity(null);
    resetForm();
    if (state) setFormData((prev) => ({ ...prev, state }));
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      state: '',
      country: 'India',
      isActive: true,
      isDefault: false
    });
  };

  const groups = useMemo(() => groupCitiesByState(cities), [cities]);

  return (
    <div className="p-6">
      {(() => {
        const group = groups.find((g) => g.key === openState || g.name === openState) || null;
        const query = search.trim().toLowerCase();
        const shownGroups = query
          ? groups.filter((g) => g.name.toLowerCase().includes(query) || g.cities.some((c) => String(c.name).toLowerCase().includes(query)))
          : groups;

        return (
          <>
            <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
              <div>
                {group ? (
                  <button
                    type="button"
                    onClick={() => setParams({})}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-1"
                  >
                    <HiArrowLeft className="w-4 h-4" /> All states
                  </button>
                ) : null}
                <h1 className="text-2xl font-bold text-gray-800">
                  {group ? group.name : 'City Management'}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {group
                    ? `${group.cities.length} ${group.cities.length === 1 ? 'city' : 'cities'} in ${group.name} · ${group.activeCount} active`
                    : `${groups.length} ${groups.length === 1 ? 'state' : 'states'} · ${cities.length} ${cities.length === 1 ? 'city' : 'cities'}. Open a state to see and manage its cities.`}
                </p>
              </div>
              <button
                onClick={() => openCreateModal(group && group.listed ? group.name : '')}
                className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors"
              >
                <HiPlus /> {group ? `Add city in ${group.name}` : 'Add City'}
              </button>
            </div>

            {/* ── Level 1: states ── */}
            {!group && (
              <>
                <div className="relative max-w-md mb-4">
                  <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search a state or a city"
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {openState && !group && !loading && (
                  <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    There are no cities in "{openState}". <button type="button" className="font-semibold underline" onClick={() => setParams({})}>Show all states</button>
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {shownGroups.map((g) => {
                    const dupCount = Math.ceil(Object.keys(g.duplicates).length / 2);
                    const matched = query ? g.cities.filter((c) => String(c.name).toLowerCase().includes(query)).map((c) => c.name) : [];
                    return (
                      <button
                        type="button"
                        key={g.key}
                        onClick={() => setParams({ state: g.name })}
                        className="text-left bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-teal-300 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-gray-900 truncate">{g.name}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {g.cities.length} {g.cities.length === 1 ? 'city' : 'cities'}
                            </p>
                          </div>
                          <HiChevronRight className="w-5 h-5 text-gray-300 group-hover:text-teal-600 shrink-0 mt-1" />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{g.activeCount} active</span>
                          {g.cities.length - g.activeCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{g.cities.length - g.activeCount} inactive</span>
                          )}
                          {g.hasDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700"><HiCheck /> Default city</span>
                          )}
                          {dupCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800" title="The same place saved under two names">
                              <HiExclamation /> {dupCount} duplicate{dupCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-xs text-gray-400 truncate">
                          {(matched.length ? matched : g.cities.map((c) => c.name)).slice(0, 5).join(', ')}
                          {(matched.length ? matched : g.cities).length > 5 ? '…' : ''}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {!loading && shownGroups.length === 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">
                    {query ? 'No state or city matches your search.' : 'No cities found. Add your first city!'}
                  </div>
                )}
              </>
            )}

            {/* ── Level 2: the cities of one state ── */}
            {group && group.cities.some((c) => !hasPosition(c)) && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                <span>
                  {group.cities.filter((c) => !hasPosition(c)).length} {group.cities.filter((c) => !hasPosition(c)).length === 1 ? 'city has' : 'cities have'} no map position yet,
                  so the Zones map has to look them up each time.
                </span>
                <button
                  type="button"
                  onClick={() => handleLocateAll(group.cities.filter((c) => !hasPosition(c)))}
                  className="font-semibold underline"
                >
                  Locate them now
                </button>
              </div>
            )}
            {group && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="p-4 font-semibold text-gray-600">City</th>
                      <th className="p-4 font-semibold text-gray-600">Slug</th>
                      <th className="p-4 font-semibold text-gray-600">Map position</th>
                      <th className="p-4 font-semibold text-gray-600">Status</th>
                      <th className="p-4 font-semibold text-gray-600">Default</th>
                      <th className="p-4 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.cities.map((city) => (
                      <tr key={city._id} className="hover:bg-gray-50/50">
                        <td className="p-4">
                          <span className="font-medium text-gray-900">{city.name}</span>
                          {group.duplicates[city._id] && (
                            <span
                              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800"
                              title="The same place is saved twice. Keep one and delete the other once nothing uses it."
                            >
                              <HiExclamation /> Same place as {group.duplicates[city._id]}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-gray-500 text-sm">{city.slug}</td>
                        <td className="p-4 text-sm">
                          {hasPosition(city) ? (
                            <span className="text-gray-600" title={city.location.source === 'manual' ? 'Set by hand' : 'Found from the city name'}>
                              {Number(city.location.lat).toFixed(4)}, {Number(city.location.lng).toFixed(4)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleLocate(city._id)}
                              disabled={!!locating[city._id]}
                              className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-60"
                            >
                              {locating[city._id] ? 'Locating…' : 'Not located · Locate'}
                            </button>
                          )}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => handleToggleStatus(city._id)}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${city.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                              }`}
                          >
                            {city.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="p-4">
                          {city.isDefault ? (
                            <span className="flex items-center gap-1 text-teal-600 text-sm font-medium">
                              <HiCheck /> Default
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(city)}
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <HiPencil className="w-5 h-5" />
                            </button>
                            {!city.isDefault && (
                              <button
                                onClick={() => handleDelete(city._id)}
                                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <HiTrash className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      })()}

      {/* Edit/Create Modal - Inline Implementation for simplicity if common modal not found easily */}
      {/* Assuming we might want a simple overlay here if we don't use the common Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <ModalLock />
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-lg">{editingCity ? 'Edit City' : 'Add City'}</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:bg-gray-200 rounded-full p-1"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <StateCityFields
                state={formData.state}
                city={formData.name}
                existingCities={cities}
                editingId={editingCity?._id || editingCity?.id || null}
                onChange={({ state, city }) => setFormData({ ...formData, state, name: city })}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                    disabled={editingCity?.isDefault} // Cannot unset default directly, must set another
                  />
                  <span className="text-sm text-gray-700">Default City</span>
                </label>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
                >
                  {editingCity ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default CityManagement;
