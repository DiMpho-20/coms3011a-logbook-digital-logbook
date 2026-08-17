import React, { useState } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { AuthUser } from './Auth';

interface LogbookInputProps {
  currentUser: AuthUser;
}

export const LogbookInput: React.FC<LogbookInputProps> = ({ currentUser }) => {
  const [formData, setFormData] = useState({
    vesselName: 'Ocean Pioneer',
    latitude: '',
    longitude: '',
    speed: '',
    notes: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">New Logbook Entry</h2>
        <p className="text-sm text-slate-500">Record current position and navigation metrics.</p>
      </div>

      {submitted && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="h-5 w-5 text-emerald-600" />
          Entry recorded successfully for validation.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Vessel</label>
          <select
            value={formData.vesselName}
            onChange={e => setFormData({ ...formData, vesselName: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="Ocean Pioneer">Ocean Pioneer (IMO 9876543)</option>
            <option value="Sea Voyager">Sea Voyager (IMO 9123456)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
            <input
              type="text"
              placeholder="e.g. 34.0522 N"
              value={formData.latitude}
              onChange={e => setFormData({ ...formData, latitude: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
            <input
              type="text"
              placeholder="e.g. 118.2437 W"
              value={formData.longitude}
              onChange={e => setFormData({ ...formData, longitude: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Speed (Knots)</label>
          <input
            type="number"
            placeholder="14"
            value={formData.speed}
            onChange={e => setFormData({ ...formData, speed: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Operational Notes</label>
          <textarea
            rows={4}
            placeholder="Enter route details, engine status, or weather comments..."
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium transition-colors"
        >
          <Save className="h-5 w-5" />
          Submit Entry Log
        </button>
      </form>
    </div>
  );
};
